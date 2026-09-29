-- Funções de acesso saem do schema public (exposto pela API REST) para o
-- schema private. As policies apontam para a função, não para o nome, e
-- continuam valendo; os corpos são recriados porque citam public.*.

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_platform_admin() set schema private;
alter function public.is_tenant_member(uuid) set schema private;
alter function public.is_tenant_manager(uuid) set schema private;
alter function public.can_access_region(uuid) set schema private;
alter function public.can_access_operation(uuid) set schema private;
alter function public.guard_item_approval() set schema private;
alter function public.touch_updated_at() set schema private;

create or replace function private.is_tenant_member(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_tenant_manager(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role in ('hub', 'marca')
  );
$$;

create or replace function private.can_access_region(r uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.regions reg
    where reg.id = r and (
      private.is_tenant_manager(reg.tenant_id) or exists (
        select 1 from public.memberships m
        where m.tenant_id = reg.tenant_id and m.user_id = (select auth.uid())
          and m.role = 'regional' and m.region_id = reg.id
      )
    )
  );
$$;

create or replace function private.can_access_operation(o uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.operations op
    where op.id = o and (
      private.is_tenant_manager(op.tenant_id) or exists (
        select 1 from public.memberships m
        where m.tenant_id = op.tenant_id and m.user_id = (select auth.uid())
          and ((m.role = 'regional' and m.region_id = op.region_id)
            or (m.role = 'lojista' and m.operation_id = op.id))
      )
    )
  );
$$;

create or replace function private.guard_item_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_tenant_manager(new.tenant_id) then
    return new;
  end if;
  if new.status = 'aprovado' and (tg_op = 'INSERT' or old.status <> 'aprovado') then
    raise exception 'Apenas Hub ou Marca podem aprovar peças';
  end if;
  if new.status = 'publicado' and (tg_op = 'INSERT' or old.status not in ('aprovado', 'publicado')) then
    raise exception 'A peça precisa estar aprovada antes de ser publicada';
  end if;
  return new;
end $$;

revoke execute on function private.guard_item_approval(), private.touch_updated_at() from public, anon, authenticated;
