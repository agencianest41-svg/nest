-- Teste de postagem e impulsionamento. Termina com RAISE (nada fica). Esperado:
--   loj.agenda_ideia=bloqueado loj.agenda=ok loj.modo=manual loj.duplicado=bloqueado loj.executa=bloqueado
--   loj.cancela=ok loj.impulsiona_nao_publicada=bloqueado | outra.ve=0 outra.pede=bloqueado
--   | marca.executa=ok marca.modo_teste=teste loj.impulsiona=ok loj.provider=teste loj.cancela_no_ar=bloqueado
do $$
declare t uuid; belem uuid; recife uuid; plan uuid; it uuid; svc uuid; svc2 uuid; n int; v text; out text := '';
 u_loj uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 select id into belem from public.operations where instagram = '@mahoganybelem';
 select id into recife from public.operations where instagram = '@mahogany_recife';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's-loj@nest.test'),
 (u_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's-out@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's-marca@nest.test');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem), (t, u_out, 'lojista', recife);
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');
 delete from public.integrations where tenant_id = t and provider = 'meta' and operation_id is null;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.monthly_plans (tenant_id, operation_id, month) values (t, belem, '2027-02-01') returning id into plan;
 insert into public.plan_items (tenant_id, plan_id, title, format) values (t, plan, 'Vitrine de verão', 'reels') returning id into it;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 begin insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, scheduled_at, placement)
   values (t, belem, it, 'agendar', now() + interval '1 day', 'reels'); out := 'loj.agenda_ideia=PERMITIDO(ERRO)';
 exception when others then out := 'loj.agenda_ideia=bloqueado'; end;
 reset role;
 perform set_config('request.jwt.claims', '', true);
 update public.plan_items set status = 'aprovado' where id = it; -- sem usuário: como o sistema
 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, scheduled_at, placement, provider)
   values (t, belem, it, 'agendar', now() + interval '1 day', 'reels', 'meta') returning id, provider into svc, v;
 out := out || ' loj.agenda=ok loj.modo=' || v;
 begin insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, scheduled_at, placement)
   values (t, belem, it, 'agendar', now() + interval '2 day', 'feed'); out := out || ' loj.duplicado=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.duplicado=bloqueado'; end;
 begin update public.piece_services set status = 'agendado' where id = svc; out := out || ' loj.executa=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.executa=bloqueado'; end;
 update public.piece_services set status = 'cancelado' where id = svc; get diagnostics n = row_count;
 out := out || ' loj.cancela=' || case when n = 1 then 'ok' else 'ERRO' end;
 begin insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, budget, days, objective)
   values (t, belem, it, 'impulsionar', 50, 5, 'alcance'); out := out || ' loj.impulsiona_nao_publicada=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.impulsiona_nao_publicada=bloqueado'; end;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.piece_services where plan_item_id = it; out := out || ' | outra.ve=' || n;
 begin insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, scheduled_at, placement)
   values (t, belem, it, 'agendar', now() + interval '1 day', 'reels'); out := out || ' outra.pede=PERMITIDO(ERRO)';
 exception when others then out := out || ' outra.pede=bloqueado'; end;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, scheduled_at, placement)
   values (t, belem, it, 'agendar', now() + interval '1 day', 'reels') returning id into svc2;
 update public.piece_services set status = 'agendado' where id = svc2;
 update public.piece_services set status = 'concluido', published_url = 'https://instagram.com/p/x' where id = svc2;
 update public.plan_items set status = 'publicado', published_url = 'https://instagram.com/p/x' where id = it;
 out := out || ' | marca.executa=ok';
 insert into public.integrations (tenant_id, provider, config) values (t, 'meta', '{"test_mode": true}');
 out := out || ' marca.modo_teste=' || public.publishing_mode(t);
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.piece_services (tenant_id, operation_id, plan_item_id, kind, budget, days, objective)
   values (t, belem, it, 'impulsionar', 50, 5, 'alcance') returning id, provider into svc, v;
 out := out || ' loj.impulsiona=ok loj.provider=' || v;
 reset role;
 perform set_config('request.jwt.claims', '', true);
 update public.piece_services set status = 'no_ar' where id = svc;
 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 begin update public.piece_services set status = 'cancelado' where id = svc; get diagnostics n = row_count;
   out := out || ' loj.cancela_no_ar=' || case when n = 0 then 'bloqueado' else 'PERMITIDO(ERRO)' end;
 exception when others then out := out || ' loj.cancela_no_ar=bloqueado'; end;
 reset role;

 raise exception 'RESULTADO: %', out;
end $$;
