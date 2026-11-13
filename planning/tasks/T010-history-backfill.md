# T010: Carga para trás, mês a mês

- **Status:** refining
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
- Leitores privados, um por layout de PDF (extratos e faturas de cada banco), fora do repositório:
  - validados por reproduzir exatamente as planilhas de outubro, já conferidas;
  - cada PDF conferido contra os próprios totais (saldo final do extrato, total da fatura);
  - categorias pelas escolhas feitas nas cargas anteriores.
- Setembro ainda pela tela, com o roteiro, porque mover a abertura é o passo novo.
- Do mês seguinte para trás, decidir se a carga segue pela tela ou por um carregador privado que
  chama as mesmas regras do app (importação, transferência, pagamento de fatura, ajuste de saldo).

## Non-goals
- Código de produto.
- Investimentos.

## Acceptance criteria
- [ ] Todo mês carregado passa na conferência do T009.
- [ ] O saldo final de cada mês carregado é igual à abertura do mês seguinte, já conferida.
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
- 2026-11-13 — T009 validado. Plano: leitores privados por layout, setembro pela tela, carregador decidido depois.
