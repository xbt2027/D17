#!/usr/bin/env python3
"""Inventory every raw Slither finding; never suppress or grant security acceptance."""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('raw', type=Path)
p.add_argument('csv', type=Path)
p.add_argument('summary', type=Path)
args = p.parse_args()
data = json.loads(args.raw.read_text())
if not data.get('success'):
    raise SystemExit('Slither analysis did not complete successfully')
counts = collections.defaultdict(collections.Counter)
rows = []
rationale = {
    'incorrect-equality': 'Intentional preseeded-token rejection; assess donation/griefing and trust boundaries.',
    'reentrancy-no-eth': 'Guarded mutating entry points; canonical dependency graph. Independently trace cross-contract and read-only callbacks; finite tests are not exhaustive.',
    'uninitialized-local': 'Scalar Solidity locals default to zero/false. Confirm loop lifetime, accumulation, rollback and batch isolation.',
    'unused-return': 'Batch uses call success, not claimed-token amount; pair reserve timestamp is intentionally unused. Review economic consequences.',
    'missing-inheritance': 'Structural interface compatibility; independently confirm ABI and canonical dependency identity.',
    'constable-states': 'Compatibility counters retained. Review whether zero-valued legacy counters confuse consumers.',
}
for item in data['results']['detectors']:
    paths = sorted({e['source_mapping'].get('filename_relative', '') for e in item['elements'] if 'source_mapping' in e})
    scope = 'test-only' if paths and all('/test/' in s for s in paths) else 'production-or-mixed'
    counts[scope][item['impact']] += 1
    note = ('Deliberately hostile/local fixture; not deployed by production factory. Verify scope independently.'
            if scope == 'test-only' else rationale.get(item['check'], 'Retained for independent source review; no suppression or security waiver.'))
    rows.append({'id': item['id'], 'detector': item['check'], 'impact': item['impact'],
                 'confidence': item['confidence'], 'scope': scope, 'paths': ';'.join(paths),
                 'description': item['description'].strip(), 'developer_assessment': note,
                 'independent_status': 'PENDING'})
with args.csv.open('w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n')
    w.writeheader()
    w.writerows(rows)
summary = {'raw_file': str(args.raw), 'raw_sha256': hashlib.sha256(args.raw.read_bytes()).hexdigest(),
           'analysis_success': True, 'total_findings': len(rows),
           'scope_rule': 'test-only iff every element path contains /test/; absent or mixed paths remain production-or-mixed',
           'counts': dict(counts), 'independent_acceptance': 'PENDING', 'mainnet': 'NO-GO'}
args.summary.write_text(json.dumps(summary, indent=2) + '\n')
print(json.dumps(summary, indent=2))
