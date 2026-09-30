-- Policies de gestão ("*_manage", "for all") passam a valer só para escrita.
-- Antes cada SELECT avaliava a policy de leitura E a de gestão (advisor
-- multiple_permissive_policies). O acesso continua exatamente o mesmo:
--   * onde a gestão já está contida na leitura (admin ⊂ hub ⊂ gestor ⊂ membro),
--     só removemos o SELECT da policy de gestão;
--   * onde a leitura usa uma função que consulta a própria tabela
--     (can_access_operation, can_access_project) ou outra regra, a condição de
--     gestão entra em linha na leitura — em INSERT ... RETURNING a função ainda
--     não enxerga a linha nova.

-- ai_prompts
drop policy ai_prompts_manage on public.ai_prompts;
create policy ai_prompts_manage_insert on public.ai_prompts for insert to authenticated
  with check (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_hub(tenant_id)));
create policy ai_prompts_manage_update on public.ai_prompts for update to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_hub(tenant_id)))
  with check (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_hub(tenant_id)));
create policy ai_prompts_manage_delete on public.ai_prompts for delete to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_hub(tenant_id)));

-- ai_settings
drop policy ai_settings_manage on public.ai_settings;
create policy ai_settings_manage_insert on public.ai_settings for insert to authenticated
  with check (private.is_hub(tenant_id));
create policy ai_settings_manage_update on public.ai_settings for update to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));
create policy ai_settings_manage_delete on public.ai_settings for delete to authenticated
  using (private.is_hub(tenant_id));

-- asset_rights (leitura por can_read_asset: gestão entra em linha)
drop policy rights_manage on public.asset_rights;
drop policy rights_read on public.asset_rights;
create policy rights_read on public.asset_rights for select to authenticated
  using (private.is_tenant_manager(tenant_id) or private.can_read_asset(asset_id));
create policy rights_manage_insert on public.asset_rights for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy rights_manage_update on public.asset_rights for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy rights_manage_delete on public.asset_rights for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- asset_shares
drop policy shares_manage on public.asset_shares;
create policy shares_manage_insert on public.asset_shares for insert to authenticated
  with check (private.is_tenant_manager(from_tenant_id) and exists (
    select 1 from public.assets a where a.id = asset_shares.asset_id and a.tenant_id = asset_shares.from_tenant_id));
create policy shares_manage_update on public.asset_shares for update to authenticated
  using (private.is_tenant_manager(from_tenant_id))
  with check (private.is_tenant_manager(from_tenant_id) and exists (
    select 1 from public.assets a where a.id = asset_shares.asset_id and a.tenant_id = asset_shares.from_tenant_id));
create policy shares_manage_delete on public.asset_shares for delete to authenticated
  using (private.is_tenant_manager(from_tenant_id));

-- best_practices
drop policy practices_manage on public.best_practices;
create policy practices_manage_insert on public.best_practices for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy practices_manage_update on public.best_practices for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy practices_manage_delete on public.best_practices for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brand_examples
drop policy examples_manage on public.brand_examples;
create policy examples_manage_insert on public.brand_examples for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy examples_manage_update on public.brand_examples for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy examples_manage_delete on public.brand_examples for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brand_personas
drop policy personas_manage on public.brand_personas;
create policy personas_manage_insert on public.brand_personas for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy personas_manage_update on public.brand_personas for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy personas_manage_delete on public.brand_personas for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brand_products
drop policy products_manage on public.brand_products;
create policy products_manage_insert on public.brand_products for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy products_manage_update on public.brand_products for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy products_manage_delete on public.brand_products for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brand_rules
drop policy rules_manage on public.brand_rules;
create policy rules_manage_insert on public.brand_rules for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy rules_manage_update on public.brand_rules for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy rules_manage_delete on public.brand_rules for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brand_voices
drop policy brand_voices_manage on public.brand_voices;
create policy brand_voices_manage_insert on public.brand_voices for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy brand_voices_manage_update on public.brand_voices for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy brand_voices_manage_delete on public.brand_voices for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- brief_invites
drop policy invites_manage on public.brief_invites;
create policy invites_manage_insert on public.brief_invites for insert to authenticated
  with check (private.is_tenant_manager(private.brief_tenant(brief_id)));
create policy invites_manage_update on public.brief_invites for update to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)))
  with check (private.is_tenant_manager(private.brief_tenant(brief_id)));
create policy invites_manage_delete on public.brief_invites for delete to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id)));

-- brief_proposals: as duas policies de UPDATE viram uma (mesmo OR que o Postgres fazia)
drop policy proposals_manager_update on public.brief_proposals;
drop policy proposals_partner_update on public.brief_proposals;
create policy proposals_update on public.brief_proposals for update to authenticated
  using (private.is_tenant_manager(private.brief_tenant(brief_id))
         or (partner_id = private.my_partner_id() and status = 'enviada'))
  with check (private.is_tenant_manager(private.brief_tenant(brief_id))
              or (partner_id = private.my_partner_id() and status = 'enviada'));

-- briefs
drop policy briefs_manage on public.briefs;
create policy briefs_manage_insert on public.briefs for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy briefs_manage_update on public.briefs for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy briefs_manage_delete on public.briefs for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- calendar_events: leitura absorve as duas regras de escrita; escrita vira uma por comando
drop policy events_read on public.calendar_events;
drop policy events_write_local on public.calendar_events;
drop policy events_write_national on public.calendar_events;
create policy events_read on public.calendar_events for select to authenticated using (
  (private.is_tenant_member(tenant_id) and (
     scope = 'nacional'
     or (scope = 'regional' and (
           private.is_tenant_manager(tenant_id)
           or private.can_access_region(region_id)
           or exists (select 1 from public.memberships m join public.operations op on op.id = m.operation_id
                      where m.user_id = (select auth.uid()) and op.region_id = calendar_events.region_id)))
     or (scope = 'local' and private.can_access_operation(operation_id))))
  or (scope = 'local' and private.can_access_operation(operation_id))
  or (scope in ('nacional', 'regional') and private.is_tenant_manager(tenant_id))
);
create policy events_write_insert on public.calendar_events for insert to authenticated
  with check ((scope = 'local' and private.can_access_operation(operation_id))
              or (scope in ('nacional', 'regional') and private.is_tenant_manager(tenant_id)));
create policy events_write_update on public.calendar_events for update to authenticated
  using ((scope = 'local' and private.can_access_operation(operation_id))
         or (scope in ('nacional', 'regional') and private.is_tenant_manager(tenant_id)))
  with check ((scope = 'local' and private.can_access_operation(operation_id))
              or (scope in ('nacional', 'regional') and private.is_tenant_manager(tenant_id)));
create policy events_write_delete on public.calendar_events for delete to authenticated
  using ((scope = 'local' and private.can_access_operation(operation_id))
         or (scope in ('nacional', 'regional') and private.is_tenant_manager(tenant_id)));

-- contract_items (leitura depende de contracts: gestão entra em linha)
drop policy contract_items_manage on public.contract_items;
drop policy contract_items_read on public.contract_items;
create policy contract_items_read on public.contract_items for select to authenticated
  using (private.is_hub(tenant_id)
         or exists (select 1 from public.contracts c where c.id = contract_items.contract_id));
create policy contract_items_manage_insert on public.contract_items for insert to authenticated
  with check (private.is_hub(tenant_id));
create policy contract_items_manage_update on public.contract_items for update to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));
create policy contract_items_manage_delete on public.contract_items for delete to authenticated
  using (private.is_hub(tenant_id));

-- contracts
drop policy contracts_manage on public.contracts;
create policy contracts_manage_insert on public.contracts for insert to authenticated
  with check (private.is_hub(tenant_id));
create policy contracts_manage_update on public.contracts for update to authenticated
  using (private.is_hub(tenant_id)) with check (private.is_hub(tenant_id));
create policy contracts_manage_delete on public.contracts for delete to authenticated
  using (private.is_hub(tenant_id));

-- editorias
drop policy editorias_manage on public.editorias;
create policy editorias_manage_insert on public.editorias for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy editorias_manage_update on public.editorias for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy editorias_manage_delete on public.editorias for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- integrations
drop policy integrations_manage on public.integrations;
create policy integrations_manage_insert on public.integrations for insert to authenticated
  with check (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));
create policy integrations_manage_update on public.integrations for update to authenticated
  using (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)))
  with check (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));
create policy integrations_manage_delete on public.integrations for delete to authenticated
  using (private.is_tenant_manager(tenant_id) or (operation_id is not null and private.can_access_operation(operation_id)));

-- kit_assets (leitura depende de kits: gestão entra em linha)
drop policy kit_assets_manage on public.kit_assets;
drop policy kit_assets_read on public.kit_assets;
create policy kit_assets_read on public.kit_assets for select to authenticated
  using (private.is_tenant_manager(tenant_id)
         or exists (select 1 from public.kits k where k.id = kit_assets.kit_id));
create policy kit_assets_manage_insert on public.kit_assets for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy kit_assets_manage_update on public.kit_assets for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy kit_assets_manage_delete on public.kit_assets for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- kits
drop policy kits_manage on public.kits;
create policy kits_manage_insert on public.kits for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy kits_manage_update on public.kits for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy kits_manage_delete on public.kits for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- memberships
drop policy memberships_manage on public.memberships;
create policy memberships_manage_insert on public.memberships for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy memberships_manage_update on public.memberships for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy memberships_manage_delete on public.memberships for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- operations (can_access_operation consulta operations: gestão entra em linha)
drop policy operations_manage on public.operations;
drop policy operations_read on public.operations;
create policy operations_read on public.operations for select to authenticated
  using (private.is_tenant_manager(tenant_id) or private.can_access_operation(id));
create policy operations_manage_insert on public.operations for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy operations_manage_update on public.operations for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy operations_manage_delete on public.operations for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- partner_reviews
drop policy reviews_manage on public.partner_reviews;
create policy reviews_manage_insert on public.partner_reviews for insert to authenticated
  with check (private.is_tenant_manager(tenant_id) and exists (
    select 1 from public.briefs b
    where b.id = partner_reviews.brief_id and b.tenant_id = partner_reviews.tenant_id
      and b.partner_id = partner_reviews.partner_id and b.status in ('aprovado', 'pago')));
create policy reviews_manage_update on public.partner_reviews for update to authenticated
  using (private.is_tenant_manager(tenant_id))
  with check (private.is_tenant_manager(tenant_id) and exists (
    select 1 from public.briefs b
    where b.id = partner_reviews.brief_id and b.tenant_id = partner_reviews.tenant_id
      and b.partner_id = partner_reviews.partner_id and b.status in ('aprovado', 'pago')));
create policy reviews_manage_delete on public.partner_reviews for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- playbook_steps
drop policy steps_manage on public.playbook_steps;
create policy steps_manage_insert on public.playbook_steps for insert to authenticated
  with check ((((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)))
              and exists (select 1 from public.playbooks pb
                          where pb.id = playbook_steps.playbook_id and pb.tenant_id is not distinct from playbook_steps.tenant_id));
create policy steps_manage_update on public.playbook_steps for update to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)))
  with check ((((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)))
              and exists (select 1 from public.playbooks pb
                          where pb.id = playbook_steps.playbook_id and pb.tenant_id is not distinct from playbook_steps.tenant_id));
create policy steps_manage_delete on public.playbook_steps for delete to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)));

-- playbooks
drop policy playbooks_manage on public.playbooks;
create policy playbooks_manage_insert on public.playbooks for insert to authenticated
  with check (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)));
create policy playbooks_manage_update on public.playbooks for update to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)))
  with check (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)));
create policy playbooks_manage_delete on public.playbooks for delete to authenticated
  using (((tenant_id is null) and private.is_platform_admin()) or ((tenant_id is not null) and private.is_tenant_manager(tenant_id)));

-- projects (can_access_project consulta projects: gestão entra em linha)
drop policy projects_manage on public.projects;
drop policy projects_read on public.projects;
create policy projects_read on public.projects for select to authenticated
  using (private.is_tenant_manager(tenant_id) or private.can_access_project(id));
create policy projects_manage_insert on public.projects for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy projects_manage_update on public.projects for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy projects_manage_delete on public.projects for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- regions
drop policy regions_manage on public.regions;
create policy regions_manage_insert on public.regions for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy regions_manage_update on public.regions for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy regions_manage_delete on public.regions for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- staff_profiles
drop policy staff_admin on public.staff_profiles;
create policy staff_admin_insert on public.staff_profiles for insert to authenticated
  with check (private.is_platform_admin());
create policy staff_admin_update on public.staff_profiles for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy staff_admin_delete on public.staff_profiles for delete to authenticated
  using (private.is_platform_admin());

-- tenant_themes: themes_admin era redundante (is_tenant_manager já inclui admin da plataforma)
drop policy themes_admin on public.tenant_themes;
drop policy themes_manage on public.tenant_themes;
create policy themes_manage_insert on public.tenant_themes for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy themes_manage_update on public.tenant_themes for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy themes_manage_delete on public.tenant_themes for delete to authenticated
  using (private.is_tenant_manager(tenant_id));

-- tenants
drop policy tenants_admin on public.tenants;
create policy tenants_admin_insert on public.tenants for insert to authenticated
  with check (private.is_platform_admin());
create policy tenants_admin_update on public.tenants for update to authenticated
  using (private.is_platform_admin()) with check (private.is_platform_admin());
create policy tenants_admin_delete on public.tenants for delete to authenticated
  using (private.is_platform_admin());

-- tier_quotas
drop policy quotas_manage on public.tier_quotas;
create policy quotas_manage_insert on public.tier_quotas for insert to authenticated
  with check (private.is_tenant_manager(tenant_id));
create policy quotas_manage_update on public.tier_quotas for update to authenticated
  using (private.is_tenant_manager(tenant_id)) with check (private.is_tenant_manager(tenant_id));
create policy quotas_manage_delete on public.tier_quotas for delete to authenticated
  using (private.is_tenant_manager(tenant_id));
