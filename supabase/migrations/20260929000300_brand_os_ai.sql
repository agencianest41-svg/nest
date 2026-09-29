-- NEST — Brand OS (marca em detalhe) + guardião de marca + camada de IA
-- pronta para ligar (configuração por tenant, prompts versionados, uso e custo).

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Brand OS
-- ---------------------------------------------------------------------------
alter table public.brand_voices
  add column if not exists tagline text,
  add column if not exists brand_values text,
  add column if not exists content_pillars text;

create type public.rule_kind as enum ('termo_proibido', 'termo_obrigatorio', 'regulatorio', 'estilo');
create type public.rule_severity as enum ('bloqueia', 'alerta');

create table public.brand_personas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  name text not null,
  description text,
  goals text,
  pains text,
  channels text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.brand_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  name text not null,
  category text,
  description text,
  highlights text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- termo_proibido/obrigatorio usam "term"; regulatorio/estilo são orientações.
create table public.brand_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  kind public.rule_kind not null,
  term text,
  guidance text not null,
  severity public.rule_severity not null default 'alerta',
  created_at timestamptz not null default now(),
  check (kind not in ('termo_proibido', 'termo_obrigatorio') or length(trim(term)) > 0)
);

create table public.brand_examples (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  verdict text not null check (verdict in ('aprovado', 'reprovado')),
  format public.item_format,
  content text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index brand_personas_tenant on public.brand_personas (tenant_id);
create index brand_products_tenant on public.brand_products (tenant_id);
create index brand_rules_tenant on public.brand_rules (tenant_id);
create index brand_examples_tenant on public.brand_examples (tenant_id);

alter table public.brand_personas enable row level security;
alter table public.brand_products enable row level security;
alter table public.brand_rules enable row level security;
alter table public.brand_examples enable row level security;

create policy personas_read on public.brand_personas for select to authenticated using (private.is_tenant_member(tenant_id));
create policy personas_manage on public.brand_personas for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy products_read on public.brand_products for select to authenticated using (private.is_tenant_member(tenant_id));
create policy products_manage on public.brand_products for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy rules_read on public.brand_rules for select to authenticated using (private.is_tenant_member(tenant_id));
create policy rules_manage on public.brand_rules for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy examples_read on public.brand_examples for select to authenticated using (private.is_tenant_member(tenant_id));
create policy examples_manage on public.brand_examples for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

-- A marca (central) passa a editar a própria identidade visual.
create policy themes_manage on public.tenant_themes for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

-- Linha do tempo registra mudanças de marca.
create trigger brand_voices_activity after insert or update on public.brand_voices
  for each row execute function private.log_activity();
create trigger tenant_themes_activity after update on public.tenant_themes
  for each row execute function private.log_activity();
create trigger brand_rules_activity after insert or delete on public.brand_rules
  for each row execute function private.log_activity();

-- ---------------------------------------------------------------------------
-- Guardião de marca: termos proibidos/obrigatórios, sem acento e sem caixa.
-- ---------------------------------------------------------------------------
create or replace function private.normalize(t text)
returns text language sql immutable set search_path = '' as $$
  select lower(extensions.unaccent(coalesce(t, '')));
$$;

create or replace function private.brand_issues(p_tenant uuid, p_text text)
returns table (kind public.rule_kind, term text, severity public.rule_severity, guidance text)
language sql stable security definer set search_path = '' as $$
  select r.kind, r.term, r.severity, r.guidance
  from public.brand_rules r
  where r.tenant_id = p_tenant and (
    (r.kind = 'termo_proibido' and private.normalize(p_text) ~ ('(^|[^[:alnum:]])' || regexp_replace(private.normalize(r.term), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '($|[^[:alnum:]])'))
    or (r.kind = 'termo_obrigatorio' and position(private.normalize(r.term) in private.normalize(p_text)) = 0)
  );
$$;

-- Para a interface: só quem é do tenant consulta.
create or replace function public.check_brand(p_tenant uuid, p_text text)
returns table (kind public.rule_kind, term text, severity public.rule_severity, guidance text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_tenant_member(p_tenant) then
    raise exception 'sem acesso';
  end if;
  return query select * from private.brand_issues(p_tenant, p_text);
end $$;
revoke execute on function public.check_brand(uuid, text) from public, anon;
grant execute on function public.check_brand(uuid, text) to authenticated;

-- Peça com termo proibido "bloqueia" não segue para aprovação/publicação.
create or replace function private.guard_item_brand()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_term text;
begin
  if new.status in ('aprovacao', 'aprovado', 'publicado')
     and (tg_op = 'INSERT' or new.status is distinct from old.status
          or new.script is distinct from old.script or new.caption is distinct from old.caption or new.title is distinct from old.title) then
    select i.term into v_term
    from private.brand_issues(new.tenant_id, concat_ws(' ', new.title, new.script, new.caption)) i
    where i.kind = 'termo_proibido' and i.severity = 'bloqueia'
    limit 1;
    if v_term is not null then
      raise exception 'Marca: a peça usa o termo proibido "%"', v_term;
    end if;
  end if;
  return new;
end $$;

create trigger plan_items_brand_guard before insert or update on public.plan_items
  for each row execute function private.guard_item_brand();

revoke execute on function private.guard_item_brand(), private.brand_issues(uuid, text), private.normalize(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- IA: desligada por padrão; liga por tenant e por função.
-- ---------------------------------------------------------------------------
create table public.ai_settings (
  tenant_id uuid primary key references public.tenants on delete cascade,
  enabled boolean not null default false,
  features text[] not null default '{estudio.sugerir,estudio.escrever,marca.checar,relatorio.resumo,resultado.insights,biblioteca.case,brief.gerar}',
  monthly_budget_usd numeric(10, 2) not null default 50 check (monthly_budget_usd >= 0),
  model text,
  updated_at timestamptz not null default now()
);

-- Prompts versionados: tenant_id nulo = padrão do produto. Vale o ativo mais recente.
create table public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  key text not null,
  instructions text not null,
  model text,
  version int not null default 1,
  active boolean not null default true,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index ai_prompts_key on public.ai_prompts (key, tenant_id, version desc);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants on delete cascade,
  user_id uuid default auth.uid() references auth.users on delete set null,
  feature text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index ai_usage_tenant on public.ai_usage (tenant_id, created_at desc);

alter table public.ai_settings enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.ai_usage enable row level security;

create policy ai_settings_read on public.ai_settings for select to authenticated using (private.is_tenant_member(tenant_id));
create policy ai_settings_manage on public.ai_settings for all to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));

create policy ai_prompts_read on public.ai_prompts for select to authenticated
  using (tenant_id is null or private.is_tenant_member(tenant_id));
create policy ai_prompts_manage on public.ai_prompts for all to authenticated
  using ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_hub(tenant_id)))
  with check ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_hub(tenant_id)));

create policy ai_usage_read on public.ai_usage for select to authenticated using (private.is_hub(tenant_id));
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_tenant_member(tenant_id));

-- Orçamento do mês: qualquer membro precisa saber se pode usar, sem ver o detalhe do uso.
create or replace function public.ai_budget(p_tenant uuid)
returns table (enabled boolean, features text[], budget_usd numeric, spent_usd numeric, model text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_tenant_member(p_tenant) then
    raise exception 'sem acesso';
  end if;
  return query
  select coalesce(s.enabled, false), coalesce(s.features, '{}'::text[]), coalesce(s.monthly_budget_usd, 0),
         coalesce((select sum(u.cost_usd) from public.ai_usage u
                   where u.tenant_id = p_tenant and u.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0),
         s.model
  from (select 1) x left join public.ai_settings s on s.tenant_id = p_tenant;
end $$;
revoke execute on function public.ai_budget(uuid) from public, anon;
grant execute on function public.ai_budget(uuid) to authenticated;

create trigger ai_settings_touch before update on public.ai_settings
  for each row execute function private.touch_updated_at();

-- Mahogany: IA liga quando a chave existir; regras de exemplo do manual.
insert into public.ai_settings (tenant_id, enabled) select id, true from public.tenants where slug = 'mahogany';

insert into public.brand_rules (tenant_id, kind, term, guidance, severity)
select t.id, r.kind::public.rule_kind, r.term, r.guidance, r.severity::public.rule_severity
from public.tenants t, (values
  ('termo_proibido', 'queima de estoque', 'Tom de liquidação agressiva não combina com luxo acessível.', 'bloqueia'),
  ('termo_proibido', 'liquidação', 'Prefira "condição especial" ou "presente perfeito".', 'alerta'),
  ('termo_proibido', 'imperdível', 'Evite apelos exagerados; convide em vez de pressionar.', 'alerta'),
  ('regulatorio', null, 'Cosméticos: não prometer efeito terapêutico ou resultado garantido (ANVISA).', 'alerta'),
  ('estilo', null, 'Verbos de convite (Descubra, Experimente, Conheça) em vez de imperativos secos.', 'alerta')
) as r(kind, term, guidance, severity)
where t.slug = 'mahogany';

insert into public.brand_personas (tenant_id, name, description, goals, pains, channels, position)
select t.id, p.name, p.description, p.goals, p.pains, p.channels, p.position
from public.tenants t, (values
  ('Presenteadora', 'Compra para presentear em datas comerciais; valoriza embalagem e sugestão pronta.', 'Acertar o presente sem esforço.', 'Não saber a fragrância certa para cada pessoa.', 'Instagram, WhatsApp, loja física', 1),
  ('Colecionadora de fragrâncias', 'Conhece famílias olfativas, acompanha lançamentos e quer exclusividade.', 'Descobrir a próxima assinatura olfativa.', 'Lançamentos genéricos, pouca informação técnica.', 'Instagram, Grupo VIP', 2),
  ('Revendedora', 'Vende para a própria rede e precisa de material pronto para compartilhar.', 'Vender mais com pouco tempo de produção.', 'Material difícil de adaptar, sem texto pronto.', 'WhatsApp, Stories', 3)
) as p(name, description, goals, pains, channels, position)
where t.slug = 'mahogany';
