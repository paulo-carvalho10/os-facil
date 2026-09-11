# Edge Function `api`

Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ALLOWED_ORIGIN` apenas no ambiente da função. Depois execute:

```bash
supabase functions deploy api --no-verify-jwt
```

O acesso público sem JWT é intencional somente para a consulta por código aleatório e para o protótipo de sincronização. Antes de usar com dados reais, proteja as rotas de escrita com autenticação da oficina e rate limiting. A service role nunca deve ser colocada no Vite.
