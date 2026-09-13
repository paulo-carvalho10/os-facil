# Edge Function `api`

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGIN` apenas no ambiente da função. Depois execute:

```bash
supabase functions deploy api --no-verify-jwt
```

O gateway permite a consulta pública por código; cada rota de escrita verifica o Bearer token com `auth.getUser` e exige um usuário ativo em `public.operadores`. A migração `202609110001_operadores.sql` deve ser aplicada antes da função. Sem operador autorizado, as escritas falham com 403.

`ALLOWED_ORIGIN` é uma lista de origens exatas separadas por vírgula. Não use `*`. A service role nunca deve ser colocada no Vite. A integração do login no aplicativo, a sincronização bidirecional e os testes no projeto remoto ainda estão em preparação; esta função não deve ser apresentada como configuração de produção concluída.
