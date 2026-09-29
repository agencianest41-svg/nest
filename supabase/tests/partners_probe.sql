-- Teste da bancada de parceiros e marketplace. Termina com RAISE (nada fica). Esperado:
--   cand.ve_brief=0 cand.autoverificar=bloqueado | marca.dir=2 | par.ve_aberto=1 par.ve_rascunho=0 par.ve_tenant=0
--   par.proposta=ok par.outra_proposta=bloqueado | outro.ve_proposta=0 | marca.atribuir=1 | par.entregar=ok par.status=em_revisao
--   | outro.entregar=bloqueado | marca.avaliar=ok | loj.ve_brief=0
do $$
declare t uuid; belem uuid; b_open uuid; b_draft uuid; p1 uuid; p2 uuid; prop uuid; n int; st text; out text := '';
 u_marca uuid := gen_random_uuid(); u_p1 uuid := gen_random_uuid(); u_p2 uuid := gen_random_uuid(); u_cand uuid := gen_random_uuid(); u_loj uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 select id into belem from public.operations where instagram = '@mahoganybelem';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-marca2@nest.test'),
 (u_p1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-free1@nest.test'),
 (u_p2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-free2@nest.test'),
 (u_cand, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-cand@nest.test'),
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-loj2@nest.test');
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem);
 insert into public.partners (user_id, name, email, status) values (u_p1, 'Ana Designer', 'p-free1@nest.test', 'verificado') returning id into p1;
 insert into public.partners (user_id, name, email, status) values (u_p2, 'Bruno Vídeo', 'p-free2@nest.test', 'verificado') returning id into p2;
 insert into public.briefs (tenant_id, title, status, visibility) values (t, 'Reels BF', 'aberto', 'bancada') returning id into b_open;
 insert into public.briefs (tenant_id, title) values (t, 'Rascunho') returning id into b_draft;

 perform set_config('request.jwt.claims', json_build_object('sub', u_cand, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.partners (user_id, name, email) values (u_cand, 'Cand', 'p-cand@nest.test');
 select count(*) into n from public.briefs; out := 'cand.ve_brief=' || n;
 begin update public.partners set status = 'verificado' where user_id = u_cand; out := out || ' cand.autoverificar=PERMITIDO(ERRO)';
 exception when others then out := out || ' cand.autoverificar=bloqueado'; end;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.partner_directory(); out := out || ' | marca.dir=' || n;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_p1, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.briefs where id = b_open; out := out || ' | par.ve_aberto=' || n;
 select count(*) into n from public.briefs where id = b_draft; out := out || ' par.ve_rascunho=' || n;
 select count(*) into n from public.tenants; out := out || ' par.ve_tenant=' || n;
 insert into public.brief_proposals (brief_id, partner_id, price, message) values (b_open, p1, 800, 'Topo') returning id into prop; out := out || ' par.proposta=ok';
 begin insert into public.brief_proposals (brief_id, partner_id, price) values (b_open, p2, 1); out := out || ' par.outra_proposta=PERMITIDO(ERRO)';
 exception when others then out := out || ' par.outra_proposta=bloqueado'; end;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_p2, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.brief_proposals; out := out || ' | outro.ve_proposta=' || n;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 update public.brief_proposals set status = 'aceita' where id = prop;
 update public.briefs set partner_id = p1, agreed_price = 800, status = 'atribuido' where id = b_open; get diagnostics n = row_count; out := out || ' | marca.atribuir=' || n;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_p1, 'role', 'authenticated')::text, true);
 set local role authenticated;
 perform public.deliver_brief(b_open, 'https://drive.example.com/x', 'ok'); out := out || ' | par.entregar=ok';
 select status::text into st from public.briefs where id = b_open; out := out || ' par.status=' || st;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_p2, 'role', 'authenticated')::text, true);
 set local role authenticated;
 begin perform public.deliver_brief(b_open, 'https://x.com', 'x'); out := out || ' | outro.entregar=PERMITIDO(ERRO)';
 exception when others then out := out || ' | outro.entregar=bloqueado'; end;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 update public.briefs set status = 'aprovado' where id = b_open;
 insert into public.partner_reviews (brief_id, partner_id, tenant_id, rating) values (b_open, p1, t, 5); out := out || ' | marca.avaliar=ok';
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.briefs; out := out || ' | loj.ve_brief=' || n;
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
