# E05: Conciliação na importação de extratos

- **Status:** inbox
- **Priority:** P2
- **Captured:** 2026-11-13, na validação local do E01

## Outcome (the why)
Importar o extrato de cada conta sem contar duas vezes o que já está no app. Hoje a importação só
cria receitas e despesas, e a detecção de duplicadas só reconhece a mesma linha reimportada da
mesma fonte (`importExternalId`).

## Os três casos (mesmo problema: casar uma linha importada com algo já registrado)
1. **Parcela de financiamento (era T008, do E01).** O débito da parcela chega pelo extrato da
   conta e a parcela já existe como despesa pendente lançada pela dívida. Casar e dar baixa na
   pendente, em vez de criar outro lançamento.
2. **Pagamento de fatura.** A linha "pagamento de fatura" do extrato da conta corrente vira uma
   despesa. As compras já estão no cartão, então isso duplica o gasto. Casar com o pagamento da
   fatura do cartão.
3. **Transferência entre contas próprias.** A saída da conta A e a entrada da conta B viram despesa
   e receita, inflando os dois totais. Casar o par e registrar como transferência (`type:
   "transfer"`, dois lançamentos ligados por `transferId`).

## Ideias a refinar (não decididas)
- Um passo de casamento na revisão da importação. Ele sugere o par (mesmo valor, data próxima,
  contas da pessoa) e a pessoa confirma, para nunca casar sozinho em silêncio.
- Reaproveitar a baixa existente (`PATCH /transactions/settlement`) no caso 1 e o pagamento de
  fatura no caso 2.

## Gatilho
Quando os extratos das contas passarem a ser importados com frequência, ou existir conexão
bancária.

## Tasks
| ID | Task | Status | Notes |
|----|------|--------|-------|
| T008 | Dedup das parcelas com o extrato importado da conta | inbox | movida do E01; caso 1 |
