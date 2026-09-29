-- Voz de marca por tenant: o que o Estúdio (IA) usa para escrever roteiros e
-- legendas no tom de cada cliente. Dado de tenant, nunca prompt fixo no código.
create table public.brand_voices (
  tenant_id uuid primary key references public.tenants on delete cascade,
  essence text not null,
  tone text not null,
  vocabulary text,
  avoid text,
  audience text,
  updated_at timestamptz not null default now()
);

alter table public.brand_voices enable row level security;

create policy brand_voices_read on public.brand_voices for select to authenticated
  using (private.is_tenant_member(tenant_id));
create policy brand_voices_manage on public.brand_voices for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

insert into public.brand_voices (tenant_id, essence, tone, vocabulary, avoid, audience)
select id,
  'Perfumaria e cosméticos premium brasileiros, luxo acessível. Propósito: celebrar histórias através de experiências sensoriais que elevam os diferentes momentos da vida. Slogan: Qualidade, Autenticidade e Exuberância. Embalagem como objeto de decoração; parceria com casas de fragrâncias internacionais.',
  'Sensorial e aspiracional, com convite em vez de ordem. A fragrância como história e expressão pessoal. No comercial, direto e curto. Nas lojas, o calor e a proximidade do comércio local sem perder o padrão da marca.',
  'Verbos de convite: Descubra, Experimente, Conheça, Presentear-se. Termos: essência, assinatura olfativa, sofisticada, sensual, elegância, exuberância, encantar, momentos mágicos. Famílias olfativas: Floral, Chipre, Oriental, Floriental, Fougère, Amadeirado.',
  'Tom de panfleto ou liquidação agressiva; imperativos secos; promessas exageradas; gírias fortes; criar campanhas paralelas à nacional ou alterar a identidade da marca.',
  'Consumidora e consumidor de loja física e e-commerce, clientes de Grupos VIP no WhatsApp, revendedoras e consultoras.'
from public.tenants where slug = 'mahogany';
