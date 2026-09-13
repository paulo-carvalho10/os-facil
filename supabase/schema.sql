-- Estrutura do back-end opcional. Execute no SQL Editor do Supabase.
create table if not exists clientes (
  id uuid primary key,
  nome text not null,
  telefone text not null,
  documento text,
  criado_em timestamptz not null,
  atualizado_em timestamptz not null
);

create table if not exists ordens_servico (
  id uuid primary key,
  numero bigint not null unique,
  cliente_id uuid not null references clientes(id),
  aparelho text not null,
  marca text not null,
  modelo text not null,
  imei_ou_serie text,
  defeito_relatado text not null,
  acessorios text,
  orcamento numeric(12,2),
  status text not null check (status in ('aguardando_avaliacao','orcamento_enviado','aprovado','em_conserto','pronto','entregue')),
  criada_em timestamptz not null,
  atualizada_em timestamptz not null,
  entregue_em timestamptz,
  codigo_publico text not null unique,
  assinatura_png text,
  sincronizada_em timestamptz
);

create table if not exists os_eventos (
  id uuid primary key,
  os_id uuid not null references ordens_servico(id) on delete cascade,
  status text not null,
  observacao text,
  publico boolean not null default true,
  criado_em timestamptz not null,
  atualizado_em timestamptz not null
);

create table if not exists os_fotos (
  id uuid primary key,
  os_id uuid not null references ordens_servico(id) on delete cascade,
  momento text not null check (momento in ('entrada','saida')),
  caminho_storage text not null,
  nome_arquivo text not null,
  criado_em timestamptz not null,
  atualizado_em timestamptz not null
);

create table if not exists sync_receipts (
  id text primary key,
  processado_em timestamptz not null default now()
);

create index if not exists idx_ordens_cliente on ordens_servico(cliente_id);
create index if not exists idx_ordens_status on ordens_servico(status);
create index if not exists idx_eventos_os_data on os_eventos(os_id, criado_em);

alter table clientes enable row level security;
alter table ordens_servico enable row level security;
alter table os_eventos enable row level security;
alter table os_fotos enable row level security;
alter table sync_receipts enable row level security;

-- Começa sem nenhum acesso. A migração 002 libera leitura para operadores ativos (RLS);
-- escrita direta continua proibida e só acontece pela função sincronizar_operacao.
revoke all on clientes, ordens_servico, os_eventos, os_fotos, sync_receipts from anon, authenticated;

insert into storage.buckets (id, name, public)
values ('os-fotos', 'os-fotos', false)
on conflict (id) do update set public = false;
