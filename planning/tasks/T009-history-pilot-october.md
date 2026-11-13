# T009: Piloto: carga de outubro/2026

- **Status:** refining
- **Epic:** E04 — Carga do histórico
- **Spec:** este arquivo
- **PR:** — (operação de dados, sem código de produto)

## What & why
Carregar um mês completo, com todas as contas e cartões, para ver como o histórico fica no app
antes de voltar no tempo. O piloto também prova o roteiro do E04.

## Scope
1. **Ambiente local durável:**
   - backup do banco (`pg_dump`) numa pasta privada, com restauração testada em outro banco;
   - segredos fora da pasta temporária da sessão;
   - volume mantido.
2. **Inventário no app:** criar as contas e os cartões que faltam e conferir as categorias.
3. **Conversão:** os PDFs de outubro viram arquivos XLSX.
   - Extratos: um arquivo por conta, com entradas e gastos separados.
   - Cartões: um arquivo por fatura com vencimento em outubro.
4. **Carga:** na ordem do roteiro do E04, pela tela de importação, seguindo uma lista passo a passo.
5. **Conferência:** saldos e faturas, mais o relatório de diferenças com a planilha.

## Non-goals
- Meses anteriores (T010).
- Faturas com vencimento a partir de novembro: são uso normal, depois do corte.
- Automatizar a carga (decidido depois do piloto).

## Acceptance criteria
- [ ] Backup feito antes da carga, e restauração testada num banco separado.
- [ ] O saldo de cada conta em 31/10/2026 é igual ao saldo final do extrato, centavo a centavo.
- [ ] Toda fatura com vencimento em outubro foi paga pelo valor cheio, igual ao débito no extrato
      da conta. Nenhuma ficou em aberto.
- [ ] Nenhum pagamento de fatura nem transferência entre contas próprias foi contado como despesa.
- [ ] Existe um relatório privado com a diferença de outubro entre os extratos e a planilha.
- [ ] A validação no app termina em uma decisão: seguir para o T010, ajustar o roteiro ou
      restaurar o backup.

## Dependencies
- Os PDFs de outubro (extratos e faturas) e a planilha exportada, na pasta privada.

## Definition of Ready
- [x] Single coherent outcome (operação de dados: não passa por `/flow`)
- [x] Testable acceptance criteria written (conferência de saldos)
- [ ] Dependencies resolved or sequenced (aguarda os arquivos)
- [x] Has a spec (este arquivo)
- [x] Scope and non-goals explicit

## Log
- 2026-11-13 — Criado. Opção A: conversão local, carga pela tela.
