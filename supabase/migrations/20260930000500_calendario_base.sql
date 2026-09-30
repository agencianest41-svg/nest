-- NEST — Motor de pautas, fase 3: calendário-base da rede.
-- A IA gera a base de M+1 (campanhas + editorias + volume do maior pacote +
-- cases), a Hub revisa e "Liberar para a rede" cria as pautas de cada loja em
-- lote, pelo pacote da operação. Quem adapta à cidade é o "escrever com IA" da
-- própria pauta, que já recebe o contexto da loja.

create type public.network_plan_status as enum ('rascunho', 'revisao', 'liberado');

create table public.network_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  month date not null check (extract(day from month) = 1),
  status public.network_plan_status not null default 'rascunho',
  focus text,
  generated_at timestamptz,
  released_at timestamptz,
  released_by uuid references auth.users on delete set null,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, month),
  unique (tenant_id, id)
);
create index network_plans_released_by on public.network_plans (released_by);
create index network_plans_created_by on public.network_plans (created_by);

-- min_tier: menor pacote que recebe a pauta (essencial = todas as lojas).
create table public.network_plan_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  network_plan_id uuid not null,
  position int not null default 0,
  title text not null check (length(trim(title)) > 0),
  format public.item_format not null default 'reels',
  scheduled_on date,
  min_tier public.service_tier not null default 'essencial',
  calendar_event_id uuid references public.calendar_events on delete set null,
  editoria_id uuid,
  funnel public.funnel_stage,
  idea text,
  rationale text,
  hook text,
  kit_id uuid,
  practice_id uuid,
  sensitive boolean not null default false,
  origin text not null default 'manual' check (origin in ('manual', 'ia')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, network_plan_id) references public.network_plans (tenant_id, id) on delete cascade,
  constraint network_items_editoria_fk foreign key (tenant_id, editoria_id)
    references public.editorias (tenant_id, id) on delete set null (editoria_id),
  constraint network_items_kit_fk foreign key (tenant_id, kit_id)
    references public.kits (tenant_id, id) on delete set null (kit_id),
  constraint network_items_practice_fk foreign key (tenant_id, practice_id)
    references public.best_practices (tenant_id, id) on delete set null (practice_id)
);
create index network_items_plan on public.network_plan_items (tenant_id, network_plan_id, scheduled_on);
create index network_items_event on public.network_plan_items (calendar_event_id);
create index network_items_editoria on public.network_plan_items (tenant_id, editoria_id);
create index network_items_kit on public.network_plan_items (tenant_id, kit_id);
create index network_items_practice on public.network_plan_items (tenant_id, practice_id);
create index network_items_created_by on public.network_plan_items (created_by);

-- A base é trabalho interno de Hub/Marca: a loja só vê o que foi liberado.
alter table public.network_plans enable row level security;
create policy network_plans_read on public.network_plans for select to authenticated
  using (private.is_tenant_manager(tenant_id));
create policy network_plans_manage_insert on public.network_plans for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy network_plans_manage_update on public.network_plans for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy network_plans_manage_delete on public.network_plans for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

alter table public.network_plan_items enable row level security;
create policy network_items_read on public.network_plan_items for select to authenticated
  using (private.is_tenant_manager(tenant_id));
create policy network_items_manage_insert on public.network_plan_items for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy network_items_manage_update on public.network_plan_items for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy network_items_manage_delete on public.network_plan_items for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

create trigger network_plans_touch before update on public.network_plans
  for each row execute function private.touch_updated_at();
create trigger network_items_touch before update on public.network_plan_items
  for each row execute function private.touch_updated_at();

-- Pauta da loja lembra de qual pauta da base veio (liberar de novo não duplica).
alter table public.plan_items
  add column base_item_id uuid references public.network_plan_items on delete set null;
create unique index plan_items_base_item on public.plan_items (plan_id, base_item_id) where base_item_id is not null;
create index plan_items_base_item_ref on public.plan_items (base_item_id);

-- Liberar para a rede: cria o plano do mês de cada loja (piloto; todas se não
-- houver piloto) e copia as pautas da base que cabem no pacote da operação.
-- Lojas sem pacote recebem o Essencial. Posts e stories são cortados pela cota
-- do pacote, em ordem de data; ativações (VIP, evento, ação na loja) não contam.
-- Rodar de novo só acrescenta o que ainda não foi liberado.
create or replace function public.release_network_plan(p_plan uuid)
returns table (operations int, items int)
language plpgsql security invoker set search_path = '' as $$
declare
  v_plan public.network_plans;
  v_ops int := 0;
  v_items int := 0;
  v_n int;
  r record;
begin
  select * into v_plan from public.network_plans where id = p_plan;
  if v_plan.id is null or not private.is_tenant_manager(v_plan.tenant_id) then
    raise exception 'Apenas Hub ou Marca liberam o calendário da rede';
  end if;

  for r in
    select o.id, coalesce(o.tier, 'essencial'::public.service_tier) as tier
    from public.operations o
    where o.tenant_id = v_plan.tenant_id
      and (o.in_pilot or not exists (
        select 1 from public.operations p where p.tenant_id = v_plan.tenant_id and p.in_pilot))
  loop
    insert into public.monthly_plans (tenant_id, operation_id, month, created_by)
    values (v_plan.tenant_id, r.id, v_plan.month, (select auth.uid()))
    on conflict (operation_id, month) do nothing;

    with plan as (
      select mp.id from public.monthly_plans mp where mp.operation_id = r.id and mp.month = v_plan.month
    ), quota as (
      select q.posts, q.stories from public.tier_quotas q where q.tenant_id = v_plan.tenant_id and q.tier = r.tier
    ), ranked as (
      select i.*,
        case when i.format = 'stories' then 'stories'
             when i.format in ('reels', 'carrossel', 'post') then 'posts' end as kind,
        row_number() over (
          partition by case when i.format = 'stories' then 1 when i.format in ('reels', 'carrossel', 'post') then 2 else 3 end
          order by i.scheduled_on nulls last, i.position, i.created_at) as rn
      from public.network_plan_items i
      where i.network_plan_id = v_plan.id and i.min_tier <= r.tier
    ), ins as (
      insert into public.plan_items (
        tenant_id, plan_id, base_item_id, calendar_event_id, title, format, scheduled_on, status,
        editoria_id, funnel, idea, rationale, hook, kit_id, practice_id, sensitive, origin, created_by)
      select v_plan.tenant_id, p.id, k.id, k.calendar_event_id, k.title, k.format, k.scheduled_on, 'ideia',
        k.editoria_id, k.funnel, k.idea, k.rationale, k.hook, k.kit_id, k.practice_id, k.sensitive, 'base', (select auth.uid())
      from ranked k cross join plan p
      where (k.kind is null or k.rn <= coalesce(
              (select case k.kind when 'posts' then qq.posts else qq.stories end from quota qq), 1000))
        and not exists (select 1 from public.plan_items x where x.plan_id = p.id and x.base_item_id = k.id)
      returning 1
    )
    select count(*) into v_n from ins;

    v_ops := v_ops + 1;
    v_items := v_items + v_n;
  end loop;

  update public.network_plans
  set status = 'liberado', released_at = now(), released_by = (select auth.uid())
  where id = v_plan.id;

  return query select v_ops, v_items;
end $$;
revoke execute on function public.release_network_plan(uuid) from public, anon;
grant execute on function public.release_network_plan(uuid) to authenticated;

-- Nova função de IA: gerar o calendário-base.
alter table public.ai_settings alter column features set default
  '{estudio.sugerir,estudio.escrever,marca.checar,relatorio.resumo,resultado.insights,biblioteca.case,brief.gerar,base.gerar}';
update public.ai_settings set features = array_append(features, 'base.gerar')
where not ('base.gerar' = any (features));
