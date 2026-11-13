# T011: Parcela inicial do cartão evidente e corrigível

- **Status:** inbox
- **Epic:** E04 — Carga do histórico
- **Spec:** —
- **PR:** —

## What & why
Compras parceladas que continuam depois do corte precisam ser cadastradas na parcela certa. Hoje
isso é fácil de errar e não tem correção.

## Problemas observados (captura original do E04)
- **Parcela inicial escondida.** "Primeira parcela a registrar" é um select discreto na criação.
  Ao cadastrar uma compra que já está na 6ª parcela, é fácil deixar em "1ª".
- **Sem correção na edição.** O formulário de edição esconde o campo, e o contrato de atualização
  (`UpdateTransactionInputSchema`) não o aceita. A saída hoje é remover o parcelamento inteiro e
  recriar.

## Ideias a refinar
- Deixar a parcela inicial evidente, por exemplo como "Em qual parcela você está?".
- Permitir corrigir a parcela inicial na edição, reconstruindo a série.

## Non-goals
- Registrar as parcelas anteriores: no histórico, elas entram como itens das faturas antigas
  (T009 e T010).

## Dependencies
- Nenhuma. Não bloqueia o piloto, porque o campo já existe na criação.

## Definition of Ready
- [ ] Single coherent outcome, fits one `/flow` run
- [ ] Testable acceptance criteria written
- [ ] Dependencies resolved or sequenced
- [ ] Has a `/spec`
- [ ] Scope and non-goals explicit

## Log
- 2026-11-13 — Separado do E04 original.
