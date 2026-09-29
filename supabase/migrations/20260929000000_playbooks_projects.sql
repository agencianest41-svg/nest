-- NEST — motor de processos (playbooks), projetos, tarefas, linha do tempo,
-- comentários e contrato vivo (escopo contratado × entregue).
-- Playbook sem tenant é modelo do produto (método Hub); com tenant, é do cliente.

create type public.project_status as enum ('planejado', 'em_andamento', 'pausado', 'concluido', 'cancelado');
create type public.task_status as enum ('a_fazer', 'fazendo', 'em_aprovacao', 'concluida', 'bloqueada');

-- ---------------------------------------------------------------------------
-- Helpers de acesso
-- ---------------------------------------------------------------------------
-- Equipe interna (Hub) do tenant: vê o que é interno (tarefas internas, horas, custos).
create or replace function private.is_hub(t uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role = 'hub'
  );
$$;

create or replace function private.has_role(t uuid, r public.member_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1 from public.memberships m
    where m.tenant_id = t and m.user_id = (select auth.uid()) and m.role = r
  );
$$;

grant execute on function private.is_hub(uuid), private.has_role(uuid, public.member_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Playbooks
-- ---------------------------------------------------------------------------
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants on delete cascade,
  name text not null,
  category text not null default 'conteudo',
  description text,
  active boolean not null default true,
  source_playbook_id uuid references public.playbooks on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playbooks_tenant on public.playbooks (tenant_id);

create table public.playbook_steps (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks on delete cascade,
  tenant_id uuid references public.tenants on delete cascade,
  position int not null,
  title text not null,
  description text,
  owner_role public.member_role not null default 'hub',
  approver_role public.member_role,
  due_offset_days int not null default 0,
  estimate_minutes int not null default 60 check (estimate_minutes >= 0),
  internal boolean not null default false,
  checklist text[] not null default '{}'
);
create index playbook_steps_playbook on public.playbook_steps (playbook_id, position);

-- ---------------------------------------------------------------------------
-- Projetos e tarefas
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid,
  playbook_id uuid references public.playbooks on delete set null,
  name text not null,
  description text,
  status public.project_status not null default 'em_andamento',
  starts_on date not null default current_date,
  due_on date,
  owner_id uuid references auth.users on delete set null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade
);
create index projects_tenant on public.projects (tenant_id, status);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,
  position int not null default 0,
  title text not null,
  description text,
  owner_role public.member_role not null default 'hub',
  approver_role public.member_role,
  assignee_id uuid references auth.users on delete set null,
  status public.task_status not null default 'a_fazer',
  due_on date,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  internal boolean not null default false,
  estimate_minutes int not null default 60 check (estimate_minutes >= 0),
  completed_at timestamptz,
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, project_id) references public.projects (tenant_id, id) on delete cascade
);
create index tasks_project on public.tasks (project_id, position);
create index tasks_assignee on public.tasks (assignee_id, status);
create index tasks_due on public.tasks (tenant_id, status, due_on);

create or replace function private.can_access_project(p uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects pr
    where pr.id = p and (
      private.is_tenant_manager(pr.tenant_id)
      or (pr.operation_id is not null and private.can_access_operation(pr.operation_id))
      or exists (select 1 from public.tasks t where t.project_id = pr.id and t.assignee_id = (select auth.uid()))
    )
  );
$$;
grant execute on function private.can_access_project(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Contrato vivo: o que foi contratado por mês, para comparar com o entregue.
-- ---------------------------------------------------------------------------
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid,
  name text not null,
  monthly_fee numeric(12, 2) not null default 0 check (monthly_fee >= 0),
  starts_on date not null default current_date,
  ends_on date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, operation_id) references public.operations (tenant_id, id) on delete cascade,
  check (ends_on is null or ends_on >= starts_on)
);

-- format preenchido: conta peças publicadas daquele formato no mês.
-- format vazio: conta tarefas de projeto concluídas no mês.
create table public.contract_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contract_id uuid not null,
  label text not null,
  format public.item_format,
  quantity int not null check (quantity > 0),
  foreign key (tenant_id, contract_id) references public.contracts (tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Comentários (tarefas, peças, projetos) e linha do tempo
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants on delete cascade,
  entity_type text not null check (entity_type in ('task', 'plan_item', 'project')),
  entity_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_entity on public.comments (entity_type, entity_id, created_at);

create table public.activity_log (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants on delete cascade,
  operation_id uuid,
  project_id uuid,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  title text,
  meta jsonb not null default '{}'::jsonb,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index activity_tenant on public.activity_log (tenant_id, created_at desc);
create index activity_project on public.activity_log (project_id, created_at desc);

create or replace function private.can_access_entity(kind text, e uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case kind
    when 'task' then exists (
      select 1 from public.tasks t where t.id = e
        and (t.assignee_id = (select auth.uid()) or private.can_access_project(t.project_id))
        and (not t.internal or private.is_hub(t.tenant_id)))
    when 'project' then private.can_access_project(e)
    when 'plan_item' then exists (
      select 1 from public.plan_items i join public.monthly_plans p on p.id = i.plan_id
      where i.id = e and private.can_access_operation(p.operation_id))
    else false
  end;
$$;
grant execute on function private.can_access_entity(text, uuid) to authenticated;

-- Registra criação, mudança de status e remoção. Outras edições só entram para
-- tabelas sem status (ex.: marca), como "atualizou".
create or replace function private.log_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  v_tenant uuid := (r ->> 'tenant_id')::uuid;
  v_op uuid;
  v_project uuid;
  v_action text;
  v_meta jsonb := '{}'::jsonb;
  v_internal boolean := coalesce((r ->> 'internal')::boolean, false);
  v_title text := coalesce(r ->> 'title', r ->> 'name', r ->> 'label');
begin
  if v_tenant is null or not exists (select 1 from public.tenants where id = v_tenant) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    v_action := 'criou';
  elsif tg_op = 'DELETE' then
    v_action := 'removeu';
  elsif r ? 'status' then
    if (r ->> 'status') is not distinct from (o ->> 'status') then return null; end if;
    v_action := 'status';
    v_meta := jsonb_build_object('de', o ->> 'status', 'para', r ->> 'status');
  else
    v_action := 'atualizou';
  end if;

  if tg_table_name = 'plan_items' then
    select p.operation_id into v_op from public.monthly_plans p where p.id = (r ->> 'plan_id')::uuid;
  elsif tg_table_name = 'tasks' then
    v_project := (r ->> 'project_id')::uuid;
    select pr.operation_id into v_op from public.projects pr where pr.id = v_project;
  elsif tg_table_name = 'projects' then
    v_project := (r ->> 'id')::uuid;
    v_op := (r ->> 'operation_id')::uuid;
  elsif tg_table_name = 'monthly_plans' then
    v_op := (r ->> 'operation_id')::uuid;
    v_title := to_char((r ->> 'month')::date, 'MM/YYYY');
  else
    v_op := (r ->> 'operation_id')::uuid;
  end if;

  insert into public.activity_log (tenant_id, operation_id, project_id, actor_id, entity_type, entity_id, action, title, meta, internal)
  values (v_tenant, v_op, v_project, (select auth.uid()), tg_table_name, (r ->> 'id')::uuid, v_action, v_title, v_meta, v_internal);
  return null;
end $$;

create trigger plan_items_activity after insert or update or delete on public.plan_items
  for each row execute function private.log_activity();
create trigger monthly_plans_activity after insert or update on public.monthly_plans
  for each row execute function private.log_activity();
create trigger projects_activity after insert or update or delete on public.projects
  for each row execute function private.log_activity();
create trigger tasks_activity after update or delete on public.tasks
  for each row execute function private.log_activity();

create trigger projects_touch before update on public.projects
  for each row execute function private.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function private.touch_updated_at();
create trigger playbooks_touch before update on public.playbooks
  for each row execute function private.touch_updated_at();

-- Aprovação por papel: tarefa com approver_role só é concluída por quem tem
-- esse papel no tenant. Quem não gerencia não mexe na estrutura da tarefa.
create or replace function private.guard_task()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'concluida' and (tg_op = 'INSERT' or old.status <> 'concluida') then
    if new.approver_role is not null and (select auth.uid()) is not null
       and not private.has_role(new.tenant_id, new.approver_role) then
      raise exception 'Esta etapa precisa ser aprovada por: %', new.approver_role;
    end if;
    new.completed_at := now();
    if new.approver_role is not null then
      new.approved_by := (select auth.uid());
      new.approved_at := now();
    end if;
  elsif new.status <> 'concluida' then
    new.completed_at := null;
    new.approved_by := null;
    new.approved_at := null;
  end if;

  if tg_op = 'UPDATE' and (select auth.uid()) is not null and not private.is_tenant_manager(new.tenant_id)
     and (new.title, new.approver_role, new.internal, new.project_id, new.owner_role)
         is distinct from (old.title, old.approver_role, old.internal, old.project_id, old.owner_role) then
    raise exception 'Só Hub ou Marca alteram a estrutura da tarefa';
  end if;
  return new;
end $$;

create trigger tasks_guard before insert or update on public.tasks
  for each row execute function private.guard_task();

revoke execute on function private.log_activity(), private.guard_task() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Iniciar projeto a partir de um playbook (roda com as permissões de quem chama)
-- ---------------------------------------------------------------------------
create or replace function public.start_project(
  p_tenant uuid, p_playbook uuid, p_name text, p_starts date,
  p_operation uuid default null, p_owner uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_project uuid;
  v_due date;
begin
  select p_starts + coalesce(max(s.due_offset_days), 0) into v_due
  from public.playbook_steps s where s.playbook_id = p_playbook;

  insert into public.projects (tenant_id, operation_id, playbook_id, name, starts_on, due_on, owner_id, created_by)
  values (p_tenant, p_operation, p_playbook, p_name, p_starts, v_due, coalesce(p_owner, (select auth.uid())), (select auth.uid()))
  returning id into v_project;

  insert into public.tasks (tenant_id, project_id, position, title, description, owner_role, approver_role,
                            due_on, checklist, internal, estimate_minutes)
  select p_tenant, v_project, s.position, s.title, s.description, s.owner_role, s.approver_role,
         p_starts + s.due_offset_days,
         coalesce((select jsonb_agg(jsonb_build_object('label', c, 'done', false)) from unnest(s.checklist) c), '[]'::jsonb),
         s.internal, s.estimate_minutes
  from public.playbook_steps s
  where s.playbook_id = p_playbook
  order by s.position;

  return v_project;
end $$;
revoke execute on function public.start_project(uuid, uuid, text, date, uuid, uuid) from public, anon;
grant execute on function public.start_project(uuid, uuid, text, date, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.playbooks enable row level security;
alter table public.playbook_steps enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_items enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;

create policy playbooks_read on public.playbooks for select to authenticated
  using (tenant_id is null or private.is_tenant_member(tenant_id));
create policy playbooks_manage on public.playbooks for all to authenticated
  using ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_tenant_manager(tenant_id)))
  with check ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_tenant_manager(tenant_id)));

create policy steps_read on public.playbook_steps for select to authenticated
  using (tenant_id is null or private.is_tenant_member(tenant_id));
create policy steps_manage on public.playbook_steps for all to authenticated
  using ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_tenant_manager(tenant_id)))
  with check (
    ((tenant_id is null and private.is_platform_admin()) or (tenant_id is not null and private.is_tenant_manager(tenant_id)))
    and exists (select 1 from public.playbooks pb where pb.id = playbook_id and pb.tenant_id is not distinct from playbook_steps.tenant_id)
  );

create policy projects_read on public.projects for select to authenticated
  using (private.can_access_project(id));
create policy projects_manage on public.projects for all to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));

create policy tasks_read on public.tasks for select to authenticated
  using ((assignee_id = (select auth.uid()) or private.can_access_project(project_id))
         and (not internal or private.is_hub(tenant_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (private.is_tenant_manager(tenant_id) and (not internal or private.is_hub(tenant_id)));
create policy tasks_update on public.tasks for update to authenticated
  using ((assignee_id = (select auth.uid()) or private.can_access_project(project_id))
         and (not internal or private.is_hub(tenant_id)))
  with check ((assignee_id = (select auth.uid()) or private.can_access_project(project_id))
         and (not internal or private.is_hub(tenant_id)));
create policy tasks_delete on public.tasks for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

create policy contracts_read on public.contracts for select to authenticated
  using (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));
create policy contracts_manage on public.contracts for all to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));

create policy contract_items_read on public.contract_items for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id));
create policy contract_items_manage on public.contract_items for all to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));

create policy comments_read on public.comments for select to authenticated
  using (private.can_access_entity(entity_type, entity_id) and (not internal or private.is_hub(tenant_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = (select auth.uid()) and private.can_access_entity(entity_type, entity_id)
              and (not internal or private.is_hub(tenant_id)));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = (select auth.uid()));

create policy activity_read on public.activity_log for select to authenticated
  using (
    (not internal or private.is_hub(tenant_id)) and (
      private.is_tenant_manager(tenant_id)
      or (operation_id is not null and private.can_access_operation(operation_id))
      or (project_id is not null and private.can_access_project(project_id))
    )
  );

-- ---------------------------------------------------------------------------
-- Playbooks do produto (método Hub). Offsets em dias a partir do início.
-- ---------------------------------------------------------------------------
with pb as (
  insert into public.playbooks (name, category, description) values
    ('Ciclo mensal de conteúdo', 'conteudo', 'Da leitura do calendário à curadoria de melhores práticas: o ciclo que cada operação roda todo mês.'),
    ('Lançamento de campanha nacional', 'campanha', 'Leva uma campanha da marca até a rotina de cada loja, com kit oficial, treinamento e adaptação local aprovada.'),
    ('Data comercial', 'campanha', 'Aquecimento, execução e leitura de uma data de venda (Dia das Mães, Black Friday, Natal).'),
    ('Inauguração de loja', 'operacao', 'Pré-lançamento, evento de abertura e os primeiros 60 dias de uma nova operação.'),
    ('Onboarding de cliente', 'onboarding', 'Os primeiros 30 dias de um cliente na NEST: marca configurada, rede cadastrada e primeiro ciclo rodando.')
  returning id, name
)
insert into public.playbook_steps (playbook_id, position, title, description, owner_role, approver_role, due_offset_days, estimate_minutes, internal, checklist)
select pb.id, s.position, s.title, s.description, s.owner_role::public.member_role, s.approver_role::public.member_role,
       s.offset_days, s.minutes, s.internal, s.checklist
from pb join (values
  ('Ciclo mensal de conteúdo', 1, 'Leitura do calendário e briefing do mês', 'Cruzar calendário nacional, datas locais, clima e metas.', 'hub', null, 0, 90, false, array['Datas nacionais revisadas', 'Datas locais levantadas', 'Clima da região considerado', 'Meta comercial do mês registrada']),
  ('Ciclo mensal de conteúdo', 2, 'Plano do mês por operação', 'Montar o plano mensal de cada operação no módulo Rede.', 'hub', null, 3, 120, false, array['Foco do mês definido', 'Peças distribuídas no mês', 'Ao menos uma ação que traz cliente para a loja']),
  ('Ciclo mensal de conteúdo', 3, 'Aprovação do plano', 'A marca valida o plano antes da produção.', 'hub', 'marca', 5, 30, false, array[]::text[]),
  ('Ciclo mensal de conteúdo', 4, 'Roteiros e legendas', 'Escrever roteiros e legendas no Estúdio, na voz da marca.', 'hub', null, 8, 180, false, array['Roteiros com gancho nos 3 primeiros segundos', 'Legendas revisadas', 'Checagem de marca sem alertas']),
  ('Ciclo mensal de conteúdo', 5, 'Aprovação das peças', 'Peças enviadas para aprovação da marca.', 'hub', 'marca', 10, 30, false, array[]::text[]),
  ('Ciclo mensal de conteúdo', 6, 'Captação e produção na loja', 'Equipe da loja grava e fotografa seguindo os roteiros.', 'lojista', null, 15, 240, false, array['Material bruto enviado', 'Enquadramento e luz conforme roteiro']),
  ('Ciclo mensal de conteúdo', 7, 'Mentoria do mês', 'Encontro com a loja para ajustar execução e tirar dúvidas.', 'hub', null, 18, 60, false, array['Presença registrada', 'Combinados anotados']),
  ('Ciclo mensal de conteúdo', 8, 'Publicação', 'Publicar as peças aprovadas nas datas do plano.', 'lojista', null, 25, 60, false, array[]::text[]),
  ('Ciclo mensal de conteúdo', 9, 'Registro de resultados', 'Lançar alcance, interações, leads e vendas de cada peça.', 'lojista', null, 30, 45, false, array[]::text[]),
  ('Ciclo mensal de conteúdo', 10, 'Análise e ajustes', 'Ler o resultado do mês e definir ajustes para o próximo.', 'hub', null, 33, 90, false, array['Top 3 peças do mês', 'O que não funcionou e por quê', 'Ajustes para o próximo plano']),
  ('Ciclo mensal de conteúdo', 11, 'Curadoria de melhores práticas', 'Promover os cases do mês para a Biblioteca.', 'hub', null, 35, 45, false, array[]::text[]),

  ('Lançamento de campanha nacional', 1, 'Briefing da campanha', 'Objetivo, produtos, mensagem-chave, período e restrições.', 'marca', null, 0, 60, false, array['Objetivo e meta', 'Produtos e preços', 'Mensagem-chave', 'O que a loja não pode fazer']),
  ('Lançamento de campanha nacional', 2, 'Kit de ativos oficiais', 'Ativos oficiais organizados em um kit em Kits & Ativos.', 'hub', 'marca', 5, 240, false, array['Peças em todos os formatos', 'Direitos de uso cadastrados', 'Textos base para Grupos VIP']),
  ('Lançamento de campanha nacional', 3, 'Guia de adaptação local', 'Como cada loja adapta a campanha sem sair da identidade.', 'hub', null, 7, 120, false, array[]::text[]),
  ('Lançamento de campanha nacional', 4, 'Treinamento da rede', 'Apresentar campanha e kit para lojistas.', 'hub', null, 10, 90, false, array['Gravação disponível', 'Presença registrada']),
  ('Lançamento de campanha nacional', 5, 'Adaptações por loja', 'Cada loja monta suas peças a partir do kit.', 'lojista', 'marca', 14, 120, false, array[]::text[]),
  ('Lançamento de campanha nacional', 6, 'Go-live', 'Campanha no ar em todas as operações.', 'lojista', null, 18, 30, false, array[]::text[]),
  ('Lançamento de campanha nacional', 7, 'Acompanhamento da 1ª semana', 'Monitorar execução e corrigir desvios.', 'hub', null, 25, 120, false, array[]::text[]),
  ('Lançamento de campanha nacional', 8, 'Relatório da campanha', 'Resultado por loja e aprendizados.', 'hub', 'marca', 35, 120, false, array[]::text[]),

  ('Data comercial', 1, 'Oferta e mecânica', 'Definir oferta, mecânica e estoque.', 'marca', null, 0, 60, false, array['Oferta definida', 'Estoque confirmado']),
  ('Data comercial', 2, 'Calendário de aquecimento', 'Sequência de conteúdos antes da data.', 'hub', null, 3, 90, false, array[]::text[]),
  ('Data comercial', 3, 'Peças de aquecimento', 'Peças da sequência prontas para aprovação.', 'hub', 'marca', 7, 180, false, array[]::text[]),
  ('Data comercial', 4, 'Roteiro para Grupos VIP', 'Mensagens de WhatsApp para antes, durante e depois.', 'hub', null, 9, 60, false, array[]::text[]),
  ('Data comercial', 5, 'Vitrine e equipe', 'Loja preparada: vitrine, abordagem e metas da equipe.', 'lojista', null, 12, 120, false, array['Vitrine montada', 'Equipe treinada na oferta']),
  ('Data comercial', 6, 'Execução no dia', 'Publicações e ações no dia da data.', 'lojista', null, 15, 240, false, array[]::text[]),
  ('Data comercial', 7, 'Resultado e aprendizados', 'Vendas × conteúdo, o que repetir no próximo ano.', 'hub', null, 20, 90, false, array[]::text[]),

  ('Inauguração de loja', 1, 'Kickoff com o franqueado', 'Alinhar data, metas e responsabilidades.', 'hub', null, 0, 60, false, array[]::text[]),
  ('Inauguração de loja', 2, 'Perfis e presença local', 'Instagram da loja, Google Business e WhatsApp configurados.', 'lojista', null, 3, 120, false, array['Instagram no padrão da marca', 'Perfil no Google Business verificado', 'WhatsApp Business com catálogo']),
  ('Inauguração de loja', 3, 'Plano de pré-lançamento', 'Os 30 dias antes da abertura.', 'hub', 'marca', 5, 120, false, array[]::text[]),
  ('Inauguração de loja', 4, 'Contagem regressiva', 'Conteúdos de expectativa e lista VIP de inauguração.', 'lojista', null, 10, 240, false, array[]::text[]),
  ('Inauguração de loja', 5, 'Evento de inauguração', 'Evento, cobertura e registro.', 'lojista', null, 30, 480, false, array[]::text[]),
  ('Inauguração de loja', 6, 'Primeiros 60 dias', 'Acompanhamento intensivo e primeiro ciclo mensal.', 'hub', null, 60, 240, false, array[]::text[]),

  ('Onboarding de cliente', 1, 'Reunião de kickoff', 'Objetivos, rede, pessoas-chave e ritos.', 'hub', null, 0, 90, false, array['Objetivos do cliente', 'Pessoas e papéis', 'Rito mensal combinado']),
  ('Onboarding de cliente', 2, 'Marca configurada', 'Identidade, voz, personas, produtos, regras e exemplos no módulo Marca.', 'marca', null, 7, 120, false, array['Identidade visual', 'Voz de marca', 'Personas', 'Produtos', 'Regras e termos proibidos', 'Exemplos aprovados e reprovados']),
  ('Onboarding de cliente', 3, 'Regiões e operações', 'Cadastro da rede.', 'hub', null, 7, 60, false, array[]::text[]),
  ('Onboarding de cliente', 4, 'Convite da equipe', 'Acessos para marca, gestores e lojistas.', 'hub', null, 10, 30, false, array[]::text[]),
  ('Onboarding de cliente', 5, 'Contrato e escopo', 'Contrato e entregas mensais configurados.', 'hub', null, 10, 30, true, array[]::text[]),
  ('Onboarding de cliente', 6, 'Primeiro plano mensal', 'Primeiro ciclo rodando.', 'hub', null, 14, 180, false, array[]::text[]),
  ('Onboarding de cliente', 7, 'Revisão de 30 dias', 'O que está funcionando e próximos passos.', 'hub', 'marca', 30, 60, false, array[]::text[])
) as s(playbook, position, title, description, owner_role, approver_role, offset_days, minutes, internal, checklist)
  on s.playbook = pb.name;
