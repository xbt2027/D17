"""Collect fresh isolated EVM reports and prove source/build parity against two checkpoints."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
out = root / "evidence/cloud-dependencies-2026-10-30"
baselines = [Path(arg).resolve() for arg in sys.argv[1:]]
assert len(baselines) == 2, "Provide canonical and c20e5a0 extracted checkpoint directories"
base_commit = "c20e5a01f62cbd4b9e80ad58389abf118150964e"
sha = lambda data: hashlib.sha256(data).hexdigest()
sources = {}
for p in sorted((root / "contracts/contracts").rglob("*.sol")):
    rel = p.relative_to(root).as_posix()
    before = subprocess.check_output(["git", "show", f"{base_commit}:{rel}"], cwd=root)
    assert before == p.read_bytes(), rel
    assert (baselines[0] / "source" / rel).read_bytes() == before, rel
    sources[rel] = sha(before)
assert len(sources) == 20
lock = root / "package-lock.json"
assert lock.read_bytes() == subprocess.check_output(["git", "show", f"{base_commit}:package-lock.json"], cwd=root)
assert sha(lock.read_bytes()) == "7dab66a4b55feda6c1cb8692304ae8877a5637e8ab2e45df7835227c2d3b2b70"
(out / "source-lock-parity.json").write_text(json.dumps({"solidity_sha256": sources, "lock_sha256": sha(lock.read_bytes()), "production_solidity_changed": False, "lockfile_changed": False}, indent=2) + "\n")

artifacts = {}
for base in baselines:
    rows = {}
    for name in json.loads((base / "BUILD_CURRENT/ARTIFACT_SHA256.json").read_text()):
        p = root / "contracts/artifacts" / name
        q = base / "BUILD_CURRENT/artifacts" / name
        actual, expected = json.loads(p.read_text()), json.loads(q.read_text())
        row = {"file_sha256": sha(p.read_bytes()), "baseline_file_sha256": sha(q.read_bytes())}
        for field in ["abi", "bytecode", "deployedBytecode"]:
            encode = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode() if field == "abi" else bytes.fromhex(value.removeprefix("0x"))
            assert actual[field] == expected[field], (name, field)
            row[field] = {"actual_sha256": sha(encode(actual[field])), "baseline_sha256": sha(encode(expected[field])), "equal": True}
        rows[name] = row
    assert len(rows) == 42
    artifacts[base.name] = rows
(out / "artifact-parity.json").write_text(json.dumps(artifacts, indent=2) + "\n")

settings = []
for p in (root / "contracts/artifacts/build-info").glob("*.json"):
    data = json.loads(p.read_text())
    if "input" not in data:
        continue
    s = data["input"]["settings"]
    assert data["solcVersion"] == "0.8.24"
    assert s["viaIR"] and s["optimizer"] == {"enabled": True, "runs": 1}
    assert s["evmVersion"] == "shanghai" and s["metadata"]["bytecodeHash"] == "none"
    settings.append({"file": p.name, "solcVersion": data["solcVersion"], "solcLongVersion": data.get("solcLongVersion"), "settings": s})
assert settings
(out / "compiler-settings.json").write_text(json.dumps(settings, indent=2) + "\n")

tests = {}
for name, command, report in [
    ("local", "contracts", "local/REPORT.md"),
    ("hardening", "contracts", "hardening/REPORT.md"),
    ("mainnet-floors", "contracts", "mainnet-floors/REPORT.md"),
    ("fee-splitter", "contracts", "fee-splitter/REPORT.md"),
    ("regressions", "regressions", "release/regressions.json"),
    ("100-lockers", "100-lockers", "release/100-lockers-13725734.json"),
    ("fuzz", "fuzz", "fuzz/REPORT.md"),
    ("256-lockers", "256-lockers", "security/settlement-liveness.json"),
    ("runtime", "runtime", "security/runtime-bytecode.json"),
]:
    meta = json.loads((out / f"isolated-{command}.command.json").read_text())
    assert meta["exit_code"] == 0, command
    p = root / "contracts/runs" / report
    assert p.stat().st_mtime >= datetime.datetime.fromisoformat(meta["started_utc"]).timestamp(), report
    target = out / "fresh-isolated-results" / report
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, target)
    text = p.read_text()
    if p.suffix == ".json":
        tests[name] = json.loads(text)
        assert tests[name]["status"] == "passed"
    elif name == "fuzz":
        tests[name] = {"invariants": int(re.search(r"Invariant checks: (\d+)", text)[1]), "adversarial": int(re.search(r"Adversarial probes passed: (\d+)", text)[1]), "report": text}
    else:
        tests[name] = {"passed": int(re.search(r"- Passed: (\d+)", text)[1]), "failed": int(re.search(r"- Failed: (\d+)", text)[1])}
        assert tests[name]["failed"] == 0
assert sum(tests[n]["passed"] for n in ["local", "hardening", "mainnet-floors", "fee-splitter"]) == 628
assert len(tests["regressions"]["scenarios"]) == 7
assert (tests["100-lockers"]["checks"], tests["100-lockers"]["actions"]) == (4634, 1424)
assert (tests["fuzz"]["invariants"], tests["fuzz"]["adversarial"]) == (26793, 142)
assert (tests["256-lockers"]["checks"], tests["256-lockers"]["transactions"]) == (852, 1319)
assert tests["runtime"]["checks"] == 63
(out / "fresh-isolated-summary.json").write_text(json.dumps(tests, indent=2) + "\n")
print(json.dumps({"solidity_equal": len(sources), "artifact_parity_each_baseline": 42, "contract_checks": 628, "real_v2": 7, "100_locker_checks": 4634, "100_locker_actions": 1424, "fuzz_invariants": 26793, "adversarial": 142, "256_locker_checks": 852, "256_locker_actions": 1319, "runtime_checks": 63, "artifact_whole_json_equal": {k: sum(r["file_sha256"] == r["baseline_file_sha256"] for r in v.values()) for k, v in artifacts.items()}}, indent=2))
