-- Read-only audit. Does not create users or business data.
select c.relname as tabela,c.relrowsecurity as rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('clientes','ordens_servico','os_eventos','os_fotos','operadores');
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='os-fotos';
select has_table_privilege('anon','public.clientes','SELECT') as anon_le_clientes,
has_table_privilege('authenticated','public.clientes','INSERT') as login_insere_diretamente,
has_function_privilege('anon','public.sincronizar_operacao(jsonb)','EXECUTE') as anon_sincroniza,
has_function_privilege('anon','public.consultar_os(text)','EXECUTE') as anon_consulta_codigo;
begin;
set local role authenticated;
select public.acesso_oficina() as conta_sem_operador_autorizada;
select count(*) as clientes_visiveis_sem_operador from public.clientes;
rollback;
