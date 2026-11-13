# Compromissos futuros

O relatório em **Relatórios → Compromissos futuros** mostra, mês a mês, quanto da renda prevista
já está comprometido com o que foi contratado ou lançado. O período é uma faixa de até 24 meses
(padrão: 6 meses a partir do mês atual), exibida em uma única linha. Clique no período e depois
no mês inicial e final, em qualquer ordem, ou use um dos atalhos; Aplicar atualiza o relatório e
fechar o seletor mantém o intervalo anterior.

Cada mês soma quatro camadas, sempre na parte da pessoa titular (`admin`):

- **Parcelas:** todas as parcelas rastreadas de séries parceladas no mês, pagas ou pendentes.
- **Recorrentes:** ocorrências de despesas recorrentes ativas, expandidas por período e contadas
  no mês de vencimento (ou da fatura, quando no cartão).
- **Financiamentos:** parcelas de [dívidas](debts.md) lançadas como despesas (pagas ou pendentes),
  no mês de vencimento.
- **Contas avulsas:** as demais despesas únicas já lançadas no mês, de qualquer forma de pagamento;
  compras no cartão entram pelo período da fatura.

Estornos e descontos de antecipação lançados no mês são abatidos do total comprometido
(**Estornos e descontos**), com a mesma regra do Dashboard, e nunca contam como receita.

A **receita prevista** soma receitas recorrentes ativas e receitas avulsas lançadas no mês.
Contas marcadas como **Fora do saldo total** são ignoradas em todas as camadas, inclusive parcelas
(pela conta da transação ou, no cartão, pela conta do cartão).

Para cada mês a API devolve o total comprometido, a folga (receita menos comprometido), o
percentual da receita (`null` sem receita prevista) e a situação: `healthy` abaixo de 60%,
`attention` de 60% a 85% e `critical` a partir de 85% ou com compromissos e sem receita. Também
devolve o primeiro mês de alívio (queda de pelo menos 10% sobre o mês anterior, considerando só
parcelas, recorrentes e financiamentos, já que contas avulsas futuras raramente estão lançadas) e
os parcelamentos que terminam no horizonte, com o valor mensal liberado. As parcelas de um
financiamento ficam lançadas para todos os meses à frente, então o fim dele também é um alívio.

Limitações: faturas de cartão não são somadas à parte, para não duplicar as compras que já
entram por mês de fatura; receitas parceladas não entram na receita prevista; não há saldo atual
das contas nem projeção de liquidez.

`GET /reports/commitments` aceita `startPeriod=YYYY-MM` e `endPeriod=YYYY-MM` (faixa inclusiva de
até 24 meses). A sessão é obrigatória e a resposta é privada, sem cache. O OpenAPI descreve o
contrato completo.
