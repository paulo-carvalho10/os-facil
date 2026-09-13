-- Apply after schema.sql and 202609110001_operadores.sql.
begin;
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
grant usage on schema privado to authenticated;

create or replace function privado.operador_ativo()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.operadores where usuario_id = (select auth.uid()) and ativo); $$;
revoke all on function privado.operador_ativo() from public, anon;
grant execute on function privado.operador_ativo() to authenticated;

create or replace function public.acesso_oficina()
returns boolean language sql stable security invoker set search_path = ''
as $$ select privado.operador_ativo(); $$;
revoke all on function public.acesso_oficina() from public, anon;
grant execute on function public.acesso_oficina() to authenticated;

-- Read by authorized workshop operators. Writes only through validated RPC.
grant select on public.clientes, public.ordens_servico, public.os_eventos, public.os_fotos to authenticated;
create policy operadores_leem_clientes on public.clientes for select to authenticated using ((select privado.operador_ativo()));
create policy operadores_leem_ordens on public.ordens_servico for select to authenticated using ((select privado.operador_ativo()));
create policy operadores_leem_eventos on public.os_eventos for select to authenticated using ((select privado.operador_ativo()));
create policy operadores_leem_fotos on public.os_fotos for select to authenticated using ((select privado.operador_ativo()));

alter table public.clientes add constraint cliente_nome_limite check(length(trim(nome)) between 2 and 160);
alter table public.clientes add constraint cliente_telefone_limite check(length(telefone) between 8 and 30);
alter table public.clientes add constraint cliente_documento_limite check(length(documento) <= 40);
alter table public.ordens_servico add constraint ordem_textos_limite check(
 length(aparelho) between 1 and 80 and length(marca) between 1 and 80 and
 length(modelo) between 1 and 120 and length(defeito_relatado) between 1 and 4000 and
 coalesce(length(acessorios),0) <= 2000 and coalesce(length(imei_ou_serie),0) <= 120);
alter table public.ordens_servico add constraint ordem_valor_valido check(orcamento >= 0 and orcamento <= 99999999.99);
alter table public.ordens_servico add constraint ordem_codigo_valido check(codigo_publico ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$');
alter table public.ordens_servico add constraint ordem_assinatura_limite check(coalesce(length(assinatura_png),0) <= 300000);
alter table public.os_eventos add constraint evento_status_valido check(status in ('aguardando_avaliacao','orcamento_enviado','aprovado','em_conserto','pronto','entregue'));
alter table public.os_eventos add constraint evento_texto_limite check(coalesce(length(observacao),0) <= 2000);

-- Cloud numbering: identity stable by UUID, number assigned by the server.
create sequence privado.numero_os start with 1001;
select setval('privado.numero_os', greatest(1000,coalesce((select max(numero) from public.ordens_servico),1000)));
alter table public.ordens_servico alter column numero set default nextval('privado.numero_os');

create table privado.recibos (
 usuario_id uuid not null references auth.users(id),
 operacao_id uuid not null,
 assinatura text not null,
 criado_em timestamptz not null default now(),
 primary key(usuario_id, operacao_id)
);
alter table privado.recibos enable row level security;
create index recibos_data on privado.recibos(usuario_id, criado_em);

create or replace function public.sincronizar_operacao(operacao jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
 p jsonb := operacao->'payload';
 entidade text := operacao->>'entidade';
 acao text := operacao->>'acao';
 registro_id uuid := (p->>'id')::uuid;
 v_operacao_id uuid := (operacao->>'id')::uuid;
 usuario uuid := auth.uid();
 alterado timestamptz;
 assinatura text := md5(operacao::text);
 recibo text;
 resultado jsonb;
begin
 if usuario is null or not privado.operador_ativo() then raise insufficient_privilege using message='Operador não autorizado'; end if;
 if v_operacao_id is null or registro_id is null or jsonb_typeof(p) <> 'object' or octet_length(operacao::text)>400000 then raise exception 'Operação inválida' using errcode='22023'; end if;
 if (operacao->>'entidadeId')::uuid is distinct from registro_id then raise exception 'Identificador divergente' using errcode='22023'; end if;
 if entidade is null or acao is null or entidade not in ('cliente','os','evento','foto') or acao not in ('upsert','upload') or (entidade='foto') <> (acao='upload') then raise exception 'Ação inválida' using errcode='22023'; end if;
 -- Serializes same logical operation before checking receipt.
 perform pg_advisory_xact_lock(hashtextextended(usuario::text || v_operacao_id::text,0));
 select r.assinatura into recibo from privado.recibos r where r.usuario_id=usuario and r.operacao_id=v_operacao_id;
 if recibo is not null then
   if recibo <> assinatura then raise exception 'Idempotência reutilizada com conteúdo diferente' using errcode='22023'; end if;
   return jsonb_build_object('repetida',true);
 end if;
 if (select count(*) from privado.recibos r where r.usuario_id=usuario and r.criado_em>now()-interval '1 minute') >= 300 then raise exception 'Limite temporário de sincronização' using errcode='P0001'; end if;
 alterado := coalesce(p->>'atualizadoEm',p->>'atualizadaEm')::timestamptz;
 if alterado is null or alterado > now()+interval '5 minutes' or alterado < '2000-01-01' then raise exception 'Data de alteração inválida' using errcode='22023'; end if;
 if entidade='cliente' then
   insert into public.clientes(id,nome,telefone,documento,criado_em,atualizado_em)
   values(registro_id,p->>'nome',p->>'telefone',p->>'documento',(p->>'criadoEm')::timestamptz,alterado)
   on conflict(id) do update set nome=excluded.nome,telefone=excluded.telefone,documento=excluded.documento,atualizado_em=excluded.atualizado_em
   where clientes.atualizado_em < excluded.atualizado_em;
 elsif entidade='os' then
   insert into public.ordens_servico(id,cliente_id,aparelho,marca,modelo,imei_ou_serie,defeito_relatado,acessorios,orcamento,status,criada_em,atualizada_em,entregue_em,codigo_publico,assinatura_png,sincronizada_em)
   values(registro_id,(p->>'clienteId')::uuid,p->>'aparelho',p->>'marca',p->>'modelo',p->>'imeiOuSerie',p->>'defeitoRelatado',p->>'acessorios',(p->>'orcamento')::numeric,p->>'status',(p->>'criadaEm')::timestamptz,alterado,(p->>'entregueEm')::timestamptz,p->>'codigoPublico',p->>'assinaturaPng',now())
   on conflict(id) do update set aparelho=excluded.aparelho,marca=excluded.marca,modelo=excluded.modelo,imei_ou_serie=excluded.imei_ou_serie,defeito_relatado=excluded.defeito_relatado,acessorios=excluded.acessorios,orcamento=excluded.orcamento,status=excluded.status,atualizada_em=excluded.atualizada_em,entregue_em=excluded.entregue_em,assinatura_png=excluded.assinatura_png,sincronizada_em=now()
   where ordens_servico.atualizada_em < excluded.atualizada_em;
 elsif entidade='evento' then
   -- Events are immutable; repeated UUID does not rewrite history.
   insert into public.os_eventos(id,os_id,status,observacao,publico,criado_em,atualizado_em)
   values(registro_id,(p->>'osId')::uuid,p->>'status',p->>'observacao',coalesce((p->>'publico')::boolean,false),(p->>'criadoEm')::timestamptz,alterado)
   on conflict(id) do nothing;
 else
   if p->>'caminhoStorage' is distinct from ((p->>'osId') || '/' || registro_id::text || '.jpg') then raise exception 'Caminho inválido' using errcode='22023'; end if;
   if not exists(select 1 from storage.objects where bucket_id='os-fotos' and name=p->>'caminhoStorage') then raise exception 'Envie a foto antes de confirmar' using errcode='22023'; end if;
   insert into public.os_fotos(id,os_id,momento,caminho_storage,nome_arquivo,criado_em,atualizado_em)
   values(registro_id,(p->>'osId')::uuid,p->>'momento',p->>'caminhoStorage',left(p->>'nomeArquivo',200),coalesce(p->>'criadoEm',p->>'atualizadoEm')::timestamptz,alterado)
   on conflict(id) do nothing;
 end if;
 insert into privado.recibos(usuario_id,operacao_id,assinatura) values(usuario,v_operacao_id,assinatura);
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.sincronizar_operacao(jsonb) from public, anon;
grant execute on function public.sincronizar_operacao(jsonb) to authenticated;

create table privado.limite_portal (
 chave text primary key,
 janela timestamptz not null,
 consultas integer not null
);
alter table privado.limite_portal enable row level security;
create or replace function public.consultar_os(codigo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare ordem public.ordens_servico; quantidade integer; janela_atual timestamptz := date_trunc('minute',now());
begin
 if codigo is null or codigo !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16}$' then return null; end if;
 select * into ordem from public.ordens_servico where codigo_publico=codigo;
 if not found then return null; end if;
 insert into privado.limite_portal(chave,janela,consultas) values(codigo,janela_atual,1)
 on conflict(chave) do update set janela=excluded.janela,consultas=case when limite_portal.janela=excluded.janela then limite_portal.consultas+1 else 1 end
 returning consultas into quantidade;
 if quantidade>60 then return null; end if;
 return jsonb_build_object(
 'codigoPublico',ordem.codigo_publico,'numero',ordem.numero,'aparelho',ordem.aparelho,
 'marca',ordem.marca,'modelo',ordem.modelo,'status',ordem.status,'atualizadaEm',ordem.atualizada_em,
 'eventos',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'criadoEm',e.criado_em) order by e.criado_em)
 from public.os_eventos e where e.os_id=ordem.id and e.publico),'[]'::jsonb));
end; $$;
revoke all on function public.consultar_os(text) from public;
grant execute on function public.consultar_os(text) to anon, authenticated;
-- No free-form notes on the public endpoint, even if marked public.

update storage.buckets set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'] where id='os-fotos';
create policy operadores_leem_storage on storage.objects for select to authenticated
 using(bucket_id='os-fotos' and (select privado.operador_ativo()));
create policy operadores_enviam_foto on storage.objects for insert to authenticated
 with check(bucket_id='os-fotos' and (select privado.operador_ativo())
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
 and exists(select 1 from public.ordens_servico where id::text=(storage.foldername(name))[1]));
-- No update/delete storage grant: immutable photographs.
notify pgrst, 'reload schema';
commit;
