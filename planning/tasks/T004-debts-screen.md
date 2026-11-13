# T004: Tela de dívidas (lista e detalhe)

- **Status:** in-flow
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** este arquivo + maquete aprovada (aba "Escolhido · A + C")
- **PR:** —

## What & why
Mostrar as dívidas importadas do extrato: quanto falta, quando termina, o efeito das amortizações
extras e para onde vai o dinheiro de cada parcela. Consome a API da T003.

## Design (escolhido em 2026-11-13)
Três variantes foram comparadas lado a lado. A escolha combina duas:
- **`/debts`, lista (variante A, intacta):**
  - cabeçalho "Dívidas" com "Importar extrato";
  - um card por dívida, com saldo devedor, progresso, próxima parcela e fim previsto com
    "N meses a menos";
  - um card tracejado para importar outro financiamento.
- **`/debts/$debtId`, detalhe (variante C):**
  - cabeçalho com a identidade da dívida e um seletor para trocar de dívida;
  - card "Saldo devedor hoje" com chips. No lugar da barra de trajetória entra o gráfico
    "Evolução do saldo devedor" da variante A;
  - quatro indicadores: próxima parcela, total pago até hoje, juros pagos e juros a pagar;
  - "Para onde vai cada parcela" (barras empilhadas por ano), com a hipótese de correção;
  - lista de amortizações extras;
  - "Próximas parcelas", com o cronograma completo sob demanda.
- Visual adotado do OpenMonetis: `PageHeader`, `StatCard`, `Card`, `MoneyValue`, gráficos Recharts
  via `ChartContainer` e as cores `--chart-2` (amortização), `--chart-1` (juros) e neutro
  (encargos). O par `--chart-1`/`--chart-2` passou na validação de daltonismo nos dois temas.

## Scope
- API: totais anuais e o principal de cada extra são calculados no domain, não na tela:
  - domain `summarizeDebtScheduleYears(rows, asOf)`: amortização, juros, encargos, total e extras
    por ano, e se o ano só tem parcelas projetadas;
  - `DebtSummary.paidOutCents`: o que já saiu do bolso (parcelas vencidas + valor das extras
    feitas);
  - a saída ganha `summary.paidOut`, `yearlyBreakdown` e `extraAmortizations[].principal`.
- Web `apps/web/src/features/debts/`: `debts.api.ts`, `debts.queries.ts`, `debts.mutations.ts`,
  `debts.presentation.ts` (+ teste) e `components/`.
- Rotas `routes/debts.tsx` e `routes/debts_.$debtId.tsx`; item "Dívidas" em Finanças.
- Ações:
  - importar extrato (PDF ≤ 5 MB);
  - renomear;
  - alterar a correção mensal projetada;
  - excluir, com confirmação.
- Estados de carregando, erro, lista vazia e dívida inexistente. Modo privacidade borra valores e
  gráficos, como nas outras telas.

## Non-goals
- Parcela como despesa e "Compromissos futuros" (T005).
- Simulações de quitação e extras futuras (E02).
- Leitor do Bradesco (T006).

## Acceptance criteria
- [ ] `/debts` lista as dívidas no layout A; sem dívidas, mostra um estado vazio com "Importar
      extrato".
- [ ] Importar um PDF válido abre o detalhe da dívida. PDF inválido, extrato não suportado e
      extrato que o motor não reproduz mostram mensagens breves em PT-BR, sem texto técnico.
- [ ] O detalhe segue o layout escolhido. Os números batem com a API: o saldo de hoje, os
      totais anuais (somam os totais pagos + a pagar) e a separação entre o que o extrato registra
      e a projeção.
- [ ] Alterar a correção projetada atualiza a projeção. Renomear e excluir funcionam; excluir pede
      confirmação.
- [ ] Testes: domain e service para os totais anuais, `paidOut` e o principal das extras; testes da
      `debts.presentation.ts` (séries do gráfico, próximas parcelas, erros de importação, arquivo,
      taxa de correção).
- [ ] `pnpm check`, `pnpm test` e `pnpm build` verdes; a tela conferida rodando contra a API com o
      PDF sintético, nos temas claro e escuro.

## Dependencies
- T003 (PR #3). Este PR fica empilhado sobre o #3.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo + maquete)
- [x] Scope and non-goals explicit

## Log
- 2026-11-13 — Layout escolhido: lista do A; detalhe do C com o gráfico de saldo do A no lugar
  da barra de trajetória. Maquete privada: https://claude.ai/artifact/8EDaHNSu2yp5sPky4YhZyR
