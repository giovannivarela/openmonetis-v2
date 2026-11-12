# Roadmap — the board

Single source of truth for status. See `README.md` for how the system works.

**In flow now:** T002 (T001 em revisão no PR #1)

---

## Now / Next / Later

### Now
- **E01 — Dívidas: financiamento com leitura de extrato** (T001 em revisão)

### Next
- E02 — Simulações de dívida: descontos, quitação e extras futuras
- E03 — Financiamento estudantil: IPCA semestral

### Later
_Empty._

---

## Epic index

| ID | Epic | Priority | Status | Tasks (done/total) |
|----|------|----------|--------|--------------------|
| E01 | [Dívidas: financiamento com leitura de extrato](epics/E01-debts.md) | P1 | in-flow | 0/6 |
| E02 | Simulações de dívida (área de descontos) | P2 | inbox | — |
| E03 | Financiamento estudantil (IPCA semestral) | P2 | inbox | — |

---

## Task board

| ID | Task | Epic | Status | Spec | PR |
|----|------|------|--------|------|----|
| T001 | [Motor de cronograma SAC no domain](tasks/T001-debt-schedule-engine.md) | E01 | in-review | [docs/debts.md](../docs/debts.md) | [#1](https://github.com/giovannivarela/openmonetis-v2/pull/1) |
| T002 | [Leitor de extrato: modelo canônico + adaptador Itaú DDC](tasks/T002-debt-statement-reader.md) | E01 | in-flow | este arquivo | — |
| T003 | Persistência e API de dívidas | E01 | inbox | — | — |
| T004 | Tela de dívidas (variantes antes do código) | E01 | inbox | — | — |
| T005 | Parcela como despesa + Compromissos futuros | E01 | inbox | — | — |
| T006 | Adaptador Bradesco | E01 | blocked | — | — |
