-- Seed do tenant piloto: Mahogany.
-- Operações = perfis mapeados no estudo "Last Mile Mahogany" (slide 08).

with t as (
  insert into public.tenants (slug, name) values ('mahogany', 'Mahogany') returning id
)
insert into public.tenant_themes (
  tenant_id, brand, brand_hover, brand_soft, on_brand, accent, accent_ink,
  brand_dark, brand_hover_dark, brand_soft_dark, on_brand_dark, accent_ink_dark
)
select id, '#551525', '#3F0F1B', '#F5EBED', '#FFFFFF', '#C9A563', '#6B5A2E',
           '#D68297', '#E4A2B3', '#35171F', '#1A0A0F', '#DCC189'
from t;

insert into public.regions (tenant_id, code, name)
select t.id, r.code, r.name
from public.tenants t,
  (values ('NE', 'Nordeste'), ('SE', 'Sudeste'), ('N', 'Norte'), ('S', 'Sul')) as r(code, name)
where t.slug = 'mahogany';

insert into public.operations (tenant_id, region_id, name, city, state, instagram, kind)
select t.id, reg.id, o.name, o.city, o.state, o.instagram, o.kind::public.operation_kind
from public.tenants t
join public.regions reg on reg.tenant_id = t.id
join (values
  ('NE', 'Mahogany Paraíba',            'João Pessoa',     'PB', '@mahogany_pb',               'grupo'),
  ('NE', 'Revenda Mahogany Paraíba',    'João Pessoa',     'PB', '@revendamahogany_pb',        'revenda'),
  ('NE', 'Mahogany Fortaleza',          'Fortaleza',       'CE', '@mahoganyfortaleza',         'loja'),
  ('NE', 'Mahogany Parangaba',          'Fortaleza',       'CE', '@mahoganyparangaba',         'loja'),
  ('NE', 'Mahogany Salvador',           'Salvador',        'BA', '@mahogany.salvador',         'loja'),
  ('NE', 'Mahogany Feira de Santana',   'Feira de Santana','BA', '@mahoganyfeiradesantana',    'loja'),
  ('NE', 'Mahogany Recife',             'Recife',          'PE', '@mahogany_recife',           'loja'),
  ('NE', 'Mahogany Natal',              'Natal',           'RN', '@mahoganynatal',             'loja'),
  ('SE', 'Mahogany Center Norte',       'São Paulo',       'SP', '@mahoganycenternorte',       'loja'),
  ('SE', 'Mahogany Dom Pedro',          'Campinas',        'SP', '@mahoganydompedro',          'loja'),
  ('SE', 'Mahogany Praiamar',           'Santos',          'SP', '@mahogany.praiamar',         'loja'),
  ('SE', 'Mahogany Rio de Janeiro',     'Rio de Janeiro',  'RJ', '@mahogany_rj',               'grupo'),
  ('SE', 'Mahogany Belo Horizonte',     'Belo Horizonte',  'MG', '@mahoganybh',                'loja'),
  ('N',  'Mahogany Belém',              'Belém',           'PA', '@mahoganybelem',             'loja'),
  ('N',  'Mahogany Maranhão',           'São Luís',        'MA', '@mahoganymaranhao',          'loja'),
  ('N',  'Mahogany Manaus',             'Manaus',          'AM', '@mahogany_manaus',           'loja'),
  ('S',  'Mahogany Shopping Curitiba',  'Curitiba',        'PR', '@mahoganyshopcuritiba',      'loja'),
  ('S',  'Mahogany Iguatemi POA',       'Porto Alegre',    'RS', '@mahoganypoaiguatemi',       'loja'),
  ('S',  'Mahogany Praia de Belas',     'Porto Alegre',    'RS', '@mahoganypraiadebelas',      'loja'),
  ('S',  'Mahogany BarraShoppingSul',   'Porto Alegre',    'RS', '@mahoganybarrashoppingsul',  'loja')
) as o(region_code, name, city, state, instagram, kind) on o.region_code = reg.code
where t.slug = 'mahogany';

-- Calendário do último trimestre de 2026 (nacional + regional + um exemplo local).
insert into public.calendar_events (tenant_id, scope, kind, region_id, operation_id, title, notes, starts_on, ends_on)
select t.id, e.scope::public.event_scope, e.kind::public.event_kind,
       (select id from public.regions where tenant_id = t.id and code = e.region_code),
       (select id from public.operations where tenant_id = t.id and instagram = e.instagram),
       e.title, e.notes, e.starts_on::date, e.ends_on::date
from public.tenants t,
  (values
    ('nacional', 'campanha',       null, null, 'Outubro Rosa',                 'Autocuidado e rituais; tom acolhedor.',                     '2026-10-01', '2026-10-31'),
    ('nacional', 'data_comercial', null, null, 'Dia das Crianças',             'Kits presenteáveis e linha infantil.',                      '2026-10-12', '2026-10-12'),
    ('nacional', 'data_comercial', null, null, 'Black Friday',                 'Campanha nacional; loja adapta vitrine e grupos VIP.',      '2026-11-23', '2026-11-30'),
    ('nacional', 'campanha',       null, null, 'Natal — Guia de presentes',    'Guia de presentes Mahogany para cada ocasião.',             '2026-12-01', '2026-12-24'),
    ('regional', 'clima',          'NE', null, 'Verão: frescor e body splash', 'Conteúdo por clima: frescor no Nordeste.',                  '2026-11-01', '2026-12-31'),
    ('regional', 'clima',          'S',  null, 'Primavera: hidratação',        'Conteúdo por clima: hidratação no Sul.',                    '2026-10-01', '2026-11-30'),
    ('local',    'data_local',     null, '@mahoganybelem', 'Círio de Nazaré',  'Maior evento da cidade; ação de loja e conteúdo local.',   '2026-10-11', '2026-10-11')
  ) as e(scope, kind, region_code, instagram, title, notes, starts_on, ends_on)
where t.slug = 'mahogany';

-- Editorias iniciais (sugestão; a marca ajusta em Marca › Editorias).
insert into public.editorias (tenant_id, name, description, funnel, share, position)
select t.id, e.name, e.description, e.funnel::public.funnel_stage, e.share, e.position
from public.tenants t cross join (values
 ('Ritual & autocuidado', 'Rotinas de cuidado, sensorialidade e bem-estar com os produtos da marca.', 'descoberta', 25, 1),
 ('Fragrância em foco', 'Uma fragrância ou linha por vez: notas, ocasião, como usar e fixar.', 'consideracao', 25, 2),
 ('Presente & datas', 'Datas comerciais e campanhas: sugestões de presente, kits e convite para a loja.', 'conversao', 20, 3),
 ('Bastidores da loja', 'A equipe, o atendimento, novidades que chegaram e o dia a dia da loja.', 'relacionamento', 15, 4),
 ('Clientes & comunidade', 'Depoimentos, clientes fiéis, eventos e a vida da cidade.', 'relacionamento', 15, 5)
) as e (name, description, funnel, share, position)
where t.slug = 'mahogany'
on conflict do nothing;
