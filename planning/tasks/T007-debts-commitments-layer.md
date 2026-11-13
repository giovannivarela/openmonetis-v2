# T007: Camada "Financiamentos" em Compromissos futuros

- **Status:** in-review
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** este arquivo + `docs/commitments.md`
- **PR:** https://github.com/giovannivarela/openmonetis-v2/pull/6 (empilhado sobre o #5)

## What & why
Com a T005, as parcelas lançadas já entram no total de Compromissos futuros, mas como "Contas
avulsas". O financiamento é um compromisso contratado e de longo prazo, então ganha uma camada
própria.

## Design
- Uma despesa avulsa ligada a uma dívida (`transactions.debt_id`) vai para a camada
  **Financiamentos**, não para "Contas avulsas". As demais regras continuam:
  - na parte da pessoa titular;
  - contas fora do saldo total ficam de fora;
  - pagas e pendentes contam no mês.
- **Primeiro mês de alívio:** considera parcelados, recorrentes e financiamentos. Ao contrário das
  avulsas, as parcelas do financiamento estão lançadas para todos os meses à frente, então o fim de
  um financiamento é um alívio real, não falta de dado.
- **Web:** nova série no gráfico (`--chart-5`) e coluna na tabela.

## Scope
- Domain `commitments.ts`: camada `debts` e `debtsAmount`.
- Repository e contrato (`debtsAmount` em `CommitmentMonth`).
- Web: gráfico, tabela e texto da página.
- Docs: `docs/commitments.md`.

## Non-goals
- Parcelas de dívidas sem lançamentos ativados (o relatório mostra o que está lançado).
- Dedup com o extrato (T008).

## Acceptance criteria
- [x] Uma despesa ligada a uma dívida soma em Financiamentos e não em Contas avulsas; o total
      comprometido continua igual.
- [x] O alívio considera os financiamentos.
- [x] Gráfico e tabela mostram a camada.
- [x] Testes de domain; `pnpm check`, `pnpm test` e `pnpm build` verdes; integração de compromissos
      verde, se existir.

## Dependencies
- T005 (PR #5). Este PR fica empilhado sobre o #5.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo)
- [x] Scope and non-goals explicit

## Log
- 2026-11-13 — RED → GREEN: dois testes de domain (camada própria; alívio no fim do
  financiamento). Não existe integração de compromissos, então a integração de dívidas confere
  `/reports/commitments` com parcelas lançadas: a parcela soma em Financiamentos e Contas avulsas
  fica em zero (17/17).
- 2026-11-13 — Cores: `--chart-5` ao lado de `--chart-2` passa nas checagens de separação
  (daltonismo e normal) nos dois temas. As falhas de croma e luminosidade vêm da paleta que o app
  já usa; legenda e tabela garantem a identificação.
