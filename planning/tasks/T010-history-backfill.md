# T010: Carga para trás, mês a mês

- **Status:** inbox
- **Epic:** E04 — Carga do histórico
- **Spec:** —
- **PR:** — (operação de dados)

## What & why
Repetir o roteiro do piloto de setembro/2026 para trás, até o primeiro extrato, para ter o
histórico completo.

## Scope
- A cada mês:
  - backup antes do lote;
  - o ajuste de abertura muda para o mês carregado;
  - mesma conferência do T009.
- Checkpoint a cada ano, com os saldos de fim de mês conferidos.
- Depois do piloto, decidir se a carga segue pela tela ou por um carregador privado. O carregador
  chamaria as mesmas regras de importação e pagamento de fatura do app.

## Non-goals
- Código de produto.
- Investimentos.

## Acceptance criteria
- [ ] Todo mês carregado passa na conferência do T009.
- [ ] No fim, cada conta tem um único ajuste de abertura, no primeiro mês do histórico.

## Dependencies
- T009 validado.

## Definition of Ready
- [ ] Single coherent outcome
- [ ] Testable acceptance criteria written
- [ ] Dependencies resolved or sequenced
- [ ] Has a spec
- [ ] Scope and non-goals explicit

## Log
- 2026-11-13 — Criado.
