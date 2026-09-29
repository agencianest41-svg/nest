-- Linha do tempo: regras de marca sem termo mostram a orientação como título;
-- remove o ruído do seed (registros de sistema das regras iniciais).
create or replace function private.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_tenant uuid := (r ->> 'tenant_id')::uuid;
  v_op uuid;
  v_project uuid;
  v_action text;
  v_meta jsonb := '{}'::jsonb;
  v_internal boolean := coalesce((r ->> 'internal')::boolean, false);
  v_title text := coalesce(r ->> 'title', r ->> 'name', r ->> 'label', r ->> 'term', left(r ->> 'guidance', 80));
begin
  if v_tenant is null or not exists (select 1 from public.tenants where id = v_tenant) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_action := 'criou';
  elsif tg_op = 'DELETE' then
    v_action := 'removeu';
  elsif r ? 'status' then
    if (r ->> 'status') is not distinct from (o ->> 'status') then return null; end if;
    v_action := 'status';
    v_meta := jsonb_build_object('de', o ->> 'status', 'para', r ->> 'status');
  else
    v_action := 'atualizou';
  end if;

  if tg_table_name = 'plan_items' then
    select p.operation_id into v_op from public.monthly_plans p where p.id = (r ->> 'plan_id')::uuid;
  elsif tg_table_name = 'tasks' then
    v_project := (r ->> 'project_id')::uuid;
    select pr.operation_id into v_op from public.projects pr where pr.id = v_project;
  elsif tg_table_name = 'projects' then
    v_project := (r ->> 'id')::uuid;
    v_op := (r ->> 'operation_id')::uuid;
  elsif tg_table_name = 'monthly_plans' then
    v_op := (r ->> 'operation_id')::uuid;
    v_title := to_char((r ->> 'month')::date, 'MM/YYYY');
  else
    v_op := (r ->> 'operation_id')::uuid;
  end if;

  insert into public.activity_log (tenant_id, operation_id, project_id, actor_id, entity_type, entity_id, action, title, meta, internal)
  values (v_tenant, v_op, v_project, (select auth.uid()), tg_table_name, (r ->> 'id')::uuid, v_action, v_title, v_meta, v_internal);
  return null;
end $$;

update public.activity_log a set title = coalesce(r.term, left(r.guidance, 80))
from public.brand_rules r where a.entity_type = 'brand_rules' and a.entity_id = r.id and a.title is null;

delete from public.activity_log where actor_id is null and entity_type = 'brand_rules';
