-- NEST — Kits & Ativos (com linhagem, direitos de uso e reaproveitamento entre
-- marcas/agências) e Biblioteca de melhores práticas (da marca e da rede NEST).

alter table public.tenants add column if not exists segment text;
update public.tenants set segment = 'Perfumaria e cosméticos' where slug = 'mahogany';

create type public.asset_kind as enum ('imagem', 'video', 'documento', 'template', 'texto', 'audio', 'link');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  title text not null,
  description text,
  kind public.asset_kind not null,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  url text check (url is null or url ~ '^https://'),
  body text,
  tags text[] not null default '{}',
  calendar_event_id uuid references public.calendar_events on delete set null,
  operation_id uuid,
  official boolean not null default false,
  parent_asset_id uuid references public.assets on delete set null,
  origin_tenant_id uuid references public.tenants on delete set null,
  source_plan_item_id uuid references public.plan_items on delete set null,
  archived boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  check (storage_path is not null or url is not null or body is not null)
);
create index assets_tenant on public.assets (tenant_id, archived, created_at desc);
create index assets_parent on public.assets (parent_asset_id);
create index assets_path on public.assets (storage_path);

create table public.asset_rights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  holder text not null,
  kind text not null default 'imagem',
  valid_from date,
  valid_until date,
  territory text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, asset_id) references public.assets (tenant_id, id) on delete cascade,
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create index asset_rights_asset on public.asset_rights (asset_id);
create index asset_rights_due on public.asset_rights (tenant_id, valid_until);

create table public.kits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  title text not null,
  description text,
  calendar_event_id uuid references public.calendar_events on delete set null,
  published boolean not null default false,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.kit_assets (
  tenant_id uuid not null,
  kit_id uuid not null,
  asset_id uuid not null,
  position int not null default 0,
  primary key (kit_id, asset_id),
  foreign key (tenant_id, kit_id) references public.kits (tenant_id, id) on delete cascade,
  foreign key (tenant_id, asset_id) references public.assets (tenant_id, id) on delete cascade
);

create table public.asset_shares (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets on delete cascade,
  from_tenant_id uuid not null references public.tenants on delete cascade,
  to_tenant_id uuid not null references public.tenants on delete cascade,
  license text not null default 'Uso interno',
  allow_derivatives boolean not null default true,
  expires_on date,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, to_tenant_id),
  check (from_tenant_id <> to_tenant_id)
);

create table public.asset_uses (
  id bigint generated always as identity primary key,
  asset_id uuid not null references public.assets on delete cascade,
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  operation_id uuid,
  action text not null check (action in ('download', 'copia', 'reuso', 'derivacao')),
  created_at timestamptz not null default now()
);
create index asset_uses_asset on public.asset_uses (asset_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Acesso a ativos
-- ---------------------------------------------------------------------------
-- Gestor vê tudo do tenant; os demais veem oficiais da rede e os da própria
-- operação; marcas que receberam compartilhamento válido veem o ativo.
create or replace function private.can_read_asset(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assets x where x.id = a and (
      private.is_tenant_manager(x.tenant_id)
      or (not x.archived and private.is_tenant_member(x.tenant_id) and (
            (x.operation_id is null and x.official)
            or (x.operation_id is not null and private.can_access_operation(x.operation_id))
            or x.created_by = (select auth.uid())))
      or exists (select 1 from public.asset_shares s
                 where s.asset_id = x.id and private.is_tenant_manager(s.to_tenant_id)
                   and (s.expires_on is null or s.expires_on >= current_date))
    )
  );
$$;

-- Arquivo: quem lê algum ativo que aponta para ele. Fora da gestão, direito de
-- uso vencido bloqueia o download.
create or replace function private.can_read_asset_file(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assets x
    where x.storage_path = p and private.can_read_asset(x.id) and (
      private.is_tenant_manager(x.tenant_id)
      or not exists (select 1 from public.asset_rights r
                     where r.asset_id = coalesce(x.parent_asset_id, x.id) and r.valid_until < current_date)
    )
  );
$$;
grant execute on function private.can_read_asset(uuid), private.can_read_asset_file(text) to authenticated;

alter table public.assets enable row level security;
alter table public.asset_rights enable row level security;
alter table public.kits enable row level security;
alter table public.kit_assets enable row level security;
alter table public.asset_shares enable row level security;
alter table public.asset_uses enable row level security;

create policy assets_read on public.assets for select to authenticated using (private.can_read_asset(id));
create policy assets_insert on public.assets for insert to authenticated with check (
  private.is_tenant_manager(tenant_id)
  or (not official and operation_id is not null and private.can_access_operation(operation_id))
);
create policy assets_update on public.assets for update to authenticated
  using (private.is_tenant_manager(tenant_id) or (created_by = (select auth.uid()) and operation_id is not null and private.can_access_operation(operation_id)))
  with check (private.is_tenant_manager(tenant_id) or (not official and operation_id is not null and private.can_access_operation(operation_id)));
create policy assets_delete on public.assets for delete to authenticated
  using (private.is_tenant_manager(tenant_id) or (created_by = (select auth.uid()) and operation_id is not null and private.can_access_operation(operation_id)));

create policy rights_read on public.asset_rights for select to authenticated using (private.can_read_asset(asset_id));
create policy rights_manage on public.asset_rights for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

create policy kits_read on public.kits for select to authenticated
  using (private.is_tenant_manager(tenant_id) or (published and private.is_tenant_member(tenant_id)));
create policy kits_manage on public.kits for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy kit_assets_read on public.kit_assets for select to authenticated
  using (exists (select 1 from public.kits k where k.id = kit_id));
create policy kit_assets_manage on public.kit_assets for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

create policy shares_read on public.asset_shares for select to authenticated
  using (private.is_tenant_manager(from_tenant_id) or private.is_tenant_manager(to_tenant_id));
create policy shares_manage on public.asset_shares for all to authenticated
  using (private.is_tenant_manager(from_tenant_id))
  with check (private.is_tenant_manager(from_tenant_id)
              and exists (select 1 from public.assets a where a.id = asset_id and a.tenant_id = from_tenant_id));

create policy uses_read on public.asset_uses for select to authenticated using (private.is_tenant_manager(tenant_id));
create policy uses_insert on public.asset_uses for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_tenant_member(tenant_id) and private.can_read_asset(asset_id));

-- Marcas com que o gestor pode compartilhar: as outras marcas em que ele também atua.
create or replace function public.share_targets(p_tenant uuid)
returns table (id uuid, name text) language sql stable security definer set search_path = '' as $$
  select t.id, t.name from public.tenants t
  where t.id <> p_tenant and private.is_tenant_manager(p_tenant) and private.is_tenant_manager(t.id)
  order by t.name;
$$;
revoke execute on function public.share_targets(uuid) from public, anon;
grant execute on function public.share_targets(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: bucket privado, pasta = tenant.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('assets', 'assets', false, 104857600)
on conflict (id) do nothing;

create policy assets_files_read on storage.objects for select to authenticated
  using (bucket_id = 'assets' and private.can_read_asset_file(name));
create policy assets_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and private.is_tenant_member(((storage.foldername(name))[1])::uuid));
create policy assets_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'assets' and private.is_tenant_manager(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Biblioteca de melhores práticas
-- ---------------------------------------------------------------------------
create table public.best_practices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  title text not null,
  summary text not null,
  why_it_worked text,
  how_to_replicate text,
  format public.item_format,
  tags text[] not null default '{}',
  region_id uuid references public.regions on delete set null,
  operation_id uuid,
  source_plan_item_id uuid references public.plan_items on delete set null,
  metrics jsonb not null default '{}'::jsonb,
  share_network boolean not null default false,
  published boolean not null default false,
  curated_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete set null (operation_id)
);
create index best_practices_tenant on public.best_practices (tenant_id, published, created_at desc);

alter table public.best_practices enable row level security;
create policy practices_read on public.best_practices for select to authenticated
  using (private.is_tenant_manager(tenant_id) or (published and private.is_tenant_member(tenant_id)));
create policy practices_manage on public.best_practices for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

create trigger best_practices_touch before update on public.best_practices
  for each row execute function private.touch_updated_at();

-- Rede NEST: cases publicados e compartilhados por outras marcas, anonimizados
-- (sem nome da marca, loja ou região). Só para quem atua em alguma marca.
create or replace function public.network_practices()
returns table (id uuid, title text, summary text, why_it_worked text, how_to_replicate text,
               format public.item_format, tags text[], metrics jsonb, segment text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select bp.id, bp.title, bp.summary, bp.why_it_worked, bp.how_to_replicate, bp.format, bp.tags,
         bp.metrics, t.segment, bp.created_at
  from public.best_practices bp join public.tenants t on t.id = bp.tenant_id
  where bp.published and bp.share_network
    and exists (select 1 from public.memberships m where m.user_id = (select auth.uid()))
  order by bp.created_at desc
  limit 200;
$$;
revoke execute on function public.network_practices() from public, anon;
grant execute on function public.network_practices() to authenticated;

-- Linha do tempo
create trigger assets_activity after insert or delete on public.assets
  for each row execute function private.log_activity();
create trigger kits_activity after insert or update or delete on public.kits
  for each row execute function private.log_activity();
create trigger best_practices_activity after insert or delete on public.best_practices
  for each row execute function private.log_activity();

-- A policy de leitura repete as regras em linha: em INSERT ... RETURNING a
-- função (que consulta assets) ainda não enxerga a linha nova.
create or replace function private.asset_shared_with_me(a uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.asset_shares s
                 where s.asset_id = a and private.is_tenant_manager(s.to_tenant_id)
                   and (s.expires_on is null or s.expires_on >= current_date));
$$;
grant execute on function private.asset_shared_with_me(uuid) to authenticated;

drop policy assets_read on public.assets;
create policy assets_read on public.assets for select to authenticated using (
  private.is_tenant_manager(tenant_id)
  or (not archived and private.is_tenant_member(tenant_id) and (
        (operation_id is null and official)
        or (operation_id is not null and private.can_access_operation(operation_id))
        or created_by = (select auth.uid())))
  or private.asset_shared_with_me(id)
);
