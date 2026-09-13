# Arquitetura

O OS Fácil é local-first. Toda gravação acontece primeiro no IndexedDB do aparelho; o servidor recebe as alterações depois, quando houver conexão. A tela nunca espera a rede.

## Dois modos

| | Demonstração (GitHub Pages) | Conectado (Supabase) |
| --- | --- | --- |
| Dados | Só no navegador | No aparelho e no servidor |
| Login | Não tem | E-mail e senha de operador autorizado |
| Offline | Abre, recarrega e grava sem rede | Grava sem rede depois de aberto; abrir exige validar a sessão online |
| Sincronização | Não há servidor | A cada 30 s, ao voltar a conexão e no botão "Tentar agora" |

O modo é decidido na compilação: `build:demo` usa `--mode demo`, que desliga o cliente Supabase mesmo que haja variáveis configuradas. Os dois modos são PWA.

## Banco local

Dexie sobre IndexedDB (`src/db/database.ts`). Coleções:

- `clientes`, `ordens`: dados privados. A OS guarda o status atual.
- `eventos`: histórico de mudanças de status. Só inserido, nunca alterado.
- `assinaturas`: assinatura do cliente em PNG. Só inserida; vale a mais recente.
- `fotos`: imagens reduzidas no navegador antes de salvar. Só inseridas.
- `filaSync`: operações aguardando envio.
- `configuracoes`: controle dos dados de demonstração.

No modo conectado há um banco por projeto e usuário, para que dois operadores no mesmo navegador não misturem dados.

Toda função que grava (`criarOrdem`, `atualizarStatus`, `salvarAssinatura`, `salvarFoto`) grava o dado e enfileira a operação na mesma transação. As três primeiras validam antes os mesmos limites que o banco impõe (`src/domain/validacao.ts`): num app offline, uma recusa do servidor chegaria horas depois, com o cliente já fora da loja. A foto é reduzida para JPEG de até 1600 px antes de salvar, normalmente bem abaixo do limite de 5 MB do bucket.

## Envio da fila

Implementado em `src/sync/supabase-engine.ts`; as regras de decisão ficam em `src/domain/fila.ts`, sem rede, e são testadas à parte.

**Ordem.** Clientes, depois OS, eventos, assinaturas e fotos. Dentro de cada tipo, pela ordem de criação. A OS precisa do cliente no servidor, e o resto precisa da OS.

**Escrita.** Cada operação vai para a RPC `sincronizar_operacao`. Nenhuma tabela aceita escrita direta do navegador. A RPC valida a operação, grava um recibo com o hash do conteúdo e aplica a alteração na mesma transação. Se a conexão cair depois de gravar e antes da resposta, o reenvio encontra o recibo e é reconhecido como repetição. Reusar o id com conteúdo diferente é recusado. Por isso o envelope enviado não inclui os contadores de tentativa.

**Falhas.** Há dois tipos, tratados de formas opostas:

- *Passageira*: rede, limite de envios por minuto, sessão expirada. O ciclo para, porque as próximas operações falhariam igual. A operação espera 5 s, 15 s, 1 min, 5 min e depois 30 min a cada nova tentativa.
- *Definitiva*: o banco recusou os dados (erros das classes 22 e 23 do PostgreSQL) ou o arquivo (400, 413, 415 no Storage), ou a foto não existe mais no aparelho. Nova tentativa não resolve. A operação é marcada como recusada e sai do caminho; o resto da fila segue. Ficam retidas apenas as que dependem dela. A tela **Sincronização** lista as recusadas com o motivo e permite tentar de novo ou descartar.

## Download

Depois de enviar, o aparelho baixa as tabelas em páginas de 500 registros e as fotos que ainda não tem. Um registro que ainda tem operação na fila não é sobrescrito: a versão local vale até ser enviada.

O download é completo a cada ciclo, sem filtro por data de alteração. Serve a uma oficina com poucas centenas de ordens; com volume maior, o próximo passo seria baixar só o que mudou desde o último ciclo.

## Conflitos

OS e cliente são atualizados pela linha inteira, e vale a versão com `atualizadaEm`/`atualizadoEm` mais recente. A regra está no `where` do upsert da RPC, e a RPC responde ok mesmo quando descarta a alteração mais antiga. Na interface atual, o único dado que muda depois de criado é o status da OS.

Isso é aceitável para o status porque cada mudança também gera um evento, e eventos nunca se perdem: o histórico mostra as duas mudanças, e o status atual fica com a mais recente.

Tudo o mais é só inserido, com UUID gerado no aparelho: eventos, assinaturas e fotos. Não há conflito possível entre duas inserções.

A assinatura já foi coluna da OS, e aí o "último vence" da linha inteira a apagava: assinatura colhida offline às 12:10, status mudado em outro aparelho às 12:15, e a assinatura sumia dos dois lados, sem aviso. A migração 004 e a versão 3 do banco local a transformaram em registro próprio. O teste desse cenário está em `tests/sincronizacao.test.ts` e em `supabase/testar-integracao.sql`.

Os horários vêm do relógio do aparelho. A RPC recusa datas mais de 5 minutos no futuro, mas um relógio atrasado ainda pode perder uma disputa de status que deveria ganhar.

## Numeração

O número da OS criada offline é provisório. No modo conectado, o número definitivo é dado pelo banco ao receber a OS e substitui o local no download seguinte. Um comprovante impresso antes de sincronizar leva o número provisório.

## Portal do cliente

Cada OS tem um código público de 16 caracteres, com cerca de 80 bits de entropia, gerado por `crypto.getRandomValues`. O alfabeto de 32 símbolos exclui `0`, `1`, `I` e `O`, e 32 divide 256, então o sorteio não tem viés. O código não contém número da OS, telefone nem data.

A consulta pública é a função `consultar_os`, liberada para visitantes anônimos. Ela devolve aparelho, marca, modelo, número, status e a lista de etapas com data. Não devolve nome, telefone, documento, IMEI, defeito, observações, fotos nem assinatura. Um código fora do formato é recusado na própria página, sem consultar o banco.

Na demonstração, o portal lê o IndexedDB, então o link só funciona no navegador em que a OS foi criada.

## Testes

- `tests/`: Vitest com `fake-indexeddb`. O motor de sincronização é testado contra `tests/servidor-falso.ts`, um servidor em memória que reproduz o que o cliente enxerga da RPC: códigos de erro, chaves estrangeiras e o `where` de data.
- `supabase/testar-integracao.sql`: roda no banco de verdade, dentro de uma transação desfeita no final. Cobre operador, RLS, escrita direta bloqueada, idempotência, privacidade do portal e a preservação da assinatura.
- `supabase/verificar-seguranca.sql`: auditoria somente leitura de RLS e privilégios.
