# Roadmap — the board

Single source of truth for status. See `README.md` for how the system works.

**In flow now:** — (E01 em revisão final: T001–T005 e T007; T006 aguarda o PDF do Bradesco)

---

## Now / Next / Later

### Now
- **E01 — Dívidas: financiamento com leitura de extrato** (T001–T005 e T007 em revisão)

### Next
- E05 — Conciliação na importação: parcela de financiamento, pagamento de fatura e transferências entre contas próprias
- E02 — Simulações de dívida: descontos, quitação e extras futuras
- E03 — Financiamento estudantil: IPCA semestral

### Later
- E04 — Preenchimento histórico de cartão: parcela inicial evidente e corrigível, histórico sem mexer no saldo

---

## Epic index

| ID | Epic | Priority | Status | Tasks (done/total) |
|----|------|----------|--------|--------------------|
| E01 | [Dívidas: financiamento com leitura de extrato](epics/E01-debts.md) | P1 | in-flow | 0/6 |
| E02 | Simulações de dívida (área de descontos) | P2 | inbox | — |
| E03 | Financiamento estudantil (IPCA semestral) | P2 | inbox | — |
| E04 | [Preenchimento histórico de cartão](epics/E04-card-history.md) | P3 | inbox | — |
| E05 | [Conciliação na importação de extratos](epics/E05-import-reconciliation.md) | P2 | inbox | 0/1 |

---

## Task board

| ID | Task | Epic | Status | Spec | PR |
|----|------|------|--------|------|----|
| T001 | [Motor de cronograma SAC no domain](tasks/T001-debt-schedule-engine.md) | E01 | in-review | [docs/debts.md](../docs/debts.md) | [#1](https://github.com/giovannivarela/openmonetis-v2/pull/1) |
| T002 | [Leitor de extrato: modelo canônico + adaptador Itaú DDC](tasks/T002-debt-statement-reader.md) | E01 | in-review | este arquivo | [#2](https://github.com/giovannivarela/openmonetis-v2/pull/2) |
| T003 | [Persistência e API de dívidas](tasks/T003-debts-persistence-api.md) | E01 | in-review | este arquivo | [#3](https://github.com/giovannivarela/openmonetis-v2/pull/3) |
| T004 | [Tela de dívidas (lista e detalhe)](tasks/T004-debts-screen.md) | E01 | in-review | este arquivo | [#4](https://github.com/giovannivarela/openmonetis-v2/pull/4) |
| T005 | [Parcelas da dívida como lançamentos](tasks/T005-debt-installment-expenses.md) | E01 | in-review | este arquivo | [#5](https://github.com/giovannivarela/openmonetis-v2/pull/5) |
| T007 | [Camada "Financiamentos" em Compromissos futuros](tasks/T007-debts-commitments-layer.md) | E01 | in-review | este arquivo | [#6](https://github.com/giovannivarela/openmonetis-v2/pull/6) |
| T008 | Dedup das parcelas com o extrato importado da conta | E05 | inbox | — | — |
| T006 | Adaptador Bradesco | E01 | blocked | — | — |
