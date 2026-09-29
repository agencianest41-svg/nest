-- NEST — Resultados: métricas por peça/canal, vendas por operação (marketing ×
-- vendas), integrações (prontas para ligar) e benchmark entre operações.

create type public.result_channel as enum ('instagram', 'tiktok', 'facebook', 'whatsapp', 'google', 'loja', 'outro');

create table public.result_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid not null,
  plan_item_id uuid references public.plan_items on delete set null,
  channel public.result_channel not null default 'instagram',
  published_url text check (published_url is null or published_url ~ '^https://'),
  measured_on date not null default current_date,
  reach int not null default 0 check (reach >= 0),
  impressions int not null default 0 check (impressions >= 0),
  likes int not null default 0 check (likes >= 0),
  comments int not null default 0 check (comments >= 0),
  shares int not null default 0 check (shares >= 0),
  saves int not null default 0 check (saves >= 0),
  clicks int not null default 0 check (clicks >= 0),
  leads int not null default 0 check (leads >= 0),
  visits int not null default 0 check (visits >= 0),
  sales_count int not null default 0 check (sales_count >= 0),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'importacao', 'integracao')),
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);
create index result_entries_op on public.result_entries (tenant_id, operation_id, measured_on);
create index result_entries_item on public.result_entries (plan_item_id);

create table public.operation_sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid not null,
  month date not null check (extract(day from month) = 1),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  orders int not null default 0 check (orders >= 0),
  source text not null default 'manual' check (source in ('manual', 'importacao', 'integracao')),
  notes text,
  updated_at timestamptz not null default now(),
  unique (operation_id, month),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);

create type public.integration_provider as enum ('meta', 'google_business', 'tiktok', 'planilha', 'erp');

-- Só metadados: segredos (tokens OAuth) nunca ficam em tabela exposta pela API.
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid,
  provider public.integration_provider not null,
  status text not null default 'desconectado' check (status in ('desconectado', 'solicitado', 'conectado', 'erro')),
  account_label text,
  last_sync_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);
create unique index integrations_unique on public.integrations
  (tenant_id, provider, coalesce(operation_id, '00000000-0000-0000-0000-000000000000'));

alter table public.result_entries enable row level security;
alter table public.operation_sales enable row level security;
alter table public.integrations enable row level security;

create policy results_rw on public.result_entries for all to authenticated
  using (private.can_access_operation(operation_id)) with check (private.can_access_operation(operation_id));
create policy sales_rw on public.operation_sales for all to authenticated
  using (private.can_access_operation(operation_id)) with check (private.can_access_operation(operation_id));
create policy integrations_read on public.integrations for select to authenticated
  using (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));
create policy integrations_manage on public.integrations for all to authenticated
  using (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)))
  with check (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));

create trigger operation_sales_touch before update on public.operation_sales
  for each row execute function private.touch_updated_at();
create trigger result_entries_activity after insert on public.result_entries
  for each row execute function private.log_activity();

-- Benchmark do mês: posição (percentil 0–1) de cada operação entre TODAS as
-- operações ativas do tenant, devolvendo só as linhas que o usuário pode ver.
-- Assim a loja sabe onde está na rede sem ver o número das outras.
create or replace function public.operation_benchmark(p_tenant uuid, p_month date)
returns table (operation_id uuid, pieces int, reach bigint, interactions bigint, engagement_rate numeric,
               leads bigint, revenue numeric, network_size int,
               pct_engagement numeric, pct_reach numeric, pct_leads numeric, pct_revenue numeric)
language sql stable security definer set search_path = '' as $$
  with ops as (
    select o.id from public.operations o where o.tenant_id = p_tenant and o.active
  ), agg as (
    select ops.id as operation_id,
      count(r.id)::int as pieces,
      coalesce(sum(r.reach), 0)::bigint as reach,
      coalesce(sum(r.likes + r.comments + r.shares + r.saves), 0)::bigint as interactions,
      coalesce(sum(r.leads), 0)::bigint as leads,
      coalesce((select s.revenue from public.operation_sales s where s.operation_id = ops.id and s.month = p_month), 0)
        + coalesce(sum(r.revenue), 0) as revenue
    from ops left join public.result_entries r
      on r.operation_id = ops.id and r.measured_on >= p_month and r.measured_on < (p_month + interval '1 month')::date
    group by ops.id
  ), rated as (
    select a.*, case when a.reach > 0 then round(a.interactions::numeric / a.reach, 4) else 0 end as engagement_rate
    from agg a
  ), ranked as (
    select r.*, (select count(*) from rated)::int as network_size,
      round(percent_rank() over (order by r.engagement_rate)::numeric, 2) as pct_engagement,
      round(percent_rank() over (order by r.reach)::numeric, 2) as pct_reach,
      round(percent_rank() over (order by r.leads)::numeric, 2) as pct_leads,
      round(percent_rank() over (order by r.revenue)::numeric, 2) as pct_revenue
    from rated r
  )
  select k.operation_id, k.pieces, k.reach, k.interactions, k.engagement_rate, k.leads, k.revenue, k.network_size,
         k.pct_engagement, k.pct_reach, k.pct_leads, k.pct_revenue
  from ranked k
  where private.can_access_operation(k.operation_id);
$$;
revoke execute on function public.operation_benchmark(uuid, date) from public, anon;
grant execute on function public.operation_benchmark(uuid, date) to authenticated;
