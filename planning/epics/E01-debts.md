# E01: Dívidas — financiamento com leitura de extrato

- **Status:** in-flow
- **Priority:** P1
- **Initiative:** controle de dívidas e cartões no OpenMonetis

## Outcome (the why)
Hoje um financiamento só pode ser lançado como compra parcelada, com no máximo 60 parcelas, sem
saldo devedor e sem separar juros de amortização. Ao final desta epic, a pessoa importa o extrato
do banco e passa a ver o saldo devedor, o prazo restante, quanto já pagou e quanto ainda vai pagar
de juros e encargos, e o cronograma projetado. As amortizações extraordinárias (redução de prazo ou
de parcela) refletem no cronograma, e a parcela mensal entra nas despesas e nos compromissos
futuros.

## Scope
- Motor de cronograma puro no domain: sistema de amortização (SAC primeiro), correção monetária
  mensal (TR), juros mensais e pró-rata, amortização extraordinária com redução de prazo ou de
  parcela, e encargos (seguros e tarifa).
- Leitura de extrato como ponto de extensão: um modelo canônico de extrato e um adaptador por
  banco. O primeiro é o DDC do Itaú; o Bradesco é o segundo.
- Persistência e API: importar o extrato, listar as dívidas e consultar o cronograma.
- Tela de dívidas (resumo + cronograma + eventos).
- Integração com despesas e com "Compromissos futuros".

## Non-goals
- Simular descontos, quitação e extras futuras: a área de simulações fica na E02.
- Financiamento estudantil com IPCA semestral: fica na E03.
- Buscar a TR automaticamente no Banco Central: o histórico vem do extrato e a projeção usa uma
  hipótese informada pela pessoa.
- Sistema Price: entra quando a E03 precisar.

## Acceptance criteria (epic-level)
- [ ] Um extrato DDC do Itaú importado reproduz amortização, juros e saldo devedor de todas as
      linhas ao centavo.
- [ ] Uma amortização extra com redução de prazo recalcula o prazo pela mesma regra do banco.
- [ ] A tela mostra saldo devedor, prazo restante, juros e encargos pagos e a pagar, e o
      cronograma.
- [ ] A parcela aparece como despesa e em "Compromissos futuros".

## Tasks
| ID | Task | Status | Notes |
|----|------|--------|-------|
| T001 | Motor de cronograma SAC no domain | in-review | GREEN |
| T002 | Leitor de extrato: modelo canônico + adaptador Itaú DDC | in-review | ponto de extensão por banco |
| T003 | Persistência e API de dívidas | in-review | [#3](https://github.com/giovannivarela/openmonetis-v2/pull/3) |
| T004 | Tela de dívidas | in-review | [#4](https://github.com/giovannivarela/openmonetis-v2/pull/4) |
| T005 | Parcela como despesa + Compromissos futuros | inbox | depende de T003 |
| T006 | Adaptador Bradesco | blocked | aguardando extrato de exemplo |

## Dependencies
- Nenhuma externa. Os extratos reais e o motor de referência em Python ficam fora do repositório,
  em `../openmonetis-v2-private/`.

## Risks / open questions
- A fórmula dos juros pró-rata das extras do Itaú bateu em só 10 de 31 casos (calendário
  exponencial e linear). Isso não bloqueia a E01, porque as extras reais usam os valores do banco;
  bloqueia a simulação de extras futuras (E02).
- A MIP do Itaú cai em abr/2032 por um motivo desconhecido. As taxas de encargos vêm do próprio
  extrato.
- Arredondamento em ponto flutuante: o motor trabalha em centavos inteiros, com arredondamento
  "half-up" explícito.
- O fork é público: nenhum dado real de contrato entra em commits. As fixtures publicadas são
  sintéticas.

## Log
- 2026-11-12 — Regras do DDC do Itaú (SFH, SAC, TR) obtidas por engenharia reversa e
  reproduzidas ao centavo, linha a linha, por um motor de referência em Python, fora do repo.
- 2026-11-12 — Entrada de dados: importar o extrato em PDF (opção A), aprovada pela pessoa.
- 2026-11-12 — O Bradesco é o segundo banco a suportar: a leitura de extrato vira um
  ponto de extensão com um adaptador por banco (T002 com Itaú, T006 com Bradesco).
- 2026-11-12 — Ordem aprovada: motor → leitor → persistência/API → tela → integração. O leitor
  passou para antes da persistência, para que o schema nasça do modelo canônico.
