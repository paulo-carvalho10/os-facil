# Supabase do OS Fácil

Projeto `lxeasnctuhpnsxqhbnlc`, região São Paulo, plano gratuito. Uma única oficina; separação entre empresas pertence à V2.

## Proteções aplicadas

- RLS em clientes, ordens, eventos, fotos e operadores. Apenas contas presentes e ativas em `operadores` podem ler dados internos.
- Escritas somente pela RPC `sincronizar_operacao`: validação, recibo idempotente e alteração na mesma transação, proteção contra reuso de operação com conteúdo diferente, último timestamp vence.
- Números definitivos de OS atribuídos pelo banco. O número local é provisório até sincronizar.
- Bucket `os-fotos` privado, JPEG, máximo 5 MB. Operadores podem enviar e ler; não podem sobrescrever ou apagar objetos pela API.
- Portal público por código aleatório de 16 caracteres. Retorna aparelho e andamento; não retorna nomes, telefone, documento, IMEI, defeito, notas livres, fotos ou assinatura.
- Nenhuma service role no frontend. `.env.local` contém somente URL e chave publicável e é ignorado pelo Git.
- Cadastro público desativado no Supabase; contas novas são criadas pelo administrador. Login anônimo permanece desativado.

## Login e dispositivos

Crie a conta em Authentication com uma senha escolhida pelo próprio usuário. O administrador autoriza o UUID explicitamente:

```sql
insert into public.operadores(usuario_id) values ('UUID_DO_USUARIO')
on conflict(usuario_id) do update set ativo=true;
```

Para revogar acesso remoto, altere `ativo=false`. Não existe cadastro público no aplicativo nem autorização baseada em metadados editáveis pelo usuário.

O cache IndexedDB é separado por projeto e UUID. O banco da demonstração não é enviado para a oficina. A sincronização busca tabelas em páginas de 500 registros, preserva operações pendentes e baixa fotos autenticadas. A sessão precisa ser validada online ao abrir o painel; depois de aberto, alterações podem ser feitas offline e enviadas quando a conexão voltar.

O cache local não é criptografado. Sair encerra a sessão, mas preserva alterações locais ainda não enviadas. Use dispositivos confiáveis e proteção de sessão do sistema operacional. Revogação remota não apaga cópias que já foram baixadas.

## Verificação

`pnpm test` e `pnpm build`. No SQL Editor, `supabase/verificar-seguranca.sql` audita privilégios; `supabase/testar-integracao.sql` usa registros sintéticos em transação desfeita ao final. Sequências podem avançar durante esse teste, sem deixar atendimentos gravados.

Verificado em 13/09/2026: 13 testes locais aprovados, build aprovado, teste SQL remoto aprovado para operador, RLS, escrita direta bloqueada, idempotência e projeção pública. API anônima de clientes retorna HTTP 401; consulta pública com código inválido retorna HTTP 200/null. Primeiro operador cadastrado e ativo. A migração 003 corrige a ambiguidade da variável de recibo encontrada pelo teste remoto.

## Operação e limites

Validado no navegador em 13/09/2026: login humano, abertura da OS fictícia #1002, numeração definitiva pelo servidor, envio de foto JPEG, mudança para orçamento enviado e fila zerada. Portal consultado também pela API sem sessão: omite nota interna e dados pessoais. Objeto JPEG confirmado no Storage; tentativas de download sem sessão foram negadas. A OS e a foto sintéticas ficam identificadas como teste na oficina.

O operador confirmou no Opera que a OS #1002 e a foto criadas pelo Codex apareceram no segundo navegador. Instalação PWA e reabertura completamente offline não foram validadas nesta etapa.

Não foi configurado SMTP próprio, recuperação de senha no aplicativo, backup externo nem restauração periódica. Não há garantia de backup operacional nesta etapa. Antes de usar dados reais, definir retenção, exportação do banco e dos objetos privados e testar restauração. Consultar as condições do plano gratuito no painel antes de produção.

Os protótipos `supabase/functions/api` e `src/sync/engine.ts` não são usados pelo aplicativo atual; não fazer deploy deles. As migrações numeradas devem ser executadas uma vez por ambiente e mantidas em controle de versão.
