-- Synthetic records exist only inside this rolled-back transaction.
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001');
insert into public.operadores(usuario_id) values('10000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare op jsonb; resultado jsonb;
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
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 if public.acesso_oficina() then raise exception 'FAIL nonoperator'; end if;
 if exists(select 1 from public.clientes) then raise exception 'FAIL RLS'; end if;
end $$;
set local role anon;
do $$ begin
 begin
  perform * from public.clientes;
  raise exception 'FAIL anonymous read';
 exception when insufficient_privilege then null; end;
 begin
  perform public.sincronizar_operacao('{}'::jsonb);
  raise exception 'FAIL anonymous write';
 exception when insufficient_privilege then null; end;
end $$;
select 'PASS: operador, RLS, escrita bloqueada, idempotência e privacidade' as resultado;
rollback;
