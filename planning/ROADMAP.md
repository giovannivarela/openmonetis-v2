# Roadmap — the board

Single source of truth for status. See `README.md` for how the system works.

**In flow now:** T005 (T001–T004 em revisão)

---

## Now / Next / Later

### Now
- **E01 — Dívidas: financiamento com leitura de extrato** (T001–T004 em revisão)

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
| T002 | [Leitor de extrato: modelo canônico + adaptador Itaú DDC](tasks/T002-debt-statement-reader.md) | E01 | in-review | este arquivo | [#2](https://github.com/giovannivarela/openmonetis-v2/pull/2) |
| T003 | [Persistência e API de dívidas](tasks/T003-debts-persistence-api.md) | E01 | in-review | este arquivo | [#3](https://github.com/giovannivarela/openmonetis-v2/pull/3) |
| T004 | [Tela de dívidas (lista e detalhe)](tasks/T004-debts-screen.md) | E01 | in-review | este arquivo | [#4](https://github.com/giovannivarela/openmonetis-v2/pull/4) |
| T005 | [Parcelas da dívida como lançamentos](tasks/T005-debt-installment-expenses.md) | E01 | in-flow | este arquivo | — |
| T007 | Camada "Financiamentos" em Compromissos futuros | E01 | ready | — | — |
| T008 | Dedup das parcelas com o extrato importado da conta | E01 | inbox | — | — |
| T006 | Adaptador Bradesco | E01 | blocked | — | — |
