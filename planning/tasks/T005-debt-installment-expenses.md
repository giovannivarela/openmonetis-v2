# T005: Parcelas da dívida como lançamentos

- **Status:** in-flow
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** este arquivo
- **PR:** —

## What & why
Nem todo financiamento aparece como débito no extrato da conta. Para a parcela entrar no fluxo de
caixa, nas contas a pagar e nos relatórios, a dívida passa a gerar lançamentos reais: uma despesa
pendente por parcela, ligada à dívida.

## Design (decidido em 2026-11-13)
- **Lançamentos reais, não expansão virtual.** A expansão de recorrências atravessa 16
  repositórios (listas, dashboard, orçamentos, saldos, faturas). Uma despesa materializada entra em
  todos eles sem código novo, como os parcelados. Também prepara o dedup (T008): o débito importado
  do banco poderá virar a baixa da parcela pendente.
- **Cada parcela vira** uma despesa regular, `single`, pendente (`isSettled: false`):
  - na conta, na categoria e na forma de pagamento escolhidas;
  - com vencimento e data igual ao vencimento da parcela e valor igual ao total da parcela no
    cronograma;
  - com o nome "{dívida} · parcela N".
  Assim ela entra em "Contas a pagar", nos avisos de vencimento e na lista do mês.
- **Ligação:** `transactions.debt_id` + `transactions.debt_installment_number`, únicos por dívida.
  Excluir a dívida apaga as pendentes; as baixadas ficam, e a ligação vira `null`.
- **Configuração na dívida:** conta, categoria, forma de pagamento e a primeira parcela lançada.
  Ao ativar, a primeira parcela é a próxima a vencer. O histórico não é criado, porque costuma já
  existir como outros lançamentos.
- **Sincronização** (`planDebtInstallmentExpenses`, no domain). Roda ao ativar, ao reimportar o
  extrato e ao mudar a correção projetada:
  - cria as parcelas que faltam a partir da primeira;
  - atualiza valor e vencimento das pendentes;
  - remove as pendentes que saíram do cronograma (prazo cortado por extra);
  - não toca nas baixadas.
- **Desativar** remove as pendentes e mantém as baixadas.

## Scope
- Domain `debt-expenses.ts`: `planDebtInstallmentExpenses`.
- `packages/db`: colunas em `transactions` e `debts`, migration.
- Validators e API:
  - `PUT /debts/{id}/expenses` ativa ou altera (conta, categoria, forma de pagamento);
  - `DELETE /debts/{id}/expenses` desativa;
  - a saída da dívida traz a configuração e a contagem de lançamentos pendentes e baixados.
- Web: card "Parcelas em Lançamentos" no detalhe da dívida, para ativar, alterar e parar.

## Non-goals
- Camada "Financiamentos" em Compromissos futuros (T007). Até lá, as parcelas entram no total de
  Compromissos como contas avulsas.
- Dedup com o extrato importado da conta (T008).
- Criar lançamentos para parcelas já vencidas antes de ativar.

## Acceptance criteria
- [ ] Ativar cria uma despesa pendente por parcela a partir da próxima, com conta, categoria, forma
      de pagamento, vencimento e valor do cronograma, ligada à dívida. As parcelas aparecem em
      "Contas a pagar" (`payables=true`).
- [ ] Reimportar ou mudar a correção atualiza só as pendentes. As baixadas não mudam, e as
      pendentes que saíram do cronograma são removidas.
- [ ] Alterar conta, categoria ou forma de pagamento atualiza as pendentes.
- [ ] Desativar ou excluir a dívida remove as pendentes e mantém as baixadas.
- [ ] Conta ou categoria de outra pessoa, arquivada ou de receita é recusada. Uma dívida sem
      parcelas futuras não pode ser ativada.
- [ ] Testes de domain, service e integração com PostgreSQL. "Zerar dados" continua limpo.
- [ ] `pnpm check`, `pnpm test` e `pnpm build` verdes; a tela conferida rodando.

## Dependencies
- T004 (PR #4). Este PR fica empilhado sobre o #4.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo)
- [x] Scope and non-goals explicit

## Log
- 2026-11-13 — Lançamentos reais escolhidos em vez de expansão virtual. A camada em Compromissos
  virou a T007 e o dedup com o extrato, a T008.
