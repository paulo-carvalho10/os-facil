# Supabase do OS Fácil

Projeto `lxeasnctuhpnsxqhbnlc`, região São Paulo, plano gratuito. Uma única oficina; separação entre empresas pertence à V2.

## Proteções aplicadas

- RLS em clientes, ordens, eventos, assinaturas, fotos e operadores. Apenas contas presentes e ativas em `operadores` podem ler dados internos.
- Escritas somente pela RPC `sincronizar_operacao`: validação, recibo idempotente e alteração na mesma transação, proteção contra reuso de operação com conteúdo diferente. OS e cliente usam último timestamp vence; eventos, assinaturas e fotos são só inseridos.
- Números definitivos de OS atribuídos pelo banco. O número local é provisório até sincronizar.
- Bucket `os-fotos` privado, JPEG, máximo 5 MB. Operadores podem enviar e ler; não podem sobrescrever ou apagar objetos pela API.
- Portal público por código aleatório de 16 caracteres. Retorna aparelho e andamento; não retorna nomes, telefone, documento, IMEI, defeito, notas livres, fotos ou assinatura.
- Nenhuma service role no frontend. `.env.local` contém somente URL e chave publicável e é ignorado pelo Git.
- Cadastro público desativado no Supabase; contas novas são criadas pelo administrador. Login anônimo permanece desativado.

## Migrações

Executar em ordem, uma vez por ambiente: `schema.sql`, depois `migrations/` pela numeração.

- **001** tabela de operadores.
- **002** RLS de leitura, RPC de sincronização, numeração pelo banco, portal público e políticas do Storage. O arquivo já contém a correção da 003.
- **003** recria a RPC com a correção da variável de recibo. Em ambiente novo, reaplica a mesma função da 002 sem efeito.
- **004** tira a assinatura da linha da OS: cria `os_assinaturas`, copia as assinaturas existentes e troca a RPC para aceitar a entidade `assinatura`. A coluna `assinatura_png` fica, sem uso, para não apagar dados.

**Aplique a 004 antes de usar a versão conectada deste código.** Sem ela, a RPC recusa as assinaturas novas (aparecem como recusadas na tela Sincronização) e o download falha ao procurar `os_assinaturas`.

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

No projeto remoto, com as migrações até a 003: teste SQL aprovado para operador, RLS, escrita direta bloqueada, idempotência e projeção pública. API anônima de clientes retorna HTTP 401; consulta pública com código inválido retorna HTTP 200/null. Primeiro operador cadastrado e ativo. A migração 003 corrige a ambiguidade da variável de recibo encontrada por esse teste.

A migração 004 e a versão atual do `testar-integracao.sql` foram executadas num PostgreSQL local (PGlite), com esboços dos esquemas `auth` e `storage`, e ainda precisam ser aplicadas e rodadas no projeto remoto. O teste falha sem a 004, o que confirma que ele cobre a mudança.

## Operação e limites

Validado no navegador, antes da 004: login, abertura da OS fictícia #1002, numeração definitiva pelo servidor, envio de foto JPEG, mudança para orçamento enviado e fila zerada. Portal consultado também pela API sem sessão: omite nota interna e dados pessoais. Objeto JPEG confirmado no Storage; tentativas de download sem sessão foram negadas. A OS #1002 e a foto apareceram num segundo navegador com outra sessão. Os registros sintéticos ficam identificados como teste na oficina.

Não foi configurado SMTP próprio, recuperação de senha no aplicativo, backup externo nem restauração periódica. Não há garantia de backup operacional nesta etapa. Antes de usar dados reais, definir retenção, exportação do banco e dos objetos privados e testar restauração. Consultar as condições do plano gratuito no painel antes de produção.

Uma migração já aplicada não deve ser editada: a correção entra numa migração nova, como a 003 e a 004.
