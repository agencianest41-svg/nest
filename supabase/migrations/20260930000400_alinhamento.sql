-- NEST — Reunião mensal de alinhamento entre a loja e o consultor da NEST.
-- Ciclo do mês: a loja preenche o check-in (números do mês anterior + metas)
-- e só então escolhe um horário na agenda do seu consultor, do dia 1 ao 15.
-- Agendar e cancelar passam por funções: a regra fica no banco, não na tela.

create extension if not exists btree_gist with schema extensions;

-- Carteira: cada loja tem um consultor (pessoa Hub).
alter table public.operations add column consultant_id uuid references auth.users on delete set null;
create index operations_consultant on public.operations (consultant_id);

-- Preferências da agenda de cada consultor.
create table public.consultant_settings (
  user_id uuid primary key references auth.users on delete cascade,
  meeting_url text check (meeting_url is null or meeting_url ~ '^https://'),
  slot_minutes int not null default 45 check (slot_minutes between 15 and 180),
  notice_hours int not null default 24 check (notice_hours between 0 and 168),
  updated_at timestamptz not null default now()
);

-- Janelas semanais de atendimento (horário de Brasília). weekday: 0 = domingo.
create table public.consultant_availability (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references auth.users on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts time not null,
  ends time not null,
  created_at timestamptz not null default now(),
  check (ends > starts)
);
create index consultant_availability_consultant on public.consultant_availability (consultant_id, weekday);

-- Bloqueios pontuais (férias, feriado, compromisso).
create table public.consultant_blocks (
  id uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references auth.users on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index consultant_blocks_consultant on public.consultant_blocks (consultant_id, starts_at);

-- Check-in do ciclo. month = mês do ciclo (da reunião); os números são do mês anterior.
create table public.monthly_checkins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid not null,
  month date not null check (extract(day from month) = 1),
  revenue numeric(14, 2) not null default 0 check (revenue >= 0),
  orders int not null default 0 check (orders >= 0),
  followers int check (followers >= 0),
  leads int check (leads >= 0),
  whatsapp_chats int check (whatsapp_chats >= 0),
  revenue_goal numeric(14, 2) check (revenue_goal >= 0),
  biggest_challenge text,
  what_worked text,
  nest_score smallint check (nest_score between 0 and 10),
  submitted_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_id, month),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);
create index monthly_checkins_tenant on public.monthly_checkins (tenant_id, month);
create index monthly_checkins_submitted_by on public.monthly_checkins (submitted_by);

create type public.meeting_status as enum ('agendada', 'realizada', 'cancelada', 'faltou');

create table public.alignment_meetings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid not null,
  month date not null check (extract(day from month) = 1),
  consultant_id uuid not null references auth.users on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.meeting_status not null default 'agendada',
  meeting_url text,
  notes text,
  next_steps text,
  booked_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  -- Um consultor nunca tem duas reuniões ativas no mesmo horário.
  constraint alignment_meetings_no_overlap exclude using gist (
    consultant_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('agendada', 'realizada'))
);
-- Uma reunião ativa por loja por ciclo.
create unique index alignment_meetings_one_per_month on public.alignment_meetings (operation_id, month)
  where status <> 'cancelada';
create index alignment_meetings_tenant on public.alignment_meetings (tenant_id, month);
create index alignment_meetings_consultant on public.alignment_meetings (consultant_id, starts_at);
create index alignment_meetings_booked_by on public.alignment_meetings (booked_by);

create trigger consultant_settings_touch before update on public.consultant_settings
  for each row execute function private.touch_updated_at();
create trigger monthly_checkins_touch before update on public.monthly_checkins
  for each row execute function private.touch_updated_at();
create trigger alignment_meetings_touch before update on public.alignment_meetings
  for each row execute function private.touch_updated_at();

-- Check-in alimenta as vendas do mês anterior (sem sobrescrever integração).
alter table public.operation_sales drop constraint operation_sales_source_check;
alter table public.operation_sales add constraint operation_sales_source_check
  check (source in ('manual', 'importacao', 'integracao', 'checkin'));

create or replace function private.checkin_to_sales()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.operation_sales (tenant_id, operation_id, month, revenue, orders, source)
  values (new.tenant_id, new.operation_id, (new.month - interval '1 month')::date, new.revenue, new.orders, 'checkin')
  on conflict (operation_id, month) do update
    set revenue = excluded.revenue, orders = excluded.orders, source = 'checkin', updated_at = now()
    where public.operation_sales.source <> 'integracao';
  return new;
end $$;
revoke execute on function private.checkin_to_sales() from public, anon, authenticated;
create trigger monthly_checkins_sales after insert or update of revenue, orders on public.monthly_checkins
  for each row execute function private.checkin_to_sales();

-- Mês do ciclo e prazo, no fuso de Brasília.
create or replace function private.cycle_month()
returns date language sql stable set search_path = '' as $$
  select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
$$;
grant execute on function private.cycle_month() to authenticated;

-- RLS -------------------------------------------------------------------------
alter table public.consultant_settings enable row level security;
alter table public.consultant_availability enable row level security;
alter table public.consultant_blocks enable row level security;
alter table public.monthly_checkins enable row level security;
alter table public.alignment_meetings enable row level security;

-- Agenda: a equipe lê; cada consultor (ou o admin) edita a própria.
create policy csettings_read on public.consultant_settings for select to authenticated using (private.is_staff());
create policy csettings_insert on public.consultant_settings for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_platform_admin());
create policy csettings_update on public.consultant_settings for update to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin())
  with check (user_id = (select auth.uid()) or private.is_platform_admin());

create policy cavail_read on public.consultant_availability for select to authenticated using (private.is_staff());
create policy cavail_insert on public.consultant_availability for insert to authenticated
  with check ((consultant_id = (select auth.uid()) and private.is_staff()) or private.is_platform_admin());
create policy cavail_delete on public.consultant_availability for delete to authenticated
  using (consultant_id = (select auth.uid()) or private.is_platform_admin());

create policy cblocks_read on public.consultant_blocks for select to authenticated using (private.is_staff());
create policy cblocks_insert on public.consultant_blocks for insert to authenticated
  with check ((consultant_id = (select auth.uid()) and private.is_staff()) or private.is_platform_admin());
create policy cblocks_delete on public.consultant_blocks for delete to authenticated
  using (consultant_id = (select auth.uid()) or private.is_platform_admin());

-- Check-in: quem acessa a loja lê e preenche; o consultor da loja lê.
create policy checkins_read on public.monthly_checkins for select to authenticated
  using (private.is_tenant_manager(tenant_id) or private.can_access_operation(operation_id)
    or exists (select 1 from public.operations o where o.id = operation_id and o.consultant_id = (select auth.uid())));
create policy checkins_insert on public.monthly_checkins for insert to authenticated
  with check (private.is_tenant_manager(tenant_id) or private.can_access_operation(operation_id));
create policy checkins_update on public.monthly_checkins for update to authenticated
  using (private.is_tenant_manager(tenant_id) or private.can_access_operation(operation_id))
  with check (private.is_tenant_manager(tenant_id) or private.can_access_operation(operation_id));

-- Reuniões: criadas e canceladas pelas funções abaixo. Consultor e gestão
-- editam ata e status.
create policy meetings_read on public.alignment_meetings for select to authenticated
  using (consultant_id = (select auth.uid()) or private.is_tenant_manager(tenant_id) or private.can_access_operation(operation_id));
create policy meetings_update on public.alignment_meetings for update to authenticated
  using (consultant_id = (select auth.uid()) or private.is_tenant_manager(tenant_id))
  with check (consultant_id = (select auth.uid()) or private.is_tenant_manager(tenant_id));

-- Funções ---------------------------------------------------------------------

-- Horários livres do consultor da loja, de agora (+ antecedência) até o dia 15.
create or replace function public.available_slots(p_operation uuid)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with op as (
    select o.consultant_id from public.operations o
    where o.id = p_operation and o.consultant_id is not null and private.can_access_operation(o.id)
  ),
  cfg as (
    select op.consultant_id, coalesce(s.slot_minutes, 45) as slot, coalesce(s.notice_hours, 24) as notice
    from op left join public.consultant_settings s on s.user_id = op.consultant_id
  ),
  days as (
    select d::date as day
    from generate_series(private.cycle_month()::timestamp, (private.cycle_month() + 14)::timestamp, interval '1 day') d
  ),
  slots as (
    select ((dy.day + a.starts + make_interval(mins => g.m)) at time zone 'America/Sao_Paulo') as starts_at, c.slot, c.consultant_id, c.notice
    from cfg c
    join public.consultant_availability a on a.consultant_id = c.consultant_id
    join days dy on extract(dow from dy.day) = a.weekday
    cross join lateral generate_series(0, (extract(epoch from (a.ends - a.starts)) / 60)::int - c.slot, c.slot) as g(m)
  )
  select s.starts_at, s.starts_at + make_interval(mins => s.slot)
  from slots s
  where s.starts_at > now() + make_interval(hours => s.notice)
    and not exists (
      select 1 from public.alignment_meetings m
      where m.consultant_id = s.consultant_id and m.status in ('agendada', 'realizada')
        and tstzrange(m.starts_at, m.ends_at) && tstzrange(s.starts_at, s.starts_at + make_interval(mins => s.slot))
    )
    and not exists (
      select 1 from public.consultant_blocks b
      where b.consultant_id = s.consultant_id
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(s.starts_at, s.starts_at + make_interval(mins => s.slot))
    )
  order by 1;
$$;
revoke execute on function public.available_slots(uuid) from public, anon;
grant execute on function public.available_slots(uuid) to authenticated;

create or replace function public.book_meeting(p_operation uuid, p_starts_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_op public.operations;
  v_month date := private.cycle_month();
  v_ends timestamptz;
  v_url text;
  v_id uuid;
begin
  select * into v_op from public.operations where id = p_operation;
  if v_op.id is null or not private.can_access_operation(p_operation) then
    raise exception 'Loja não encontrada' using errcode = '42501';
  end if;
  if v_op.consultant_id is null then
    raise exception 'sem_consultor';
  end if;
  if not exists (select 1 from public.monthly_checkins c where c.operation_id = p_operation and c.month = v_month) then
    raise exception 'sem_checkin';
  end if;
  if exists (select 1 from public.alignment_meetings m where m.operation_id = p_operation and m.month = v_month and m.status <> 'cancelada') then
    raise exception 'ja_agendada';
  end if;
  select s.ends_at into v_ends from public.available_slots(p_operation) s where s.starts_at = p_starts_at;
  if v_ends is null then
    raise exception 'horario_indisponivel';
  end if;
  select meeting_url into v_url from public.consultant_settings where user_id = v_op.consultant_id;

  insert into public.alignment_meetings (tenant_id, operation_id, month, consultant_id, starts_at, ends_at, meeting_url, booked_by)
  values (v_op.tenant_id, p_operation, v_month, v_op.consultant_id, p_starts_at, v_ends, v_url, (select auth.uid()))
  returning id into v_id;
  return v_id;
exception when exclusion_violation or unique_violation then
  raise exception 'horario_indisponivel';
end $$;
revoke execute on function public.book_meeting(uuid, timestamptz) from public, anon;
grant execute on function public.book_meeting(uuid, timestamptz) to authenticated;

-- Cancela (ou libera para remarcar) uma reunião futura.
create or replace function public.cancel_meeting(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.alignment_meetings;
begin
  select * into v_m from public.alignment_meetings where id = p_id;
  if v_m.id is null or not (
    v_m.consultant_id = (select auth.uid()) or private.is_tenant_manager(v_m.tenant_id) or private.can_access_operation(v_m.operation_id)
  ) then
    raise exception 'Reunião não encontrada' using errcode = '42501';
  end if;
  if v_m.status <> 'agendada' or v_m.starts_at <= now() then
    raise exception 'nao_cancelavel';
  end if;
  update public.alignment_meetings set status = 'cancelada' where id = p_id;
end $$;
revoke execute on function public.cancel_meeting(uuid) from public, anon;
grant execute on function public.cancel_meeting(uuid) to authenticated;
