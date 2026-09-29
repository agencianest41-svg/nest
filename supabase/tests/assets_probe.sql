-- Teste de Kits & Ativos, direitos de uso, compartilhamento entre marcas e
-- Biblioteca (rede NEST anonimizada). Termina com RAISE (nada fica). Esperado:
--   marca.share_targets=1 marca.arquivo_vencido=true | loj.assets=1 loj.kits_rascunho=0
--   loj.arquivo_vencido=false loj.upload_op=ok loj.oficial=bloqueado loj.uso=ok loj.praticas=1
--   | outra.asset_de_belem=0 | loj.kits_publicado=1 loj.arquivo_ok=true
--   | outra_marca.compartilhado=1 outra_marca.rede=1 outra_marca.praticas_diretas=0
do $$
declare t uuid; t2 uuid; belem uuid; recife uuid; a_off uuid; a_draft uuid; a_loj uuid; k uuid; n int; ok boolean; out text := '';
 u_loj uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid(); u_other uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 insert into public.tenants (slug, name, segment) values ('probe-x', 'Probe X', 'Moda') returning id into t2;
 select id into belem from public.operations where instagram = '@mahoganybelem';
 select id into recife from public.operations where instagram = '@mahogany_recife';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-loj@nest.test'),
 (u_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-out@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-marca@nest.test'),
 (u_other, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a-other@nest.test');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem), (t, u_out, 'lojista', recife);
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca'), (t2, u_marca, 'marca'), (t2, u_other, 'marca');

 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.assets (tenant_id, title, kind, storage_path, official) values (t, 'Key visual', 'imagem', t || '/kv.png', true) returning id into a_off;
 insert into public.assets (tenant_id, title, kind, body) values (t, 'Rascunho', 'texto', 'x') returning id into a_draft;
 insert into public.asset_rights (tenant_id, asset_id, holder, valid_until) values (t, a_off, 'Modelo Ana', '2020-01-01');
 insert into public.kits (tenant_id, title) values (t, 'Kit BF') returning id into k;
 insert into public.kit_assets (tenant_id, kit_id, asset_id) values (t, k, a_off);
 select count(*) into n from public.share_targets(t); out := 'marca.share_targets=' || n;
 insert into public.asset_shares (asset_id, from_tenant_id, to_tenant_id) values (a_off, t, t2);
 insert into public.best_practices (tenant_id, title, summary, published, share_network, operation_id) values (t, 'Case Círio', 'Reels na procissão', true, true, belem);
 select private.can_read_asset_file(t || '/kv.png') into ok; out := out || ' marca.arquivo_vencido=' || ok;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.assets; out := out || ' | loj.assets=' || n;
 select count(*) into n from public.kits; out := out || ' loj.kits_rascunho=' || n;
 select private.can_read_asset_file(t || '/kv.png') into ok; out := out || ' loj.arquivo_vencido=' || ok;
 insert into public.assets (tenant_id, title, kind, body, operation_id) values (t, 'Minha foto', 'texto', 'y', belem) returning id into a_loj; out := out || ' loj.upload_op=ok';
 begin insert into public.assets (tenant_id, title, kind, body, official) values (t, 'x', 'texto', 'y', true); out := out || ' loj.oficial=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.oficial=bloqueado'; end;
 insert into public.asset_uses (asset_id, tenant_id, action) values (a_off, t, 'download'); out := out || ' loj.uso=ok';
 select count(*) into n from public.best_practices; out := out || ' loj.praticas=' || n;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.assets where id = a_loj; out := out || ' | outra.asset_de_belem=' || n;
 reset role;

 update public.kits set published = true where id = k;
 delete from public.asset_rights where asset_id = a_off;
 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.kits; out := out || ' | loj.kits_publicado=' || n;
 select private.can_read_asset_file(t || '/kv.png') into ok; out := out || ' loj.arquivo_ok=' || ok;
 reset role;

 perform set_config('request.jwt.claims', json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.assets where tenant_id = t; out := out || ' | outra_marca.compartilhado=' || n;
 select count(*) into n from public.network_practices(); out := out || ' outra_marca.rede=' || n;
 select count(*) into n from public.best_practices; out := out || ' outra_marca.praticas_diretas=' || n;
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
