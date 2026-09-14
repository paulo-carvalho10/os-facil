-- Synthetic records exist only inside this rolled-back transaction.
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
insert into public.operadores(usuario_id) values('10000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare op jsonb; op_assinatura jsonb; resultado jsonb;
begin
 if not public.acesso_oficina() then raise exception 'FAIL operator'; end if;
 op:=jsonb_build_object('id','20000000-0000-4000-8000-000000000001','entidade','cliente','entidadeId','30000000-0000-4000-8000-000000000001','acao','upsert','payload',jsonb_build_object('id','30000000-0000-4000-8000-000000000001','nome','Teste sintético','telefone','00000000000','criadoEm',now(),'atualizadoEm',now()));
 perform public.sincronizar_operacao(op);
 resultado:=public.sincronizar_operacao(op);
 if resultado->>'repetida'<>'true' then raise exception 'FAIL receipt'; end if;
 begin
  perform public.sincronizar_operacao(jsonb_set(op,'{payload,nome}','"Diferente"'));
  raise exception 'FAIL idempotency';
 exception when invalid_parameter_value then null; end;
 begin
  insert into public.clientes values(gen_random_uuid(),'Teste','00000000000',null,now(),now());
  raise exception 'FAIL direct write';
 exception when insufficient_privilege then null; end;
 op:=jsonb_build_object('id','20000000-0000-4000-8000-000000000002','entidade','os','entidadeId','40000000-0000-4000-8000-000000000001','acao','upsert','payload',jsonb_build_object('id','40000000-0000-4000-8000-000000000001','clienteId','30000000-0000-4000-8000-000000000001','aparelho','Celular','marca','Teste','modelo','Sintético','defeitoRelatado','Informação privada','status','aguardando_avaliacao','criadaEm',now(),'atualizadaEm',now(),'codigoPublico','23456789ABCDEFGH'));
 perform public.sincronizar_operacao(op);
 resultado:=public.consultar_os('23456789ABCDEFGH');
 if resultado is null or resultado ? 'defeitoRelatado' or resultado ? 'clienteId' or resultado ? 'assinaturaPng' then raise exception 'FAIL privacy'; end if;

 -- Assinatura colhida antes (offline) e status mudado depois em outro aparelho:
 -- a mudança de status não pode apagar a assinatura (migração 004).
 op_assinatura:=jsonb_build_object('id','20000000-0000-4000-8000-000000000003','entidade','assinatura','entidadeId','50000000-0000-4000-8000-000000000001','acao','upsert',
   'payload',jsonb_build_object('id','50000000-0000-4000-8000-000000000001','osId','40000000-0000-4000-8000-000000000001',
     'png','data:image/png;base64,iVBORw0KGgo=','criadoEm',now()-interval '1 minute','atualizadoEm',now()-interval '1 minute'));
 perform public.sincronizar_operacao(op_assinatura);
 op:=jsonb_build_object('id','20000000-0000-4000-8000-000000000004','entidade','os','entidadeId','40000000-0000-4000-8000-000000000001','acao','upsert',
   'payload',jsonb_build_object('id','40000000-0000-4000-8000-000000000001','clienteId','30000000-0000-4000-8000-000000000001','aparelho','Celular','marca','Teste','modelo','Sintético',
     'defeitoRelatado','Informação privada','status','orcamento_enviado','criadaEm',now(),'atualizadaEm',now()+interval '1 second','codigoPublico','23456789ABCDEFGH'));
 perform public.sincronizar_operacao(op);
 if (select status from public.ordens_servico where id='40000000-0000-4000-8000-000000000001') <> 'orcamento_enviado' then raise exception 'FAIL status'; end if;
 if not exists(select 1 from public.os_assinaturas where os_id='40000000-0000-4000-8000-000000000001') then raise exception 'FAIL signature lost'; end if;
 if public.consultar_os('23456789ABCDEFGH')::text like '%base64%' then raise exception 'FAIL signature exposed'; end if;
 -- Uma assinatura que não é PNG viola o check da tabela (23514).
 begin
  perform public.sincronizar_operacao(jsonb_set(jsonb_set(jsonb_set(jsonb_set(op_assinatura,
    '{id}','"20000000-0000-4000-8000-000000000005"'),
    '{entidadeId}','"50000000-0000-4000-8000-000000000002"'),
    '{payload,id}','"50000000-0000-4000-8000-000000000002"'),
    '{payload,png}','"nao-e-png"'));
  raise exception 'FAIL invalid signature';
 exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if public.acesso_oficina() then raise exception 'FAIL nonoperator'; end if;
 if exists(select 1 from public.clientes) then raise exception 'FAIL RLS'; end if;
 if exists(select 1 from public.os_assinaturas) then raise exception 'FAIL RLS signatures'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.clientes;
  raise exception 'FAIL anonymous read';
 exception when insufficient_privilege then null; end;
 begin
  perform * from public.os_assinaturas;
  raise exception 'FAIL anonymous signature read';
 exception when insufficient_privilege then null; end;
 begin
  perform public.sincronizar_operacao('{}'::jsonb);
  raise exception 'FAIL anonymous write';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: operador, RLS, escrita bloqueada, idempotência, privacidade e assinatura preservada' as resultado;
rollback;
