# T003: Persistência e API de dívidas

- **Status:** in-review
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** este arquivo + `docs/debts.md` (seção "API")
- **PR:** https://github.com/giovannivarela/openmonetis-v2/pull/3 (empilhado sobre o #2)

## What & why
Guardar dívidas importadas do extrato e expor resumo e cronograma pela API. A tela (T004) e a
integração com despesas (T005) consomem esses endpoints.

## Design
- **Tabelas:**
  - `debts`: a identidade da dívida, com nome, banco, formato, referência do contrato e a hipótese
    de correção mensal da projeção;
  - `debt_statements`: o extrato canônico de cada importação, guardado em `jsonb`, com a data de
    emissão.
  - O cronograma não é gravado: é recalculado pelo motor a partir do extrato mais recente. Assim,
    regra e dado nunca divergem.
- **Identidade:** (usuário, banco, referência do contrato) é única. Reimportar o mesmo contrato
  atualiza a dívida e guarda o novo extrato; o mesmo extrato (mesma data de emissão) é substituído,
  não duplicado.
- **Trava de integridade:** antes de gravar, o service confere que o motor reproduz todas as
  parcelas conhecidas do extrato (`findStatementDivergences`). Se não reproduz, a importação é
  recusada (`STATEMENT_NOT_REPRODUCED`), em vez de mostrar números diferentes dos do banco.
- **Importação:** `POST /debts/imports` com `{ fileName, contentBase64 }`, o mesmo contrato das
  importações de lançamentos. O PDF é lido em memória e não é armazenado.
- **Extras manuais entre importações:** fora do escopo. O DDC já traz a extra no dia em que ela é
  feita, então basta reimportar.

## Scope
- Domain: `findStatementDivergences(statement)`.
- `packages/db`: tabelas, migration e índices.
- `packages/validators/src/debts.ts`: entrada da importação, atualização, parâmetros e saídas.
- API: `debts.repository.ts`, `debts.service.ts` e `routes/debts.ts`:
  - `GET /debts`;
  - `POST /debts/imports`;
  - `GET /debts/{id}` (resumo + cronograma + extras);
  - `PATCH /debts/{id}` (nome e hipótese de correção);
  - `DELETE /debts/{id}`.
- Sessão obrigatória, cache privado e isolamento por usuário. O "zerar dados" remove as dívidas.
- Testes:
  - unitários do service, com repository e extrator falsos;
  - integração com PostgreSQL (`DEBTS_INTEGRATION_TEST=1`) importando um PDF sintético.

## Non-goals
- Tela (T004) e integração com despesas/compromissos (T005).
- Leitor do Bradesco (T006).
- Guardar o PDF original.

## Acceptance criteria
- [x] Importar o PDF sintético cria a dívida e devolve resumo e cronograma iguais aos do extrato.
- [x] Reimportar o mesmo extrato não duplica a dívida nem o extrato; um extrato mais novo do mesmo
      contrato passa a valer.
- [x] PDF inválido, extrato não suportado e extrato que o motor não reproduz são recusados com
      400 e código próprio, sem gravar nada.
- [x] Outro usuário não lê, altera nem remove a dívida (404). Sem sessão, 401.
- [x] Alterar a hipótese de correção muda a projeção, mas não as parcelas conhecidas.
- [x] "Zerar dados" remove dívidas e extratos.
- [x] `pnpm check`, `pnpm test`, `pnpm build` e a integração de dívidas verdes.

## Dependencies
- T001 e T002 (PRs #1 e #2). Este PR fica empilhado sobre o #2.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo)
- [x] Scope and non-goals explicit

## Log
- 2026-11-12 — Importação por JSON com base64, seguindo `POST /transactions/imports/preview`.
  Extras manuais ficaram fora, porque o DDC já reflete a extra no mesmo dia.
- 2026-11-13 — RED: testes do service e da integração falhando pela ausência das rotas e
  tabelas. GREEN: service (8), integração de dívidas (9) e "zerar dados" com uma dívida semeada
  verdes contra um PostgreSQL 16 descartável. A integração cobre também um extrato mais novo do
  mesmo contrato passando a valer. `pnpm check`, `pnpm test` e `pnpm build` verdes.
