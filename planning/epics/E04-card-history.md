# E04: Preenchimento histórico de cartão

- **Status:** inbox
- **Priority:** P3
- **Captured:** 2026-11-13, na validação local do E01

## Outcome (the why)
Começar a usar o app com compras parceladas que já estão no meio do caminho, sem atrito e sem
efeitos colaterais no saldo das contas.

## Problemas observados
- **Parcela inicial escondida.** "Primeira parcela a registrar" é um select discreto na criação. Ao
  cadastrar uma compra que já está na 6ª parcela, é fácil deixar em "1ª".
- **Sem correção na edição.** A parcela inicial não pode ser corrigida depois: o formulário de
  edição esconde o campo e o contrato de atualização nem o aceita. A saída hoje é remover o
  parcelamento inteiro e recriar.
- **Histórico custa caro.**
  - Para registrar as parcelas anteriores, é preciso criar a compra na fatura antiga.
  - As faturas passadas ficam em aberto, e fechá-las registra um pagamento saindo de uma conta,
    mexendo no saldo.
  - Uma fatura já marcada como paga recusa a compra (`INVOICE_ALREADY_PAID`).

## Ideias a refinar (não decididas)
- Deixar a parcela inicial evidente, por exemplo como "Em qual parcela você está?".
- Permitir corrigir a parcela inicial na edição, reconstruindo a série.
- Registrar parcelas anteriores como histórico já pago, sem gerar pagamento de fatura nem mexer no
  saldo.

## Non-goals
- Dívidas e financiamentos (E01).

## Tasks
_A decompor quando o épico for priorizado._
