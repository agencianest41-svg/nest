-- NEST — Postagem e impulsionamento (etapas 5 e 6 do ciclo), dentro da peça.
-- A loja pede "a NEST posta por mim" (peça aprovada) ou "impulsionar" (peça
-- publicada); a Hub executa. Quem executa depende do modo da marca:
--   manual → a Hub faz no Meta Business Suite e registra aqui;
--   teste  → simulação completa, sem contas reais (para testar o fluxo);
--   meta   → API da Meta (quando a conta oficial for conectada).

create type public.piece_service_kind as enum ('agendar', 'impulsionar');
-- agendar:     solicitado → agendado → concluido (publicado)
-- impulsionar: solicitado → no_ar → concluido
create type public.piece_service_status as enum ('solicitado', 'agendado', 'no_ar', 'concluido', 'cancelado', 'erro');

create table public.piece_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid not null,
  plan_item_id uuid not null references public.plan_items on delete cascade,
  kind public.piece_service_kind not null,
  status public.piece_service_status not null default 'solicitado',
  provider text not null default 'manual' check (provider in ('manual', 'teste', 'meta')),
  title text,
  -- agendar
  scheduled_at timestamptz,
  placement text check (placement in ('feed', 'reels', 'stories')),
  caption text,
  -- impulsionar
  budget numeric(10, 2) check (budget is null or budget between 5 and 50000),
  days int check (days is null or days between 1 and 30),
  objective text check (objective in ('alcance', 'perfil', 'mensagens', 'visitas_loja')),
  audience text,
  -- execução
  external_id text,
  published_url text check (published_url is null or published_url ~ '^https://'),
  metrics jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ends_at timestamptz,
  notes text,
  error text,
  requested_by uuid default auth.uid() references auth.users on delete set null,
  handled_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  check (kind <> 'agendar' or (scheduled_at is not null and placement is not null)),
  check (kind <> 'impulsionar' or (budget is not null and days is not null and objective is not null))
);
create index piece_services_queue on public.piece_services (tenant_id, status, created_at);
create index piece_services_item on public.piece_services (plan_item_id);
create index piece_services_op on public.piece_services (tenant_id, operation_id);
create index piece_services_requested_by on public.piece_services (requested_by);
create index piece_services_handled_by on public.piece_services (handled_by);
-- Um pedido ativo de cada tipo por peça.
create unique index piece_services_one_active on public.piece_services (plan_item_id, kind)
  where status in ('solicitado', 'agendado', 'no_ar');

-- Modo de publicação da marca, legível por qualquer membro (a loja não lê a
-- tabela de integrações da marca).
create or replace function public.publishing_mode(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not private.is_tenant_member(p_tenant) then null
    when i.status = 'conectado' then 'meta'
    when coalesce((i.config ->> 'test_mode')::boolean, false) then 'teste'
    else 'manual'
  end
  from (select 1) x
  left join public.integrations i
    on i.tenant_id = p_tenant and i.provider = 'meta' and i.operation_id is null;
$$;
revoke execute on function public.publishing_mode(uuid) from public, anon;
grant execute on function public.publishing_mode(uuid) to authenticated;

-- Regras do pedido: peça certa na etapa certa; a loja só pede e cancela.
create or replace function private.guard_piece_service()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_manager boolean := (select auth.uid()) is null or private.is_tenant_manager(new.tenant_id);
begin
  if tg_op = 'INSERT' then
    select i.tenant_id, i.status, i.title, p.operation_id into v_item
    from public.plan_items i join public.monthly_plans p on p.id = i.plan_id
    where i.id = new.plan_item_id;
    if v_item is null or v_item.tenant_id <> new.tenant_id or v_item.operation_id <> new.operation_id then
      raise exception 'Pedido: peça não encontrada nesta loja';
    end if;
    if new.kind = 'agendar' and v_item.status <> 'aprovado' then
      raise exception 'Pedido: só peças aprovadas podem ser agendadas';
    end if;
    if new.kind = 'impulsionar' and v_item.status <> 'publicado' then
      raise exception 'Pedido: só peças publicadas podem ser impulsionadas';
    end if;
    new.title := v_item.title;
    new.provider := coalesce(public.publishing_mode(new.tenant_id), 'manual');
    if not v_manager and (new.status <> 'solicitado' or new.external_id is not null or new.published_url is not null
                          or new.metrics <> '{}'::jsonb or new.handled_by is not null) then
      raise exception 'Pedido: a loja só cria pedidos novos';
    end if;
    return new;
  end if;

  if not v_manager then
    if not (old.status = 'solicitado' and new.status = 'cancelado'
            and (to_jsonb(new) - array['status', 'updated_at']) = (to_jsonb(old) - array['status', 'updated_at'])) then
      raise exception 'Pedido: a loja só pode cancelar enquanto está solicitado';
    end if;
  elsif new.provider is distinct from old.provider or new.plan_item_id is distinct from old.plan_item_id
        or new.operation_id is distinct from old.operation_id or new.kind is distinct from old.kind then
    raise exception 'Pedido: tipo, peça e modo não mudam depois de criado';
  end if;
  return new;
end $$;
revoke execute on function private.guard_piece_service() from public, anon, authenticated;

create trigger piece_services_guard before insert or update on public.piece_services
  for each row execute function private.guard_piece_service();
create trigger piece_services_touch before update on public.piece_services
  for each row execute function private.touch_updated_at();
create trigger piece_services_activity after insert or update on public.piece_services
  for each row execute function private.log_activity();

alter table public.piece_services enable row level security;
create policy piece_services_read on public.piece_services for select to authenticated
  using (private.can_access_operation(operation_id));
create policy piece_services_insert on public.piece_services for insert to authenticated
  with check (private.can_access_operation(operation_id));
create policy piece_services_update on public.piece_services for update to authenticated
  using (private.can_access_operation(operation_id)) with check (private.can_access_operation(operation_id));
