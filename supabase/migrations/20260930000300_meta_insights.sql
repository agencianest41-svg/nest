-- NEST — Insights da Meta entrando em Resultados.
-- Cada post vira uma linha (external_id = id da mídia no Instagram) que a
-- sincronização diária regrava com os números mais recentes, sem duplicar.
alter table public.result_entries add column external_id text;
create unique index result_entries_external on public.result_entries (operation_id, channel, external_id);
