-- NEST — Bancada de parceiros (freelancers curados) e marketplace de briefs.
-- Parceiro não entra no tenant: enxerga só os briefs abertos/atribuídos a ele,
-- com um retrato da marca (brand_snapshot) gravado na publicação.

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  name text not null,
  email text not null,
  headline text,
  bio text,
  skills text[] not null default '{}',
  city text,
  state text,
  portfolio_url text check (portfolio_url is null or portfolio_url ~ '^https://'),
  hourly_rate numeric(10, 2) check (hourly_rate is null or hourly_rate >= 0),
  status text not null default 'candidato' check (status in ('candidato', 'verificado', 'suspenso')),
  created_at timestamptz not null default now()
);

create type public.brief_status as enum ('rascunho', 'aberto', 'atribuido', 'em_revisao', 'aprovado', 'pago', 'cancelado');

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  project_id uuid references public.projects on delete set null,
  task_id uuid references public.tasks on delete set null,
  title text not null,
  objective text,
  deliverables text,
  references_text text,
  avoid text,
  acceptance text,
  brand_snapshot text,
  budget numeric(12, 2) check (budget is null or budget >= 0),
  agreed_price numeric(12, 2) check (agreed_price is null or agreed_price >= 0),
  platform_fee_pct numeric(5, 2) not null default 15 check (platform_fee_pct between 0 and 60),
  due_on date,
  visibility text not null default 'bancada' check (visibility in ('convidados', 'bancada')),
  status public.brief_status not null default 'rascunho',
  partner_id uuid references public.partners on delete set null,
  delivery_url text check (delivery_url is null or delivery_url ~ '^https://'),
  delivery_notes text,
  delivered_at timestamptz,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index briefs_tenant on public.briefs (tenant_id, status);
create index briefs_open on public.briefs (status, visibility);

create table public.brief_invites (
  brief_id uuid not null references public.briefs on delete cascade,
  partner_id uuid not null references public.partners on delete cascade,
  created_at timestamptz not null default now(),
  primary key (brief_id, partner_id)
);

create table public.brief_proposals (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null references public.briefs on delete cascade,
  partner_id uuid not null references public.partners on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  message text,
  status text not null default 'enviada' check (status in ('enviada', 'aceita', 'recusada')),
  created_at timestamptz not null default now(),
  unique (brief_id, partner_id)
);

create table public.partner_reviews (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid not null unique references public.briefs on delete cascade,
  partner_id uuid not null references public.partners on delete cascade,
  tenant_id uuid not null references public.tenants on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.my_partner_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.partners p where p.user_id = (select auth.uid()) and p.status = 'verificado';
$$;

create or replace function private.is_any_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m where m.user_id = (select auth.uid()) and m.role in ('hub', 'marca')
  );
$$;

create or replace function private.brief_tenant(b uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select tenant_id from public.briefs where id = b;
$$;

create or replace function private.partner_can_see_brief(b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.briefs x
    where x.id = b and private.my_partner_id() is not null and (
      x.partner_id = private.my_partner_id()
      or (x.status = 'aberto' and (x.visibility = 'bancada'
          or exists (select 1 from public.brief_invites i where i.brief_id = x.id and i.partner_id = private.my_partner_id())))
    )
  );
$$;
grant execute on function private.my_partner_id(), private.is_any_manager(), private.brief_tenant(uuid), private.partner_can_see_brief(uuid) to authenticated;

-- Parceiro não muda o próprio status (curadoria é da NEST).
create or replace function private.guard_partner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin() then
    if tg_op = 'INSERT' and new.status <> 'candidato' then
      raise exception 'Cadastro de parceiro começa como candidato';
    end if;
    if tg_op = 'UPDATE' and (new.status is distinct from old.status or new.user_id is distinct from old.user_id or new.email is distinct from old.email) then
      raise exception 'Só a NEST altera status, e-mail ou vínculo do parceiro';
    end if;
  end if;
  return new;
end $$;
create trigger partners_guard before insert or update on public.partners
  for each row execute function private.guard_partner();

create trigger briefs_touch before update on public.briefs
  for each row execute function private.touch_updated_at();
create trigger briefs_activity after insert or update or delete on public.briefs
  for each row execute function private.log_activity();

revoke execute on function private.guard_partner() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.partners enable row level security;
alter table public.briefs enable row level security;
alter table public.brief_invites enable row level security;
alter table public.brief_proposals enable row level security;
alter table public.partner_reviews enable row level security;

create policy partners_read on public.partners for select to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin() or (status = 'verificado' and private.is_any_manager()));
create policy partners_self_insert on public.partners for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_platform_admin());
create policy partners_update on public.partners for update to authenticated
  using (user_id = (select auth.uid()) or private.is_platform_admin())
  with check (user_id = (select auth.uid()) or private.is_platform_admin());
create policy partners_delete on public.partners for delete to authenticated using (private.is_platform_admin());

create policy briefs_read on public.briefs for select to authenticated
  using (private.is_tenant_manager(tenant_id) or private.partner_can_see_brief(id));
create policy briefs_manage on public.briefs for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

create policy invites_read on public.brief_invites for select to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)) or partner_id = private.my_partner_id());
create policy invites_manage on public.brief_invites for all to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)))
  with check (private.is_tenant_manager(private.brief_tenant(brief_id)));

create policy proposals_read on public.brief_proposals for select to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)) or partner_id = private.my_partner_id());
create policy proposals_insert on public.brief_proposals for insert to authenticated
  with check (partner_id = private.my_partner_id() and status = 'enviada'
              and exists (select 1 from public.briefs b where b.id = brief_id and b.status = 'aberto')
              and private.partner_can_see_brief(brief_id));
create policy proposals_partner_update on public.brief_proposals for update to authenticated
  using (partner_id = private.my_partner_id() and status = 'enviada')
  with check (partner_id = private.my_partner_id() and status = 'enviada');
create policy proposals_manager_update on public.brief_proposals for update to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)))
  with check (private.is_tenant_manager(private.brief_tenant(brief_id)));

create policy reviews_read on public.partner_reviews for select to authenticated
  using (private.is_tenant_manager(tenant_id) or partner_id = private.my_partner_id() or private.is_platform_admin());
create policy reviews_manage on public.partner_reviews for all to authenticated
  using (private.is_tenant_manager(tenant_id))
  with check (private.is_tenant_manager(tenant_id)
              and exists (select 1 from public.briefs b where b.id = brief_id and b.tenant_id = partner_reviews.tenant_id
                          and b.partner_id = partner_reviews.partner_id and b.status in ('aprovado', 'pago')));

-- ---------------------------------------------------------------------------
-- RPCs do parceiro e diretório com reputação
-- ---------------------------------------------------------------------------
-- Entrega: só o parceiro atribuído, e só enquanto o trabalho está com ele.
create or replace function public.deliver_brief(p_brief uuid, p_url text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_url is null or p_url !~ '^https://' then
    raise exception 'Link de entrega precisa começar com https://';
  end if;
  update public.briefs set delivery_url = p_url, delivery_notes = p_notes, delivered_at = now(), status = 'em_revisao'
  where id = p_brief and partner_id = private.my_partner_id() and status in ('atribuido', 'em_revisao');
  if not found then
    raise exception 'Brief indisponível para entrega';
  end if;
end $$;
revoke execute on function public.deliver_brief(uuid, text, text) from public, anon;
grant execute on function public.deliver_brief(uuid, text, text) to authenticated;

-- Bancada vista por quem contrata: parceiros verificados com nota e trabalhos.
create or replace function public.partner_directory()
returns table (id uuid, name text, headline text, bio text, skills text[], city text, state text, portfolio_url text,
               hourly_rate numeric, rating numeric, reviews int, jobs int)
language sql stable security definer set search_path = '' as $$
  select p.id, p.name, p.headline, p.bio, p.skills, p.city, p.state, p.portfolio_url, p.hourly_rate,
         round(avg(r.rating)::numeric, 1), count(distinct r.id)::int,
         (select count(*) from public.briefs b where b.partner_id = p.id and b.status in ('aprovado', 'pago'))::int
  from public.partners p left join public.partner_reviews r on r.partner_id = p.id
  where p.status = 'verificado' and private.is_any_manager()
  group by p.id
  order by 10 desc nulls last, p.name;
$$;
revoke execute on function public.partner_directory() from public, anon;
grant execute on function public.partner_directory() to authenticated;
