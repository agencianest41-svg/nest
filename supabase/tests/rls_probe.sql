-- Teste das regras de acesso (RLS) por perfil. Roda como superusuário, simula
-- lojista, regional, marca e anon, e termina com RAISE: a transação inteira é
-- desfeita e nada fica no banco. O resultado vem na mensagem de erro.
--
-- Esperado (tenant Mahogany do seed):
--   loj.ops=1 loj.events=5 loj.regions=4 loj.memberships=1 loj.plano+peca=ok
--   loj.aprovar=bloqueado loj.publicar_sem_aprovar=bloqueado loj.plano_outra_loja=bloqueado
--   loj.evento_nacional=bloqueado loj.autopromover=bloqueado
--   reg.ops=8 reg.events=5 reg.planos_visiveis=0
--   marca.ops=20 marca.events=7 marca.aprovar=1 | loj.publicar_aprovado=1 | anon.ops=0
do $$
declare
  t uuid; belem uuid; recife uuid; ne uuid;
  u_loj uuid := gen_random_uuid(); u_reg uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid();
  plan uuid; item uuid; n int; out text := '';
begin
  select id into t from public.tenants where slug = 'mahogany';
  select id into belem from public.operations where instagram = '@mahoganybelem';
  select id into recife from public.operations where instagram = '@mahogany_recife';
  select id into ne from public.regions where tenant_id = t and code = 'NE';

  insert into auth.users (id, instance_id, aud, role, email) values
    (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-loj@nest.test'),
    (u_reg, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-reg@nest.test'),
    (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'probe-marca@nest.test');
  insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem);
  insert into public.memberships (tenant_id, user_id, role, region_id) values (t, u_reg, 'regional', ne);
  insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca');

  perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.operations; out := out || 'loj.ops=' || n;
  select count(*) into n from public.calendar_events; out := out || ' loj.events=' || n;
  select count(*) into n from public.regions; out := out || ' loj.regions=' || n;
  select count(*) into n from public.memberships; out := out || ' loj.memberships=' || n;
  insert into public.monthly_plans (tenant_id, operation_id, month) values (t, belem, '2027-03-01') returning id into plan;
  insert into public.plan_items (tenant_id, plan_id, title, status) values (t, plan, 'Reels Círio', 'aprovacao') returning id into item;
  out := out || ' loj.plano+peca=ok';
  begin update public.plan_items set status = 'aprovado' where id = item; out := out || ' loj.aprovar=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.aprovar=bloqueado'; end;
  begin update public.plan_items set status = 'publicado' where id = item; out := out || ' loj.publicar_sem_aprovar=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.publicar_sem_aprovar=bloqueado'; end;
  begin insert into public.monthly_plans (tenant_id, operation_id, month) values (t, recife, '2027-03-01'); out := out || ' loj.plano_outra_loja=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.plano_outra_loja=bloqueado'; end;
  begin insert into public.calendar_events (tenant_id, scope, title, starts_on, ends_on) values (t, 'nacional', 'x', '2026-10-01', '2026-10-01'); out := out || ' loj.evento_nacional=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.evento_nacional=bloqueado'; end;
  begin insert into public.memberships (tenant_id, user_id, role) values (t, u_loj, 'marca'); out := out || ' loj.autopromover=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.autopromover=bloqueado'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_reg, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.operations; out := out || ' | reg.ops=' || n;
  select count(*) into n from public.calendar_events; out := out || ' reg.events=' || n;
  select count(*) into n from public.monthly_plans; out := out || ' reg.planos_visiveis=' || n;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.operations; out := out || ' | marca.ops=' || n;
  select count(*) into n from public.calendar_events; out := out || ' marca.events=' || n;
  update public.plan_items set status = 'aprovado' where id = item;
  get diagnostics n = row_count; out := out || ' marca.aprovar=' || n;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.plan_items set status = 'publicado' where id = item;
  get diagnostics n = row_count; out := out || ' | loj.publicar_aprovado=' || n;
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin select count(*) into n from public.operations; out := out || ' | anon.ops=' || n;
  exception when others then out := out || ' | anon.ops=negado'; end;
  reset role;

  raise exception 'PROBE_RESULT: %', out;
end $$;
