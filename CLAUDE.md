@AGENTS.md

## Planning / process (fork)
Substantial work runs through the planning system in `planning/`. Read `planning/README.md` and
operate `planning/ROADMAP.md` before starting non-trivial features. Capture → refine & decompose →
/spec to Definition of Ready → /flow (one ready task at a time) → /ship. Propose priority + order;
the human approves.

This repository is a **public** fork of `felipegcoutinho/openmonetis-v2` (remote `upstream`).
Real bank statements, contract data and the Python reference engine live OUTSIDE the repo, in
`../openmonetis-v2-private/`. Inside the repo they would leak in a commit, and Biome would lint
them. Never copy them in; committed fixtures are synthetic. To check the debt engine against
the real statement, run
`DEBTS_PRIVATE_FIXTURE=../openmonetis-v2-private/itau-ddc.fixture.json node --import tsx --test packages/domain/src/debts.test.ts`.
