-- Perfis públicos (nome e e-mail) para mostrar responsáveis, autores e a linha
-- do tempo sem precisar da secret key. Só quem divide um tenant se enxerga.
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  updated_at timestamptz not null default now()
);

create or replace function private.sync_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email,
    full_name = coalesce(public.profiles.full_name, excluded.full_name), updated_at = now();
  return new;
end $$;
revoke execute on function private.sync_profile() from public, anon, authenticated;

create trigger on_auth_user_profile after insert or update of email on auth.users
  for each row execute function private.sync_profile();

insert into public.profiles (id, email, full_name)
select id, email, nullif(raw_user_meta_data ->> 'full_name', '') from auth.users
on conflict (id) do nothing;

create or replace function private.shares_tenant(u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select u = (select auth.uid()) or private.is_platform_admin() or exists (
    select 1 from public.memberships a join public.memberships b on a.tenant_id = b.tenant_id
    where a.user_id = (select auth.uid()) and b.user_id = u
  );
$$;
grant execute on function private.shares_tenant(uuid) to authenticated;

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (private.shares_tenant(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
