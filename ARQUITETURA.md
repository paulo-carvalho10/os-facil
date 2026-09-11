# Arquitetura do MVP

## Fonte local

O IndexedDB é a fonte de verdade imediata da interface. A abertura da OS, cada evento, foto e assinatura são persistidos em uma transação Dexie antes que qualquer comunicação de rede seja tentada.

As coleções são:

- `clientes`: dados privados do cliente;
- `ordens`: equipamento, atendimento, status e código público;
- `eventos`: histórico imutável de mudanças de status;
- `fotos`: blobs reduzidos no próprio navegador;
- `filaSync`: operações idempotentes que aguardam o servidor;
- `configuracoes`: versão dos dados demonstrativos e preferências locais.

## Fila de sincronização

Toda escrita relevante cria uma operação com UUID próprio. Esse UUID segue no cabeçalho `x-idempotency-key`, permitindo que o servidor descarte uma repetição depois de uma queda de conexão.

O sincronizador roda quando a aplicação abre, quando a rede volta e a cada 30 segundos. Falhas usam atrasos de 5 segundos, 15 segundos, 1 minuto, 5 minutos e 30 minutos. Uma operação só sai da fila depois da confirmação do servidor.

Conflitos de edição usam `atualizadoEm`: prevalece o registro mais recente. Eventos não são atualizados; cada mudança produz outro evento. Fotos ficam como blob no IndexedDB e entram numa fila de upload separada.

## Código público

O código tem 16 caracteres e aproximadamente 80 bits de entropia, gerados por `crypto.getRandomValues`. Foram removidos `0`, `1`, `I` e `O` para evitar erro de leitura. O código não contém número da OS, telefone, data ou outro dado enumerável.

O portal público recebe apenas aparelho, marca, modelo, status e eventos marcados como públicos. Nome, telefone, documento, IMEI, defeito interno, fotos e assinatura nunca fazem parte da resposta pública.

## Back-end opcional

O front funciona integralmente sem servidor. Ao configurar `VITE_SYNC_API_URL`, a fila envia suas operações para uma API simples. A definição relacional e as regras de acesso para Supabase estão em `supabase/schema.sql`. Sem essa variável, a demonstração permanece em modo local e todas as funções podem ser avaliadas no mesmo navegador.
