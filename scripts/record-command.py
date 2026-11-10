#!/usr/bin/env python3
"""Run an argument-vector command and retain honest exit status and bounded evidence."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import sys

directory, label, *command = sys.argv[1:]
out = pathlib.Path(directory)
out.mkdir(parents=True, exist_ok=True)
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
record = {"command": command, "cwd": os.getcwd(), "started_utc": now(),
          "head_before": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()}
with (out / (label + '.txt')).open('wb') as log:
    result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
record.update(finished_utc=now(), exit_code=result.returncode,
              log_sha256=hashlib.sha256((out / (label + '.txt')).read_bytes()).hexdigest())
(out / (label + '.command.json')).write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record))
print((out / (label + '.txt')).read_text(errors='replace')[-3000:])
sys.exit(result.returncode)
