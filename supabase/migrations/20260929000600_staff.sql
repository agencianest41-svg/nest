-- NEST — equipe interna: custo/hora e capacidade semanal de cada pessoa da Hub,
-- base da carga de trabalho e da rentabilidade por cliente. Dado sensível:
-- só o admin NEST edita; colegas Hub leem para calcular margem.
create table public.staff_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  hourly_cost numeric(10, 2) not null default 0 check (hourly_cost >= 0),
  weekly_capacity_hours numeric(5, 1) not null default 40 check (weekly_capacity_hours between 0 and 80),
  role_title text,
  updated_at timestamptz not null default now()
);

-- Quem é Hub em alguma marca (ou admin) vê a equipe interna.
create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.role = 'hub'
  );
$$;
grant execute on function private.is_staff() to authenticated;

alter table public.staff_profiles enable row level security;
create policy staff_read on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());
create policy staff_admin on public.staff_profiles for all to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());

create trigger staff_profiles_touch before update on public.staff_profiles
  for each row execute function private.touch_updated_at();

-- Equipe Hub com nome (para a mesa e a carteira): pessoas com papel hub em
-- qualquer tenant, mais os admins.
create or replace function public.staff_directory()
returns table (user_id uuid, email text, full_name text, tenants int, hourly_cost numeric, weekly_capacity_hours numeric, role_title text)
language sql stable security definer set search_path = '' as $$
  with people as (
    select m.user_id, count(distinct m.tenant_id)::int as tenants from public.memberships m where m.role = 'hub' group by m.user_id
    union
    select a.user_id, 0 from public.platform_admins a
      where not exists (select 1 from public.memberships m where m.user_id = a.user_id and m.role = 'hub')
  )
  select p.user_id, pr.email, pr.full_name, p.tenants, coalesce(s.hourly_cost, 0), coalesce(s.weekly_capacity_hours, 40), s.role_title
  from people p
  left join public.profiles pr on pr.id = p.user_id
  left join public.staff_profiles s on s.user_id = p.user_id
  where private.is_staff()
  order by coalesce(pr.full_name, pr.email);
$$;
revoke execute on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;
