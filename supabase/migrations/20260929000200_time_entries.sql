-- Horas da equipe Hub por tarefa/projeto. Só a equipe interna vê: base da
-- rentabilidade por cliente (horas × custo × fee).
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid references public.projects on delete set null,
  task_id uuid references public.tasks on delete set null,
  minutes int not null check (minutes > 0 and minutes <= 24 * 60),
  worked_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index time_entries_tenant on public.time_entries (tenant_id, worked_on);
create index time_entries_user on public.time_entries (user_id, worked_on);

alter table public.time_entries enable row level security;
create policy time_read on public.time_entries for select to authenticated
  using (private.is_hub(tenant_id));
create policy time_insert on public.time_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_hub(tenant_id));
create policy time_delete on public.time_entries for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin());
