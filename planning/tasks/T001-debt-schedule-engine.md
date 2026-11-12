# T001: Motor de cronograma SAC no domain

- **Status:** in-review
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** `docs/debts.md` (criado nesta task)
- **PR:** —

## What & why
Uma função pura que, a partir dos termos do contrato, dos fatores de correção, dos eventos e das
regras de encargos, produz o cronograma da dívida com as mesmas regras e arredondamentos do banco.
O que vem depois (leitor, API, tela, simulações) consome este motor.

## Scope
- `packages/domain/src/debts.ts`:
  - `buildDebtSchedule(input) → DebtScheduleRow[]`
  - `summarizeDebtSchedule(rows, asOf) → DebtSummary`
- Regras, todas em centavos inteiros com arredondamento half-up explícito:
  - taxa mensal = (1 + taxa efetiva anual)^(1/12) − 1;
  - saldo corrigido B = arred(saldo × fator); juros = arred(B × i) quando o vencimento cai no
    mesmo dia do mês seguinte, ou arred(B × ((1+i)^(dias/30) − 1)) em período quebrado;
  - SAC: amortização = arred(B ÷ meses restantes); saldo = B − amortização;
  - extra: principal = valor − juros pró-rata − atualização monetária, aplicado antes da parcela
    seguinte, na ordem das datas;
    - redução de prazo: n = arred_half_up(B_novo ÷ (P_ref − arred(B_novo × i))), em que P_ref é
      a amortização + os juros que seriam devidos sem a extra;
    - redução de parcela: mantém n;
  - encargos por regra com vigência:
    - `balanceRate`: taxa × B (MIP);
    - `indexedAmount`: base × fator acumulado (DFI);
    - `fixedAmount`: valor fixo (TCA);
    - valores reais por vencimento (do extrato) têm precedência sobre a regra;
  - depois do último vencimento conhecido, o motor projeta mensalmente no mesmo dia, com uma
    hipótese de correção mensal, até o saldo zerar.
- Resumo: saldo atual, prazo restante, juros e encargos pagos e a pagar, e meses cortados em
  relação ao prazo original.
- Documentação em `docs/debts.md` e entrada em `CHANGELOG.md` (Unreleased).

## Non-goals
- Ler PDF ou texto de extrato (T002).
- Persistência, API e tela (T003/T004).
- Calcular os juros pró-rata de extras futuras (E02); aqui eles são entradas.
- Price e IPCA (E03).

## Acceptance criteria
- [x] Fixture sintética versionada (contrato fictício com troca de vencimento, extras de prazo e
      de parcela, correções variadas e encargos com mudança de taxa): o motor bate linha a linha,
      ao centavo, com a saída do motor de referência independente. Isso é o diff antes/depois de
      paridade.
- [x] Teste local opt-in (`DEBTS_PRIVATE_FIXTURE=<arquivo>`) contra o extrato real do Itaú:
      amortização, juros e saldo de todas as linhas com diferença zero. Sem a variável, o teste é
      pulado com uma mensagem explícita.
- [x] Redução de prazo e redução de parcela cobertas por casos unitários próprios.
- [x] O resumo devolve meses cortados = prazo original − (parcelas pagas + restantes).
- [x] `pnpm check` e `pnpm test` verdes.

## Dependencies
- Nenhuma.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo + `docs/debts.md`; o escopo já estava fechado na conversa)
- [x] Scope and non-goals explicit

## Log
- 2026-11-12 — Criada a partir da engenharia reversa do DDC do Itaú (todas as linhas ao centavo
  em Python).
- 2026-11-12 — RED: 12 testes falhando nas asserções, sem erros de import. GREEN: 11/11, mais o
  teste privado passando localmente. `pnpm check`, `pnpm test` (873 testes) e `pnpm build` verdes.
