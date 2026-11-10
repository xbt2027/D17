"""Offline review of published Zod packages and an UNINSTALLED bounded backport.

Requires the pinned Node 24.22.1 on PATH and the project's npm ci --ignore-scripts install.
Never edits node_modules, package declarations or the lockfile.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence/cloud-dependencies-2026-10-30"
PACKAGES = {
    "3.25.76": "9e1f1a05f0dd0c1dab64ee91ceb9bf55cd44d35368c70edda80a2fdc70a88377",
    "4.6.5": "a78c0c533de30dc1c4afc259ac43ac06e390cb0da8d2e32eae355301b50b36fc",
    "4.6.6": "312553620ac82cbb25d505100fbb41c1e219b3cd6979cf93c3a1b4dd5b79e039",
    "4.6.7": "84efd155bed93270286e793fc951be270b536cbd5b0eeb111f0fa3967201d698",
}

with tempfile.TemporaryDirectory(prefix="d17-zod-review-") as work:
    work = Path(work)
    for version, expected in PACKAGES.items():
        archive = EVIDENCE / "upstream-tarballs" / f"zod-{version}.tgz"
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
        with tarfile.open(archive) as source:
            for member in source.getmembers():
                name = Path(member.name)
                assert not name.is_absolute() and ".." not in name.parts
                assert name.parts[0] == "package"
                assert member.isdir() or member.isfile()
            source.extractall(work / version, filter="data")
    candidate = work / "3.25.76-bounded-backport" / "package"
    shutil.copytree(work / "3.25.76" / "package", candidate)
    subprocess.run([
        "patch", "--batch", "--forward", "-p1", "-i",
        str(EVIDENCE / "research-only-bounded-backport.patch"),
    ], cwd=candidate, check=True)
    results = {}
    for version in [*PACKAGES, "3.25.76-bounded-backport"]:
        command = ["node", str(ROOT / "scripts/probe-zod-advisory.mjs"),
                   str(work / version / "package")]
        run = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
        print(json.dumps({"version": version, "exit_code": run.returncode,
                          "stderr": run.stderr}))
        run.check_returncode()
        results[version] = json.loads(run.stdout)
    # Explicitly distinguish useful bounded behavior from remaining uncapped work.
    for version, result in results.items():
        fixed_bounds = version in {"4.6.6", "4.6.7", "3.25.76-bounded-backport"}
        for case in result["cases"]:
            bounded = case["constraint"] != "none"
            expected_visits = 0 if fixed_bounds and bounded else 4096
            assert case["visited"] == expected_visits, (version, case)
            expected_issues = 1 if fixed_bounds and bounded else 4096 + int(bounded)
            assert case["issues"] == expected_issues, (version, case)
        assert result["compatibility"]["hardhatValidation"]["accepted"] == version.startswith("3.")
    print(json.dumps({"status": "diagnostic-expectations-confirmed",
                      "advisory_closed": False, "installed_candidate": False,
                      "probe_assertions": 95, "comparison_assertions": 85,
                      "results": results}, indent=2))
