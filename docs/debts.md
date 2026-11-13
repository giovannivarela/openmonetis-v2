# Dívidas

O motor de dívidas (`packages/domain/src/debts.ts`) monta o cronograma de um financiamento a partir
dos termos do contrato, das parcelas já conhecidas pelo extrato do banco, das amortizações
extraordinárias e das regras de encargos. O resultado reproduz, ao centavo, o demonstrativo de um
financiamento habitacional SAC corrigido pela TR. A regra foi validada, linha a linha, contra
um extrato real.

## Entradas

- **Termos:** valor financiado, data do contrato, prazo original em meses, taxa efetiva anual e
  sistema de amortização (`sac`).
- **Parcelas conhecidas:** vencimento, fator de correção do mês (seis casas decimais, como a TR é
  publicada) e, opcionalmente, os encargos efetivamente cobrados.
- **Amortizações extraordinárias:** data, valor pago, juros pró-rata, atualização monetária e modo
  (`reduceTerm` ou `reduceInstallment`). Os juros pró-rata e a atualização vêm do banco.
- **Regras de encargos:** cada regra tem um código (por exemplo `mip`, `dfi`, `fee`) e uma data de
  início de vigência. Para o mesmo código, vale a regra mais recente já em vigor.
- **Projeção:** fator de correção mensal assumido para as parcelas que ainda não constam no extrato.

## Regras por parcela

Todos os valores são calculados em centavos inteiros, com arredondamento half-up em cada etapa,
como no extrato do banco.

1. **Taxa mensal:** `(1 + taxa efetiva anual)^(1/12) − 1`.
2. **Amortizações extraordinárias** com data anterior ao vencimento da parcela são aplicadas antes
   dela, em ordem de data. Uma extra feita no próprio dia de vencimento entra na parcela seguinte.
   Só o principal (valor − juros pró-rata − atualização monetária) reduz o saldo.
   - `reduceTerm`: o banco mantém a prestação (amortização + juros) que seria devida sem a extra e
     recalcula o prazo como `arred(saldo corrigido ÷ (prestação − juros do novo saldo))`.
   - `reduceInstallment`: o prazo é mantido e a amortização cai.
3. **Saldo corrigido:** `arred(saldo × fator de correção)`, com o fator aplicado de forma exata em
   seis casas.
4. **Juros:** `arred(saldo corrigido × taxa mensal)` quando o vencimento cai no mesmo dia do mês
   seguinte ao vencimento anterior (ou no último dia, quando o mês é mais curto). Em período
   quebrado, como uma troca de dia de vencimento, os juros são
   `arred(saldo corrigido × ((1 + taxa)^(dias/30) − 1))`.
5. **Amortização SAC:** `arred(saldo corrigido ÷ meses restantes)`. O saldo final é o saldo
   corrigido menos a amortização.
6. **Encargos:** o valor real informado para a parcela tem precedência. Sem ele, vale a regra:
   - `balanceRate`: `arred(saldo corrigido × taxa)`, como o seguro MIP;
   - `indexedAmount`: `arred(base × fatores acumulados)`; a base vale na primeira parcela em que a
     regra está em vigor e é corrigida pelos fatores das parcelas seguintes, como o seguro DFI;
   - `fixedAmount`: valor fixo, como a tarifa de administração.
7. **Prestação:** amortização + juros + encargos.

Depois da última parcela conhecida, o motor projeta mensalmente, no mesmo dia do último
vencimento, até o saldo zerar.

## Resumo

`summarizeDebtSchedule` separa as parcelas vencidas até uma data das restantes e devolve:
- o saldo atual: o saldo após a última parcela vencida, menos o principal das amortizações extras
  feitas desde aquele vencimento. A extra entra no cálculo da parcela seguinte, mas o saldo cai no
  dia em que ela é feita. Uma extra feita no dia de um vencimento entra depois daquela parcela;
- os totais pagos e a pagar de amortização, juros e encargos, separados pelo vencimento, e o
  principal extraordinário, separado pela data de cada extra;
- os meses cortados em relação ao prazo original.

Uma parcela que vence hoje já conta como paga, então a próxima parcela é a seguinte.

## Leitura de extrato

O histórico de uma dívida vem do demonstrativo do banco. A leitura tem duas etapas:

1. **PDF → linhas** (`apps/api/src/utils/pdf-text-lines.ts`, com `pdfjs-dist`): os trechos de texto
   de cada página viram linhas, de cima para baixo e da esquerda para a direita.
2. **Linhas → extrato canônico** (`readDebtStatement` em `packages/domain`): cada banco/formato tem
   um leitor (`DebtStatementReader`), e o primeiro que reconhece o texto o converte para o modelo
   `DebtStatement`. Esse modelo traz termos, parcelas com situação, encargos por código e
   amortizações extraordinárias com a origem dos recursos. Um banco novo é um leitor novo; o motor
   não muda.

Os leitores são estritos. Texto não reconhecido, uma linha de tabela ilegível, uma operação
desconhecida ou um sistema de amortização não suportado geram `DebtStatementError` com código
próprio, em vez de números errados.

`scheduleInputFromStatement` converte o extrato na entrada do motor:
- as parcelas pagas e a aberta viram parcelas conhecidas, com os encargos e o total cobrados. O
  total do banco tem precedência, porque pode trazer ajustes de centavos que não aparecem nas
  colunas;
- o fator de correção de cada parcela é deduzido dos saldos consecutivos, em seis casas;
- os encargos que o banco projetou viram regras:
  - os proporcionais ao saldo viram faixas de taxa, cada uma valendo enquanto uma única taxa
    reproduz todos os valores; mudança de faixa etária e encargo zerado geram uma faixa nova;
  - os fixos e indexados viram uma regra a cada mudança de valor.

### Itaú — Demonstrativo Descritivo de Crédito (DDC)

- O valor financiado e a data do contrato vêm da operação "Implantacao de contrato".
- O prazo original é deduzido da primeira parcela: saldo corrigido ÷ amortização.
- As amortizações "redução de prazo" e "redução de parcela" viram extras, com origem "recurso
  próprio" ou FGTS. "Alteração de dia de vencimento" não precisa de tratamento, porque as datas das
  parcelas já a refletem.
- Encargos: MIP (proporcional ao saldo), DFI (indexado), seguro residencial, TCA, multa, mora e
  acordo parcelado (fixos). "Ajuste Financeiro" e "FGTS Mensal" não são encargos: o banco não os
  soma ao total.

## API

Todas as rotas exigem sessão, respondem com cache privado e filtram pelo usuário autenticado.

| Método | Rota | O que faz |
| --- | --- | --- |
| `GET` | `/debts` | Lista as dívidas com resumo e próxima parcela. |
| `POST` | `/debts/imports` | Importa um extrato em PDF (`{ fileName, contentBase64 }`). |
| `GET` | `/debts/{id}` | Resumo, cronograma completo, amortizações extraordinárias e totais por ano. |
| `PATCH` | `/debts/{id}` | Altera o nome e a hipótese de correção mensal da projeção. |
| `DELETE` | `/debts/{id}` | Remove a dívida e seus extratos. |

- **Persistência:** `debts` guarda a identidade da dívida (banco, formato, referência do contrato,
  nome e hipótese de correção). `debt_statements` guarda o extrato canônico de cada importação, em
  `jsonb`. O cronograma não é gravado: é recalculado pelo motor a partir do extrato mais recente.
- **Reimportação:** a dívida é identificada por usuário, banco e referência do contrato. Um extrato
  mais novo passa a valer; o mesmo extrato (mesma data de emissão) substitui o anterior. O nome e a
  hipótese de correção escolhidos pela pessoa são mantidos.
- **Trava de integridade:** antes de gravar, o motor precisa reproduzir todas as parcelas pagas e a
  aberta do próprio extrato. Se não reproduz, a importação é recusada com `statement_not_reproduced`
  e nada é gravado.
- **Erros da importação (400):** `invalid_pdf`, `unsupported_statement`,
  `unsupported_amortization_system`, `unsupported_operation`, `unreadable_line`, `missing_field` e
  `statement_not_reproduced`.
- O PDF é lido em memória e não é armazenado. Importações têm limite de 10 por minuto por pessoa.
- O resumo considera vencidas as parcelas com vencimento até a data atual no Brasil. As situações
  de cada parcela (paga, aberta, projetada) vêm do extrato. Por isso, um extrato antigo mostra como
  projetadas parcelas que já venceram: importe um mais recente.
- "Zerar dados" remove dívidas e extratos.
- **Resumo:** além do saldo atual e dos totais pagos e a pagar, traz `paidOut` (parcelas vencidas
  + valor integral das extras feitas) e `lastDueDate` (vencimento da última parcela). Cada extra
  traz `principal`, o que ela abateu do saldo. `yearlyBreakdown` soma amortização, juros, encargos
  e total por ano de vencimento, as extras pelo ano em que foram feitas, e marca com
  `remainingOnly` os anos que só têm parcelas a vencer. Esses números vêm do domain; a tela só os
  exibe.

## Parcelas em Lançamentos

`PUT /debts/{id}/expenses` (`{ accountId, categoryId, paymentMethod }`) lança as parcelas a vencer
como despesas pendentes. `DELETE /debts/{id}/expenses` para de lançar.
- **Forma:** cada parcela vira uma despesa regular, pendente, com vencimento e data iguais ao
  vencimento da parcela, valor igual ao total da parcela e nome "{dívida} · parcela N". Por isso ela
  entra em Contas a pagar, nos avisos de vencimento e na lista do mês, e segue as regras de
  vencimento do app. As formas aceitas são boleto, cartão de débito, Pix e transferência bancária.
- **Início:** a primeira parcela lançada é a próxima a vencer na ativação. O histórico não é criado,
  porque costuma já existir como outros lançamentos.
- **Sincronização** (`planDebtInstallmentExpenses`, no domain). Roda ao ativar, ao reimportar, ao
  mudar a correção e ao renomear:
  - cria as parcelas que faltam;
  - atualiza valor e vencimento das pendentes;
  - remove as pendentes que saíram do cronograma;
  - aplica a conta, a categoria, a forma e o nome atuais às pendentes.
  Lançamentos já pagos nunca mudam.
- **Ligação:** `transactions.debt_id` e `transactions.debt_installment_number`, únicos por dívida.
  Parar de lançar ou excluir a dívida remove as pendentes. As pagas ficam; ao excluir a dívida,
  perdem a ligação.
- **Erros:**
  - `account_not_found`: conta de outra pessoa ou arquivada;
  - `category_not_found` e `category_not_expense`;
  - `debt_paid_off`: sem parcelas a vencer;
  - `debt_expenses_conflict` (409): duas gravações simultâneas da mesma dívida.
  Ativar ou alterar tem limite de 20 por minuto por pessoa.
- **Conta arquivada:** enquanto a conta escolhida estiver arquivada, a sincronização não roda.
  Escolha outra conta em "Alterar" para retomar. Excluir a conta remove os lançamentos dela e
  desativa o lançamento das parcelas na dívida.
- **Edição manual:** os lançamentos pendentes pertencem à dívida. Um valor, nome, conta ou
  categoria editado à mão volta ao da dívida na próxima sincronização, e uma parcela pendente
  excluída à mão é recriada. Para tirar as parcelas de Lançamentos, use "Parar de lançar".
- **Limitação:** o débito da parcela que chega pela importação do extrato da conta ainda vira outro
  lançamento. O dedup das duas fontes é a T008.

## Tela

`/debts` lista as dívidas. `/debts/{id}` mostra o detalhe de cada uma:
- o saldo devedor de hoje e um gráfico do saldo do contrato até a quitação. O que já venceu fica
  em linha cheia e a projeção, tracejada; as amortizações extras aparecem como marcadores;
- próxima parcela, total pago até hoje, juros pagos e juros a pagar;
- a composição anual das parcelas, com o campo da correção mensal projetada;
- a lista de amortizações extras e as próximas parcelas, com o cronograma completo sob demanda.

A importação aceita PDF de até 5 MB. Os erros da API aparecem como mensagens curtas, sem o código.

## Validação

- `packages/domain/src/debts.test.ts` cobre cada regra com casos pequenos calculados à mão.
- O teste também compara, linha a linha, a fixture sintética
  `packages/domain/src/fixtures/debts-sac-synthetic.json`, gerada por uma implementação de
  referência independente, com um contrato fictício que exercita todas as regras.
- `packages/domain/src/debt-statements.test.ts` lê um DDC sintético (contrato fictício e
  placeholders no lugar de nome e documentos) e confere que a cadeia leitura → entrada → motor
  reproduz todas as linhas, incluindo as projetadas, os encargos e os totais.
- `apps/api/src/services/debts.service.test.ts` cobre a importação, a reimportação, as recusas sem
  gravação, a hipótese de correção e o isolamento entre usuários.
- `pnpm test:debts:integration` importa um PDF sintético do DDC por HTTP, com PostgreSQL, e confere
  o cronograma, a reimportação, o isolamento, a hipótese de correção e a remoção em cascata.
- Extratos reais nunca entram no repositório. Para conferir um extrato localmente, gere fixtures no
  mesmo formato e rode:

```bash
DEBTS_PRIVATE_FIXTURE=caminho/da/fixture.json DEBTS_PRIVATE_STATEMENT=caminho/do/extrato.json \
  node --import tsx --test packages/domain/src/debts.test.ts packages/domain/src/debt-statements.test.ts
```

## Limitações conhecidas

- Os juros pró-rata de uma amortização extraordinária são uma entrada, porque a fórmula do banco
  ainda não foi identificada. Simular extras futuras depende dela.
- O sistema Price e a correção semestral por IPCA ainda não são suportados.
