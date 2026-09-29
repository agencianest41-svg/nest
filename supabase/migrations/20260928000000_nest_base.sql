-- NEST — base multi-tenant: marcas (tenants), tema, regiões, operações, perfis,
-- calendário e plano mensal por operação.
-- Tudo que é específico de uma marca é dado nestas tabelas; nada fica no código.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('hub', 'marca', 'regional', 'lojista');
create type public.operation_kind as enum ('loja', 'grupo', 'revenda');
create type public.service_tier as enum ('essencial', 'acompanhamento', 'ativacao', 'inteligencia');
create type public.event_scope as enum ('nacional', 'regional', 'local');
create type public.event_kind as enum ('campanha', 'data_comercial', 'data_local', 'clima');
create type public.plan_status as enum ('rascunho', 'em_execucao', 'em_analise', 'fechado');
create type public.item_format as enum ('reels', 'carrossel', 'stories', 'post', 'whatsapp', 'evento', 'acao_loja');
create type public.item_status as enum ('ideia', 'roteiro', 'aprovacao', 'aprovado', 'publicado');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  created_at timestamptz not null default now()
);

-- Camada de marca: só estes valores mudam entre clientes.
create table public.tenant_themes (
  tenant_id uuid primary key references public.tenants on delete cascade,
  brand text not null,
  brand_hover text not null,
  brand_soft text not null,
  on_brand text not null,
  accent text not null,
  accent_ink text not null,
  brand_dark text not null,
  brand_hover_dark text not null,
  brand_soft_dark text not null,
  on_brand_dark text not null,
  accent_ink_dark text not null,
  font_display text not null default 'var(--font-dm-serif), Georgia, serif',
  logo_url text,
  logo_dark_url text
);

create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  code text not null,
  name text not null,
  unique (tenant_id, code),
  unique (tenant_id, id)
);

create table public.operations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  region_id uuid not null,
  name text not null,
  city text,
  state text,
  instagram text,
  kind public.operation_kind not null default 'loja',
  tier public.service_tier,
  in_pilot boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, region_id) references public.regions (tenant_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role public.member_role not null,
  region_id uuid,
  operation_id uuid,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, region_id) references public.regions (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id),
  check (role <> 'regional' or region_id is not null),
  check (role <> 'lojista' or operation_id is not null)
);
create unique index memberships_unique on public.memberships
  (tenant_id, user_id, role, coalesce(region_id, '00000000-0000-0000-0000-000000000000'),
   coalesce(operation_id, '00000000-0000-0000-0000-000000000000'));

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  scope public.event_scope not null,
  kind public.event_kind not null default 'campanha',
  region_id uuid,
  operation_id uuid,
  title text not null,
  notes text,
  starts_on date not null,
  ends_on date not null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, region_id) references public.regions (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id),
  check (ends_on >= starts_on),
  check (
    (scope = 'nacional' and region_id is null and operation_id is null) or
    (scope = 'regional' and region_id is not null and operation_id is null) or
    (scope = 'local' and operation_id is not null)
  )
);
create index calendar_events_range on public.calendar_events (tenant_id, starts_on, ends_on);

create table public.monthly_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operation_id uuid not null,
  month date not null check (extract(day from month) = 1),
  status public.plan_status not null default 'rascunho',
  focus text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, month),
  unique (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);

create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null,
  calendar_event_id uuid,
  title text not null,
  format public.item_format not null default 'reels',
  scheduled_on date,
  status public.item_status not null default 'ideia',
  script text,
  caption text,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, plan_id) references public.monthly_plans (tenant_id, id) on delete cascade,
  foreign key (calendar_event_id) references public.calendar_events on delete set null
);
create index plan_items_plan on public.plan_items (plan_id);

-- ---------------------------------------------------------------------------
-- Funções de acesso (security definer para não recursar nas policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create or replace function public.is_tenant_member(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = (select auth.uid())
  );
$$;

-- Hub e marca enxergam e gerenciam a rede inteira do tenant.
create or replace function public.is_tenant_manager(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role in ('hub', 'marca')
  );
$$;

create or replace function public.can_access_region(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.regions reg
    where reg.id = r and (
      public.is_tenant_manager(reg.tenant_id) or exists (
        select 1 from public.memberships m
        where m.tenant_id = reg.tenant_id and m.user_id = (select auth.uid())
          and m.role = 'regional' and m.region_id = reg.id
      )
    )
  );
$$;

create or replace function public.can_access_operation(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.operations op
    where op.id = o and (
      public.is_tenant_manager(op.tenant_id) or exists (
        select 1 from public.memberships m
        where m.tenant_id = op.tenant_id and m.user_id = (select auth.uid())
          and ((m.role = 'regional' and m.region_id = op.region_id)
            or (m.role = 'lojista' and m.operation_id = op.id))
      )
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Integridade que a policy não expressa
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger monthly_plans_touch before update on public.monthly_plans
  for each row execute function public.touch_updated_at();
create trigger plan_items_touch before update on public.plan_items
  for each row execute function public.touch_updated_at();

-- Só hub/marca aprovam: lojista pode levar a peça até 'aprovacao' e marcar
-- 'publicado' depois de aprovada, mas não pode pular a aprovação.
create or replace function public.guard_item_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or public.is_tenant_manager(new.tenant_id) then
    return new;
  end if;
  if new.status = 'aprovado' and (tg_op = 'INSERT' or old.status <> 'aprovado') then
    raise exception 'Apenas Hub ou Marca podem aprovar peças';
  end if;
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status not in ('aprovado', 'publicado')) then
    raise exception 'A peça precisa estar aprovada antes de ser publicada';
  end if;
  return new;
end $$;

create trigger plan_items_guard before insert or update on public.plan_items
  for each row execute function public.guard_item_approval();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_themes enable row level security;
alter table public.platform_admins enable row level security;
alter table public.regions enable row level security;
alter table public.operations enable row level security;
alter table public.memberships enable row level security;
alter table public.calendar_events enable row level security;
alter table public.monthly_plans enable row level security;
alter table public.plan_items enable row level security;

create policy tenants_read on public.tenants for select to authenticated
  using (public.is_tenant_member(id));
create policy tenants_admin on public.tenants for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy themes_read on public.tenant_themes for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy themes_admin on public.tenant_themes for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

create policy regions_read on public.regions for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy regions_manage on public.regions for all to authenticated
  using (public.is_tenant_manager(tenant_id)) with check (public.is_tenant_manager(tenant_id));

create policy operations_read on public.operations for select to authenticated
  using (public.can_access_operation(id));
create policy operations_manage on public.operations for all to authenticated
  using (public.is_tenant_manager(tenant_id)) with check (public.is_tenant_manager(tenant_id));

create policy memberships_read on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.is_tenant_manager(tenant_id));
create policy memberships_manage on public.memberships for all to authenticated
  using (public.is_tenant_manager(tenant_id)) with check (public.is_tenant_manager(tenant_id));

create policy events_read on public.calendar_events for select to authenticated
  using (
    public.is_tenant_member(tenant_id) and (
      scope = 'nacional'
      or (scope = 'regional' and (public.is_tenant_manager(tenant_id) or public.can_access_region(region_id)
          or exists (select 1 from public.memberships m join public.operations op on op.id = m.operation_id
                     where m.user_id = (select auth.uid()) and op.region_id = calendar_events.region_id)))
      or (scope = 'local' and public.can_access_operation(operation_id))
    )
  );
create policy events_write_national on public.calendar_events for all to authenticated
  using (scope in ('nacional', 'regional') and public.is_tenant_manager(tenant_id))
  with check (scope in ('nacional', 'regional') and public.is_tenant_manager(tenant_id));
create policy events_write_local on public.calendar_events for all to authenticated
  using (scope = 'local' and public.can_access_operation(operation_id))
  with check (scope = 'local' and public.can_access_operation(operation_id));

create policy plans_rw on public.monthly_plans for all to authenticated
  using (public.can_access_operation(operation_id))
  with check (public.can_access_operation(operation_id));

create policy items_rw on public.plan_items for all to authenticated
  using (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.can_access_operation(p.operation_id)))
  with check (exists (select 1 from public.monthly_plans p where p.id = plan_id and public.can_access_operation(p.operation_id)));

-- Funções de acesso só servem às policies: fora do alcance de visitantes (anon).
revoke execute on function public.is_platform_admin(), public.is_tenant_member(uuid),
  public.is_tenant_manager(uuid), public.can_access_region(uuid), public.can_access_operation(uuid),
  public.guard_item_approval(), public.touch_updated_at()
  from public, anon;
grant execute on function public.is_platform_admin(), public.is_tenant_member(uuid),
  public.is_tenant_manager(uuid), public.can_access_region(uuid), public.can_access_operation(uuid)
  to authenticated;
