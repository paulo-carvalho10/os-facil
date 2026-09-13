-- Aplicar depois da 003.
--
-- A assinatura deixa de ser coluna da OS e vira registro próprio, só inserido.
--
-- Motivo: a OS usa "último horário vence" na linha inteira. Uma assinatura
-- colhida offline às 12:10 era descartada quando outro aparelho mudava o status
-- às 12:15, e a RPC respondia ok. O aparelho apagava a operação da fila e, no
-- download seguinte, perdia a assinatura também. Como registro à parte, a
-- assinatura não disputa a linha com o status.
begin;

create table public.os_assinaturas (
  id uuid primary key,
  os_id uuid not null references public.ordens_servico(id) on delete cascade,
  png text not null,
  criado_em timestamptz not null,
  atualizado_em timestamptz not null,
  constraint assinatura_png_valida check (png like 'data:image/png;base64,%' and length(png) <= 300000)
);
create index os_assinaturas_os_data on public.os_assinaturas(os_id, criado_em);

alter table public.os_assinaturas enable row level security;
revoke all on public.os_assinaturas from anon, authenticated;
grant select on public.os_assinaturas to authenticated;
create policy operadores_leem_assinaturas on public.os_assinaturas
  for select to authenticated using ((select privado.operador_ativo()));

-- Copia as assinaturas existentes usando o id da própria OS. O aplicativo faz o
-- mesmo ao migrar o banco local de uma assinatura já sincronizada, então os
-- dois lados chegam ao mesmo registro em vez de duplicá-lo.
-- A coluna antiga fica, para não apagar dados; nada mais escreve nela.
insert into public.os_assinaturas(id, os_id, png, criado_em, atualizado_em)
select id, id, assinatura_png, atualizada_em, atualizada_em
from public.ordens_servico
where assinatura_png like 'data:image/png;base64,%'
on conflict (id) do nothing;

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
begin
  if usuario is null or not privado.operador_ativo() then
    raise insufficient_privilege using message = 'Operador não autorizado';
  end if;
  if v_operacao_id is null or registro_id is null or jsonb_typeof(p) <> 'object' or octet_length(operacao::text) > 400000 then
    raise exception 'Operação inválida' using errcode = '22023';
  end if;
  if (operacao->>'entidadeId')::uuid is distinct from registro_id then
    raise exception 'Identificador divergente' using errcode = '22023';
  end if;
  if entidade is null or acao is null
     or entidade not in ('cliente', 'os', 'evento', 'assinatura', 'foto')
     or acao not in ('upsert', 'upload')
     or (entidade = 'foto') <> (acao = 'upload') then
    raise exception 'Ação inválida' using errcode = '22023';
  end if;

  -- Serializa a mesma operação lógica antes de conferir o recibo.
  perform pg_advisory_xact_lock(hashtextextended(usuario::text || v_operacao_id::text, 0));
  select r.assinatura into recibo from privado.recibos r where r.usuario_id = usuario and r.operacao_id = v_operacao_id;
  if recibo is not null then
    if recibo <> assinatura then
      raise exception 'Idempotência reutilizada com conteúdo diferente' using errcode = '22023';
    end if;
    return jsonb_build_object('repetida', true);
  end if;

  if (select count(*) from privado.recibos r where r.usuario_id = usuario and r.criado_em > now() - interval '1 minute') >= 300 then
    raise exception 'Limite temporário de sincronização' using errcode = 'P0001';
  end if;

  alterado := coalesce(p->>'atualizadoEm', p->>'atualizadaEm')::timestamptz;
  if alterado is null or alterado > now() + interval '5 minutes' or alterado < '2000-01-01' then
    raise exception 'Data de alteração inválida' using errcode = '22023';
  end if;

  if entidade = 'cliente' then
    insert into public.clientes(id, nome, telefone, documento, criado_em, atualizado_em)
    values (registro_id, p->>'nome', p->>'telefone', p->>'documento', (p->>'criadoEm')::timestamptz, alterado)
    on conflict (id) do update
      set nome = excluded.nome, telefone = excluded.telefone, documento = excluded.documento,
          atualizado_em = excluded.atualizado_em
      where clientes.atualizado_em < excluded.atualizado_em;

  elsif entidade = 'os' then
    -- Sem assinatura_png: a assinatura tem entidade própria desde esta migração.
    insert into public.ordens_servico(
      id, cliente_id, aparelho, marca, modelo, imei_ou_serie, defeito_relatado, acessorios,
      orcamento, status, criada_em, atualizada_em, entregue_em, codigo_publico, sincronizada_em)
    values (
      registro_id, (p->>'clienteId')::uuid, p->>'aparelho', p->>'marca', p->>'modelo', p->>'imeiOuSerie',
      p->>'defeitoRelatado', p->>'acessorios', (p->>'orcamento')::numeric, p->>'status',
      (p->>'criadaEm')::timestamptz, alterado, (p->>'entregueEm')::timestamptz, p->>'codigoPublico', now())
    on conflict (id) do update
      set aparelho = excluded.aparelho, marca = excluded.marca, modelo = excluded.modelo,
          imei_ou_serie = excluded.imei_ou_serie, defeito_relatado = excluded.defeito_relatado,
          acessorios = excluded.acessorios, orcamento = excluded.orcamento, status = excluded.status,
          atualizada_em = excluded.atualizada_em, entregue_em = excluded.entregue_em, sincronizada_em = now()
      where ordens_servico.atualizada_em < excluded.atualizada_em;

  elsif entidade = 'evento' then
    -- Eventos são imutáveis; um UUID repetido não reescreve o histórico.
    insert into public.os_eventos(id, os_id, status, observacao, publico, criado_em, atualizado_em)
    values (registro_id, (p->>'osId')::uuid, p->>'status', p->>'observacao',
            coalesce((p->>'publico')::boolean, false), (p->>'criadoEm')::timestamptz, alterado)
    on conflict (id) do nothing;

  elsif entidade = 'assinatura' then
    -- Imutável, como eventos e fotos: assinar de novo é outro registro.
    insert into public.os_assinaturas(id, os_id, png, criado_em, atualizado_em)
    values (registro_id, (p->>'osId')::uuid, p->>'png', (p->>'criadoEm')::timestamptz, alterado)
    on conflict (id) do nothing;

  else
    if p->>'caminhoStorage' is distinct from ((p->>'osId') || '/' || registro_id::text || '.jpg') then
      raise exception 'Caminho inválido' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'os-fotos' and name = p->>'caminhoStorage') then
      raise exception 'Envie a foto antes de confirmar' using errcode = '22023';
    end if;
    insert into public.os_fotos(id, os_id, momento, caminho_storage, nome_arquivo, criado_em, atualizado_em)
    values (registro_id, (p->>'osId')::uuid, p->>'momento', p->>'caminhoStorage', left(p->>'nomeArquivo', 200),
            coalesce(p->>'criadoEm', p->>'atualizadoEm')::timestamptz, alterado)
    on conflict (id) do nothing;
  end if;

  insert into privado.recibos(usuario_id, operacao_id, assinatura) values (usuario, v_operacao_id, assinatura);
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.sincronizar_operacao(jsonb) from public, anon;
grant execute on function public.sincronizar_operacao(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
