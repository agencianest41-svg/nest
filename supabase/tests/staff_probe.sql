-- Teste da equipe interna (custos e horas só para Hub/admin). Esperado:
--   marca.staff=0 marca.dir=0 marca.horas=0 | hub.staff=1 hub.dir_self=1 hub.horas=1 hub.editar_custo=0
do $$
declare t uuid; n int; out text := ''; u_hub uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
begin
 select id into t from public.tenants where slug = 'mahogany';
 insert into auth.users (id, instance_id, aud, role, email) values
 (u_hub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's-hub@nest.test'),
 (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's-marca@nest.test');
 insert into public.memberships (tenant_id, user_id, role) values (t, u_hub, 'hub'), (t, u_marca, 'marca');
 insert into public.staff_profiles (user_id, hourly_cost) values (u_hub, 80);
 insert into public.time_entries (tenant_id, user_id, minutes) values (t, u_hub, 90);
 perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.staff_profiles; out := 'marca.staff=' || n;
 select count(*) into n from public.staff_directory(); out := out || ' marca.dir=' || n;
 select count(*) into n from public.time_entries; out := out || ' marca.horas=' || n;
 reset role;
 perform set_config('request.jwt.claims', json_build_object('sub', u_hub, 'role', 'authenticated')::text, true);
 set local role authenticated;
 select count(*) into n from public.staff_profiles; out := out || ' | hub.staff=' || n;
 select count(*) into n from public.staff_directory() where user_id = u_hub; out := out || ' hub.dir_self=' || n;
 select count(*) into n from public.time_entries; out := out || ' hub.horas=' || n;
 update public.staff_profiles set hourly_cost = 1 where user_id = u_hub; get diagnostics n = row_count; out := out || ' hub.editar_custo=' || n;
 reset role;
 raise exception 'PROBE_RESULT: %', out;
end $$;
