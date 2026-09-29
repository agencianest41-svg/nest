-- Teste do motor de pautas (fase 1). Termina com RAISE (nada fica). Esperado:
--   loj.editorias=5 loj.cotas=4 loj.cria_editoria=bloqueado loj.muda_cota=0
--   loj.pauta_manual=ok loj.pauta_hub=bloqueado loj.pauta_sensivel=bloqueado
--   | loj.roteiro_da_hub=ok loj.idea_da_hub=ok loj.porque_da_hub=bloqueado loj.editoria_da_hub=bloqueado
--   loj.marca_sensivel=bloqueado loj.avanca=ok loj.aprova=bloqueado loj.link_http=bloqueado loj.porque_manual=ok
--   | outra.ve_pautas=0 | marca.aprova=ok marca.sensivel=ok
do $$
declare t uuid; belem uuid; recife uuid; plan uuid; it_hub uuid; it_loj uuid; ed uuid; ed2 uuid; n int; out text := '';
 u_loj uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 select id into belem from public.operations where instagram = '@mahoganybelem';
 select id into recife from public.operations where instagram = '@mahogany_recife';
 select id into ed from public.editorias where tenant_id = t order by position limit 1;
 select id into ed2 from public.editorias where tenant_id = t order by position desc limit 1;
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-loj@nest.test'),
 (u_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-out@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-marca@nest.test');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem), (t, u_out, 'lojista', recife);
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');

 -- Marca cria o plano e uma pauta da Hub (cérebro travado para a loja).
 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.monthly_plans (tenant_id, operation_id, month) values (t, belem, '2027-01-01') returning id into plan;
 insert into public.plan_items (tenant_id, plan_id, title, format, editoria_id, funnel, idea, rationale, origin)
 values (t, plan, 'Ritual de verão', 'reels', ed, 'descoberta', 'Mostrar o ritual', 'Calor pede frescor', 'hub') returning id into it_hub;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.editorias; out := 'loj.editorias=' || n;
 select count(*) into n from public.tier_quotas; out := out || ' loj.cotas=' || n;
 begin insert into public.editorias (tenant_id, name) values (t, 'Pirata'); out := out || ' loj.cria_editoria=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.cria_editoria=bloqueado'; end;
 update public.tier_quotas set posts = 99 where tenant_id = t; get diagnostics n = row_count; out := out || ' loj.muda_cota=' || n;
 insert into public.plan_items (tenant_id, plan_id, title, format, rationale) values (t, plan, 'Minha ideia', 'post', 'porque sim') returning id into it_loj;
 out := out || ' loj.pauta_manual=ok';
 begin insert into public.plan_items (tenant_id, plan_id, title, origin) values (t, plan, 'x', 'hub'); out := out || ' loj.pauta_hub=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.pauta_hub=bloqueado'; end;
 begin insert into public.plan_items (tenant_id, plan_id, title, sensitive) values (t, plan, 'x', true); out := out || ' loj.pauta_sensivel=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.pauta_sensivel=bloqueado'; end;

 update public.plan_items set script = 'Gancho + ritual', caption = 'Legenda' where id = it_hub; out := out || ' | loj.roteiro_da_hub=ok';
 update public.plan_items set idea = 'Ideia ajustada pela loja' where id = it_hub; out := out || ' loj.idea_da_hub=ok';
 begin update public.plan_items set rationale = 'outro motivo' where id = it_hub; out := out || ' loj.porque_da_hub=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.porque_da_hub=bloqueado'; end;
 begin update public.plan_items set editoria_id = ed2 where id = it_hub; out := out || ' loj.editoria_da_hub=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.editoria_da_hub=bloqueado'; end;
 begin update public.plan_items set sensitive = true where id = it_loj; out := out || ' loj.marca_sensivel=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.marca_sensivel=bloqueado'; end;
 update public.plan_items set status = 'roteiro' where id = it_hub;
 update public.plan_items set status = 'aprovacao' where id = it_hub; out := out || ' loj.avanca=ok';
 begin update public.plan_items set status = 'aprovado' where id = it_hub; out := out || ' loj.aprova=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.aprova=bloqueado'; end;
 begin update public.plan_items set published_url = 'http://x.com' where id = it_loj; out := out || ' loj.link_http=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.link_http=bloqueado'; end;
 update public.plan_items set rationale = 'mudei meu porquê' where id = it_loj; out := out || ' loj.porque_manual=ok';
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.plan_items where plan_id = plan; out := out || ' | outra.ve_pautas=' || n;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 update public.plan_items set status = 'aprovado' where id = it_hub; out := out || ' | marca.aprova=ok';
 update public.plan_items set sensitive = true where id = it_loj; out := out || ' marca.sensivel=ok';
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
