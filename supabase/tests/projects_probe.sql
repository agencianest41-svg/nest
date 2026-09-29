-- Teste de RLS de playbooks, projetos, tarefas, comentários, linha do tempo e
-- contratos. Termina com RAISE: tudo é desfeito. Esperado:
--   pb.global=5 | marca.start=ok marca.tasks=11 marca.interna_criar=bloqueado
--   | loj.proj=1 loj.tasks=11 loj.concluir_livre=1 loj.concluir_aprovacao=bloqueado
--   loj.mudar_titulo=bloqueado loj.comentar=ok loj.activity>0=true loj.contrato=1
--   | outra.proj=0 outra.tasks=0 outra.comentar=bloqueado
--   | marca.aprovar=1 marca.aprovado_por=t marca.interna_ve=0 marca.contrato_criar=bloqueado
--   | hub.interna=1 hub.contratos=2
do $$
declare
  t uuid; belem uuid; recife uuid; pb uuid; proj uuid; tk_free uuid; tk_appr uuid; n int; out text := '';
  u_loj uuid := gen_random_uuid(); u_out uuid := gen_random_uuid(); u_marca uuid := gen_random_uuid(); u_hub uuid := gen_random_uuid();
  ok boolean;
begin
  select id into t from public.tenants where slug = 'mahogany';
  select id into belem from public.operations where instagram = '@mahoganybelem';
  select id into recife from public.operations where instagram = '@mahogany_recife';
  select id into pb from public.playbooks where tenant_id is null and name = 'Ciclo mensal de conteúdo';

  insert into auth.users (id, instance_id, aud, role, email) values
    (u_loj, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-loj@nest.test'),
    (u_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-out@nest.test'),
    (u_marca, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-marca@nest.test'),
    (u_hub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p-hub@nest.test');
  insert into public.memberships (tenant_id, user_id, role, operation_id) values (t, u_loj, 'lojista', belem), (t, u_out, 'lojista', recife);
  insert into public.memberships (tenant_id, user_id, role) values (t, u_marca, 'marca'), (t, u_hub, 'hub');
  insert into public.contracts (tenant_id, operation_id, name, monthly_fee) values (t, belem, 'Belém', 1000), (t, null, 'Rede', 5000);

  -- marca
  perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.playbooks where tenant_id is null; out := 'pb.global=' || n;
  proj := public.start_project(t, pb, 'Ciclo out/26 Belém', '2026-09-20', belem);
  out := out || ' | marca.start=ok';
  select count(*) into n from public.tasks where project_id = proj; out := out || ' marca.tasks=' || n;
  begin insert into public.tasks (tenant_id, project_id, title, internal) values (t, proj, 'x', true); out := out || ' marca.interna_criar=PERMITIDO(ERRO)';
  exception when others then out := out || ' marca.interna_criar=bloqueado'; end;
  reset role;

  select id into tk_free from public.tasks where project_id = proj and position = 1;
  select id into tk_appr from public.tasks where project_id = proj and position = 3;

  -- lojista da operação
  perform set_config('request.jwt.claims', json_build_object('sub', u_loj, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.projects; out := out || ' | loj.proj=' || n;
  select count(*) into n from public.tasks; out := out || ' loj.tasks=' || n;
  update public.tasks set status = 'concluida' where id = tk_free; get diagnostics n = row_count; out := out || ' loj.concluir_livre=' || n;
  begin update public.tasks set status = 'concluida' where id = tk_appr; out := out || ' loj.concluir_aprovacao=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.concluir_aprovacao=bloqueado'; end;
  begin update public.tasks set title = 'hack' where id = tk_free; out := out || ' loj.mudar_titulo=PERMITIDO(ERRO)';
  exception when others then out := out || ' loj.mudar_titulo=bloqueado'; end;
  insert into public.comments (tenant_id, entity_type, entity_id, body) values (t, 'task', tk_free, 'feito'); out := out || ' loj.comentar=ok';
  select count(*) > 0 into ok from public.activity_log where project_id = proj; out := out || ' loj.activity>0=' || ok;
  select count(*) into n from public.contracts; out := out || ' loj.contrato=' || n;
  reset role;

  -- lojista de outra operação
  perform set_config('request.jwt.claims', json_build_object('sub', u_out, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.projects; out := out || ' | outra.proj=' || n;
  select count(*) into n from public.tasks; out := out || ' outra.tasks=' || n;
  begin insert into public.comments (tenant_id, entity_type, entity_id, body) values (t, 'task', tk_free, 'x'); out := out || ' outra.comentar=PERMITIDO(ERRO)';
  exception when others then out := out || ' outra.comentar=bloqueado'; end;
  reset role;

  -- hub cria tarefa interna
  perform set_config('request.jwt.claims', json_build_object('sub', u_hub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.tasks (tenant_id, project_id, title, internal) values (t, proj, 'Horas do mês', true);
  reset role;

  -- marca aprova
  perform set_config('request.jwt.claims', json_build_object('sub', u_marca, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.tasks set status = 'concluida' where id = tk_appr; get diagnostics n = row_count; out := out || ' | marca.aprovar=' || n;
  select approved_by = u_marca into ok from public.tasks where id = tk_appr; out := out || ' marca.aprovado_por=' || ok;
  select count(*) into n from public.tasks where internal; out := out || ' marca.interna_ve=' || n;
  begin insert into public.contracts (tenant_id, name) values (t, 'x'); out := out || ' marca.contrato_criar=PERMITIDO(ERRO)';
  exception when others then out := out || ' marca.contrato_criar=bloqueado'; end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', u_hub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.tasks where internal; out := out || ' | hub.interna=' || n;
  select count(*) into n from public.contracts; out := out || ' hub.contratos=' || n;
  reset role;

  raise exception 'PROBE_RESULT: %', out;
end $$;
