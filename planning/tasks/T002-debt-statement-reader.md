# T002: Leitor de extrato — modelo canônico + adaptador Itaú DDC

- **Status:** in-review
- **Epic:** E01 — Dívidas: financiamento com leitura de extrato
- **Spec:** este arquivo + `docs/debts.md` (seção "Leitura de extrato")
- **PR:** —

## What & why
Transformar o PDF de um demonstrativo bancário na entrada do motor (T001). A leitura é um ponto de
extensão: um modelo canônico de extrato e um leitor por banco/formato. O primeiro é o DDC do Itaú;
o Bradesco (T006) entra como um segundo leitor, sem mudar o motor nem o modelo.

## Scope
- `packages/domain/src/debt-statements.ts`:
  - modelo canônico `DebtStatement` (termos, parcelas com situação paga/aberta/projetada, encargos
    por código, amortizações extraordinárias com modo e origem dos recursos);
  - o contrato `DebtStatementReader` (`matches(lines)`, `read(lines)`);
  - `scheduleInputFromStatement(statement, projection)`:
    - fatores de correção exatos (seis casas) deduzidos das linhas;
    - parcelas pagas e a aberta como conhecidas, com os encargos reais;
    - regras de encargos deduzidas das parcelas projetadas pelo banco.
- `packages/domain/src/debt-statement-itau-ddc.ts`: leitor do DDC do Itaú. É estrito: uma linha de
  tabela ilegível, uma operação desconhecida ou outro sistema de amortização geram erro tipado, em
  vez de números errados.
- `packages/domain/src/debt-statement-readers.ts`: registro dos leitores e
  `readDebtStatement(lines)`.
- `apps/api/src/utils/pdf-text-lines.ts`: PDF → linhas de texto (`pdfjs-dist` 6.4.299, fixado),
  agrupando os itens por linha e ordenando pela posição horizontal.

## Non-goals
- Persistência, upload e rota de importação (T003).
- Leitor do Bradesco (T006, aguardando extrato de exemplo).
- OCR de PDF escaneado.

## Acceptance criteria
- [x] Um DDC sintético (contrato fictício, placeholders no lugar de nome e documentos) passa por
      leitura → entrada → motor e reproduz todas as linhas do extrato (amortização, juros,
      encargos, total e saldo), inclusive as parcelas projetadas pelo banco.
- [x] A dedução das regras de encargos reproduz exatamente os valores projetados, inclusive as
      mudanças de faixa e um encargo que zera na última parcela.
- [x] Texto que não é um extrato suportado, linha de tabela ilegível, operação desconhecida e
      sistema de amortização não suportado geram `DebtStatementError` com código próprio.
- [x] O utilitário de PDF extrai as linhas, na ordem, de um PDF sintético versionado.
- [x] Teste local opt-in (`DEBTS_PRIVATE_STATEMENT`) com o extrato real reproduz todas as
      linhas, encargos e totais inclusive.
- [x] `pnpm check`, `pnpm test` e `pnpm build` verdes.

## Dependencies
- T001 (motor), no branch `feat/debts-engine`. Este PR fica empilhado sobre ele.

## Definition of Ready
- [x] Single coherent outcome, fits one `/flow` run
- [x] Testable acceptance criteria written
- [x] Dependencies resolved or sequenced
- [x] Has a `/spec` (este arquivo)
- [x] Scope and non-goals explicit

## Log
- 2026-11-12 — `pdfjs-dist` avaliado: é da Mozilla e amplamente usado. Fixado em 6.4.299
  (03/10/2026), porque a 6.5.438 tem menos de duas semanas.
- 2026-11-12 — A reconstrução de linhas pelo `pdfjs` foi conferida no extrato real, com o
  mesmo formato da análise.
- 2026-11-12 — Os totais do banco podem trazer ajustes de centavo que não aparecem nas colunas (uma
  parcela mostra "Ajuste Financeiro" fora do total e a seguinte vem R$ 0,01 menor). Por isso o
  total real de uma parcela conhecida passou a ter precedência no motor, com teste próprio.
- 2026-11-12 — RED: 10 testes novos falhando pelo comportamento ausente. GREEN: todos verdes. O PDF
  real passa pela cadeia inteira (PDF → linhas → extrato → motor), com todas as linhas, encargos e
  totais iguais aos do banco. `pnpm check`, `pnpm test` (885) e `pnpm build` verdes.
