# V15 and V15.1 build evidence

`protocol-build.json`, `solc-input.json`, `contracts/abi` and the unversioned web/API ABIs are frozen historical V15 assets. Their 51 files and 15 source hashes are checked against commit ce5ba32e49f87f1b6ae3b3ab11607517e91bf24a. Do not regenerate them from V15.1 sources.

The current candidate lives under `v15.1/`: twelve contract artifacts, standard compiler input, source/ABI/bytecode hashes and matching versioned web/API ABIs. It is preliminary and unaudited. Mainnet remains NO-GO.

```bash
npm run compile -w @d17/contracts -- --force
npm run release:candidate          # deliberate export after reviewed source change
npm run verify:candidate-build     # independent solc reproduction
npm run content:sync               # if public docs changed
npm run release:checksums          # last, after build/content/tooling changes
npm run check:release              # non-mutating V15.1 integrity gate
```

`check:release:legacy` retains the original checker and its expected V15/current-source mismatch. The migration and all retained obligations are documented in [RELEASE_GATE_MIGRATION.md](./RELEASE_GATE_MIGRATION.md). Passing the integrity gate does not close dependency, static-analysis, independent-audit or live deployment gates.
