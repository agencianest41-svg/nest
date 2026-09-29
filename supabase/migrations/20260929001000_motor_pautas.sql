-- NEST — Motor de pautas, fase 1: o "cérebro" da pauta.
-- Editorias por marca, volume por pacote e os campos que explicam cada pauta
-- (ideia, por quê, gancho, funil, kit e case de referência).

create type public.funnel_stage as enum ('descoberta', 'consideracao', 'conversao', 'relacionamento');

-- ---------------------------------------------------------------------------
-- Editorias (pilares de conteúdo estruturados)
-- ---------------------------------------------------------------------------
create table public.editorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  funnel public.funnel_stage,
  share int check (share between 0 and 100),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

alter table public.editorias enable row level security;
create policy editorias_read on public.editorias for select to authenticated using (private.is_tenant_member(tenant_id));
create policy editorias_manage on public.editorias for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------------
-- Volume por pacote: quantos posts e stories cada operação recebe no mês.
-- ---------------------------------------------------------------------------
create table public.tier_quotas (
  tenant_id uuid not null references public.tenants on delete cascade,
  tier public.service_tier not null,
  posts int not null default 0 check (posts between 0 and 200),
  stories int not null default 0 check (stories between 0 and 200),
  primary key (tenant_id, tier)
);

alter table public.tier_quotas enable row level security;
create policy quotas_read on public.tier_quotas for select to authenticated using (private.is_tenant_member(tenant_id));
create policy quotas_manage on public.tier_quotas for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

-- Padrão inspirado nos volumes da Hub (12+12 a 22+22); cada marca ajusta.
insert into public.tier_quotas (tenant_id, tier, posts, stories)
select t.id, q.tier, q.posts, q.stories
from public.tenants t
cross join (values
  ('essencial'::public.service_tier, 12, 12),
  ('acompanhamento', 16, 16),
  ('ativacao', 22, 22),
  ('inteligencia', 22, 22)
) as q (tier, posts, stories)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Pauta: campos do cérebro
-- ---------------------------------------------------------------------------
alter table public.best_practices add constraint best_practices_tenant_id_key unique (tenant_id, id);

alter table public.plan_items
  add column editoria_id uuid,
  add column funnel public.funnel_stage,
  add column idea text,
  add column rationale text,
  add column hook text,
  add column kit_id uuid,
  add column practice_id uuid,
  add column sensitive boolean not null default false,
  add column published_url text check (published_url is null or published_url ~ '^https://'),
  add column origin text not null default 'manual' check (origin in ('manual', 'ia', 'hub', 'base', 'banco')),
  add constraint plan_items_editoria_fk foreign key (tenant_id, editoria_id)
    references public.editorias (tenant_id, id) on delete set null (editoria_id),
  add constraint plan_items_kit_fk foreign key (tenant_id, kit_id)
    references public.kits (tenant_id, id) on delete set null (kit_id),
  add constraint plan_items_practice_fk foreign key (tenant_id, practice_id)
    references public.best_practices (tenant_id, id) on delete set null (practice_id);

create index plan_items_editoria on public.plan_items (tenant_id, editoria_id);
create index plan_items_kit on public.plan_items (tenant_id, kit_id);
create index plan_items_practice on public.plan_items (tenant_id, practice_id);
create index plan_items_schedule on public.plan_items (plan_id, scheduled_on);

-- O Guardião também lê a ideia e o gancho.
create or replace function private.guard_item_brand()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_term text;
begin
  if new.status in ('aprovacao', 'aprovado', 'publicado')
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.script is distinct from old.script or new.caption is distinct from old.caption
          or new.title is distinct from old.title or new.hook is distinct from old.hook) then
    select i.term into v_term
    from private.brand_issues(new.tenant_id, concat_ws(' ', new.title, new.hook, new.script, new.caption)) i
    where i.kind = 'termo_proibido' and i.severity = 'bloqueia'
    limit 1;
    if v_term is not null then
      raise exception 'Marca: a peça usa o termo proibido "%"', v_term;
    end if;
  end if;
  return new;
end $$;
revoke execute on function private.guard_item_brand() from public, anon, authenticated;

-- Origem: manual (loja digitou), ia (loja aceitou sugestão), hub (criada por
-- Hub/Marca), base (calendário-base da rede), banco (troca pelo banco de ideias).
-- O cérebro de pautas hub/base (por quê, editoria, funil) e a marca "sensível"
-- só mudam por Hub/Marca; o lojista cria a peça (roteiro, legenda, link).
create or replace function private.guard_item_brain()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_tenant_manager(new.tenant_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.sensitive or new.origin in ('hub', 'base') then
      raise exception 'Apenas Hub ou Marca definem pautas sensíveis ou da rede';
    end if;
  elsif new.sensitive is distinct from old.sensitive
     or new.origin is distinct from old.origin
     or (old.origin in ('hub', 'base') and (
          new.rationale is distinct from old.rationale
          or new.editoria_id is distinct from old.editoria_id
          or new.funnel is distinct from old.funnel)) then
    raise exception 'Apenas Hub ou Marca alteram o cérebro da pauta';
  end if;
  return new;
end $$;
revoke execute on function private.guard_item_brain() from public, anon, authenticated;

create trigger plan_items_brain_guard before insert or update on public.plan_items
  for each row execute function private.guard_item_brain();

create trigger editorias_activity after insert or delete on public.editorias
  for each row execute function private.log_activity();
