-- Permissão de operação concedida apenas por um administrador do projeto.
-- Não confiar em user_metadata: o próprio usuário pode alterá-lo.
create table if not exists public.operadores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.operadores enable row level security;
revoke all on public.operadores from anon, authenticated;
grant select on public.operadores to service_role;
