-- Teste do guardião de marca, Brand OS e IA. Termina com RAISE (nada fica). Esperado:
--   profiles_sync=2 | check_issues=2 check_ok=0 roteiro_com_termo=ok enviar_aprovacao=bloqueado(...)
--   alerta_passa=1 | budget.enabled=true usage_insert=ok usage_read=0 loj.ai_toggle=0 loj.voz_edit=0
--   | marca.voz_edit=1 marca.tema_edit=1 marca.usage_read=0 marca.activity_brand=2
do $$
declare t uuid; belem uuid; plan uuid; item uuid; n int; out text := ''; r record;
 u_loj uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 select id into belem from public.operations where instagram = '@mahoganybelem';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-loj@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b-marca@nest.test');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem);
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');
 select count(*) into n from public.profiles where id in (u_loj, u_marca); out := 'profiles_sync=' || n;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.check_brand(t, 'Grande QUEIMA de Estóque hoje, imperdível!'); out := out || ' | check_issues=' || n;
 select count(*) into n from public.check_brand(t, 'Descubra sua assinatura olfativa'); out := out || ' check_ok=' || n;
 insert into public.monthly_plans (tenant_id, operation_id, month) values (t, belem, '2026-11-01') returning id into plan;
 insert into public.plan_items (tenant_id, plan_id, title, script, status) values (t, plan, 'Reels', 'Queima de estoque!', 'roteiro') returning id into item;
 out := out || ' roteiro_com_termo=ok';
 begin update public.plan_items set status = 'aprovacao' where id = item; out := out || ' enviar_aprovacao=PERMITIDO(ERRO)';
 exception when others then out := out || ' enviar_aprovacao=bloqueado(' || sqlerrm || ')'; end;
 update public.plan_items set script = 'Liquidação de presentes', status = 'aprovacao' where id = item; get diagnostics n = row_count; out := out || ' alerta_passa=' || n;
 select * into r from public.ai_budget(t); out := out || ' | budget.enabled=' || r.enabled || ' spent=' || r.spent_usd;
 begin insert into public.ai_usage (tenant_id, feature, model) values (t, 'x', 'm'); out := out || ' usage_insert=ok'; exception when others then out := out || ' usage_insert=ERRO'; end;
 select count(*) into n from public.ai_usage; out := out || ' usage_read=' || n;
 update public.ai_settings set enabled = false where tenant_id = t; get diagnostics n = row_count; out := out || ' loj.ai_toggle=' || n;
 update public.brand_voices set tone = 'x' where tenant_id = t; get diagnostics n = row_count; out := out || ' loj.voz_edit=' || n;
 reset role;
 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 update public.brand_voices set tagline = 'Qualidade, Autenticidade e Exuberância' where tenant_id = t; get diagnostics n = row_count; out := out || ' | marca.voz_edit=' || n;
 update public.tenant_themes set accent = '#C9A563' where tenant_id = t; get diagnostics n = row_count; out := out || ' marca.tema_edit=' || n;
 select count(*) into n from public.ai_usage; out := out || ' marca.usage_read=' || n;
 select count(*) into n from public.activity_log where tenant_id = t and entity_type in ('brand_voices','tenant_themes'); out := out || ' marca.activity_brand=' || n;
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
