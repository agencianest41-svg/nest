-- NEST — Conexão com a Meta (Instagram + Facebook) pelo Login do Facebook.
-- public.integrations continua só com metadados: a linha da marca (operation_id
-- nulo) guarda quem conectou e as contas do Instagram liberadas; cada loja
-- ligada a uma conta ganha a própria linha (operation_id preenchido).
-- Os tokens ficam cifrados no servidor (AES-GCM) numa tabela fora da API,
-- lida e gravada só pela secret key, por estas funções.

create table private.integration_secrets (
  integration_id uuid primary key references public.integrations on delete cascade,
  sealed text not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table private.integration_secrets enable row level security;
revoke all on private.integration_secrets from public, anon, authenticated;

create or replace function public.integration_secret_put(p_integration uuid, p_sealed text, p_expires timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.integration_secrets (integration_id, sealed, expires_at)
  values (p_integration, p_sealed, p_expires)
  on conflict (integration_id) do update
    set sealed = excluded.sealed, expires_at = excluded.expires_at, updated_at = now();
$$;

create or replace function public.integration_secret_get(p_integration uuid)
returns text language sql stable security definer set search_path = '' as $$
  select s.sealed from private.integration_secrets s where s.integration_id = p_integration;
$$;

create or replace function public.integration_secret_delete(p_integration uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.integration_secrets where integration_id = p_integration;
$$;

revoke execute on function public.integration_secret_put(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.integration_secret_get(uuid) from public, anon, authenticated;
revoke execute on function public.integration_secret_delete(uuid) from public, anon, authenticated;
grant execute on function public.integration_secret_put(uuid, text, timestamptz) to service_role;
grant execute on function public.integration_secret_get(uuid) to service_role;
grant execute on function public.integration_secret_delete(uuid) to service_role;

-- Conectar a conta não liga a postagem pela API sozinho: o modo "meta" só
-- entra quando a publicação automática estiver pronta e ligada (config.publishing).
create or replace function public.publishing_mode(p_tenant uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not private.is_tenant_member(p_tenant) then null
    when i.status = 'conectado' and coalesce((i.config ->> 'publishing')::boolean, false) then 'meta'
    when coalesce((i.config ->> 'test_mode')::boolean, false) then 'teste'
    else 'manual'
  end
  from (select 1) x
  left join public.integrations i
    on i.tenant_id = p_tenant and i.provider = 'meta' and i.operation_id is null;
$$;
