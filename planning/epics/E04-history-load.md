# E04: Carga do histórico

- **Status:** in-flow
- **Priority:** P1
- **Captured:** 2026-11-13, na validação local do E01, como "Preenchimento histórico de cartão".
  Ampliado no mesmo dia.

## Outcome (the why)
Ter todo o histórico financeiro no app, com o saldo de cada conta batendo com o extrato no fim de
cada mês, para acompanhar a evolução desde o início. Do corte para a frente, o uso é mês a mês.

## Decisões (2026-11-13)
- **Fonte: extratos e faturas em PDF.** Eles trazem tudo o que de fato entrou e saiu, não só o que
  foi anotado. A planilha pessoal tem só o total do mês e vira conferência: um relatório de
  diferenças por mês.
- **Contas reais, não uma conta "Histórico".** Cada linha do extrato já diz a conta, então o saldo
  do app bate com o banco por construção.
- **Leitura dos PDFs: conversão local (opção A).**
  - Os PDFs são lidos fora do repositório e viram arquivos XLSX no modelo de importação do app
    (Data, Descrição, Valor, Tipo, Categoria).
  - A carga usa a importação existente, com desfazer por lote.
  - Arquivos e conversões ficam numa pasta privada; nenhum dado real entra no repositório.
  - O leitor de PDF no produto (opção B) fica para quando o uso mensal depender de PDF, se o banco
    não exportar OFX.
- **Data de corte: 1/11/2026.**
- **Carga de trás para a frente:** outubro/2026 é o piloto; depois, um mês por vez até o início.

## Roteiro de cada mês
1. **Abertura.** Um "Ajuste de saldo" no 1º dia do mês, com o saldo anterior do extrato. Ao
   carregar um mês mais antigo, o ajuste de abertura do mês seguinte sai e um novo entra no mês
   carregado.
2. **Entradas primeiro.** Transferência entre contas exige saldo disponível
   (`INSUFFICIENT_TRANSFER_BALANCE`); despesa não.
3. **Gastos do extrato da conta.** Três tipos de linha entram de outro jeito:
   - pagamento de fatura: entra pelo cartão (passo 4);
   - transferência entre contas próprias: vira transferência (`type: "transfer"`);
   - débito do financiamento: despesa comum, porque a dívida só lança da próxima parcela em diante.
4. **Cartões, fatura por fatura, em ordem.**
   - Importar os itens na fatura do cartão e depois "Pagar fatura" pelo valor cheio, na data real.
   - O limite só conta faturas em aberto; pagar antes de importar a próxima evita a trava.
5. **Conferência (critério de paridade).**
   - Saldo do app no fim do mês igual ao saldo do extrato, centavo a centavo, em cada conta.
   - Total de cada fatura igual ao pagamento (sem rotativo, pagamento sempre cheio).
   - Diferença por mês entre os extratos e a planilha, num relatório privado.

## Riscos
- A importação de XLSX não detecta duplicadas (sem `importExternalId`). A conversão tira as
  linhas repetidas na virada do mês, e a conferência de saldo pega o que escapar.
- O banco local passa a guardar dados reais:
  - o volume não pode ser removido;
  - os segredos saem da pasta temporária da sessão;
  - um backup é feito antes de cada lote.

## Non-goals
- Investimentos (depois).
- Leitor de PDF no produto (opção B).
- Conciliação automática na importação (E05). No histórico, os três casos são resolvidos na
  conversão.
- Parcelas anteriores "sem mexer no saldo", ideia da captura original. Deixou de ser necessária,
  porque as contas reais são carregadas.

## Tasks
| ID | Task | Status | Notes |
|----|------|--------|-------|
| T009 | [Piloto: carga de outubro/2026](../tasks/T009-history-pilot-october.md) | done | operação de dados, sem `/flow` |
| T010 | [Carga para trás, mês a mês](../tasks/T010-history-backfill.md) | in-flow | depois do T009 validado |
| T011 | [Parcela inicial do cartão evidente e corrigível](../tasks/T011-card-start-installment.md) | inbox | produto, via `/flow` |

## Log
- 2026-11-13 — Capturado como "Preenchimento histórico de cartão" (problemas da parcela inicial,
  agora no T011).
- 2026-11-13 — Ampliado para "Carga do histórico". Decisões acima. Promovido a P1.
