# Lazinho Vendas

App dos vendedores do Pão de Queijo Lazinho (Pedaço de Minas Alimentos).

- **App do vendedor:** https://lucianopereirabm.github.io/lazinho/ — entra com *usuário* (primeiro nome) e *senha*.
- **Gestão:** https://lucianopereirabm.github.io/lazinho/gestao.html — e-mail e senha do administrador.

## O que o vendedor faz
Digita pedido, acompanha os pedidos (enviado → recebido → faturado → entregue, com a data), vê os clientes
(quem comprou no mês e a última venda) e registra visitas com fotos, preços da loja e estoque do cliente.
Funciona sem internet: o que for registrado fica no celular e sobe sozinho quando o sinal voltar.

## Como instalar no celular
- **Android:** abrir o link no Chrome → menu ⋮ → *Adicionar à tela inicial* / *Instalar app*.
- **iPhone:** abrir o link no **Safari** → botão Compartilhar → *Adicionar à Tela de Início*.

## Regras de segurança
`firestore.rules` deve estar publicado em Firebase Console → Firestore Database → Regras.
As senhas dos vendedores **não** ficam neste repositório.

## Ligação com o Portal Lazinho
O Portal envia a *carga* (clientes, produtos, condições, vendedores e resumo de vendas) e importa os pedidos novos.
Alternativa por arquivo: Gestão → *Carga do Portal*.
