-- Teste de Resultados e benchmark. Termina com RAISE (nada fica). Esperado:
--   loj.lancar=ok loj.outra_loja=bloqueado loj.vendas=ok loj.bench_linhas=1 loj.rede=20 loj.pct_eng=1.00
--   | outra.ve_resultado=0 | marca.bench_linhas=20
do $$
declare t uuid; belem uuid; recife uuid; n int; r record; out text := '';
 u_loj uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 select id into belem from public.operations where instagram = '@mahoganybelem';
 select id into recife from public.operations where instagram = '@mahogany_recife';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-loj@nest.test'),
 (u_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-out@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r-marca@nest.test');
 insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem), (t, u_out, 'lojista', recife);
 insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');

 perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
 set local role authenticated;
 insert into public.result_entries (tenant_id, operation_id, measured_on, reach, likes, comments, leads) values (t, belem, '2026-10-10', 1000, 90, 10, 5);
 out := 'loj.lancar=ok';
 begin insert into public.result_entries (tenant_id, operation_id, reach) values (t, recife, 1); out := out || ' loj.outra_loja=PERMITIDO(ERRO)';
 exception when others then out := out || ' loj.outra_loja=bloqueado'; end;
 insert into public.operation_sales (tenant_id, operation_id, month, revenue) values (t, belem, '2026-10-01', 50000); out := out || ' loj.vendas=ok';
 select count(*) into n from public.operation_benchmark(t, '2026-10-01'); out := out || ' loj.bench_linhas=' || n;
 select * into r from public.operation_benchmark(t, '2026-10-01'); out := out || ' loj.rede=' || r.network_size || ' loj.pct_eng=' || r.pct_engagement;
 reset role;
 perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.result_entries; out := out || ' | outra.ve_resultado=' || n;
 reset role;
 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.operation_benchmark(t, '2026-10-01'); out := out || ' | marca.bench_linhas=' || n;
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
