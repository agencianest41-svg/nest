# NEST — Plataforma (29/09/2026)

O que foi construído sobre a fundação (`NEST-fundacao.md`) para responder à pergunta
"por que pagar R$ 1.000 e não R$ 70 por usuário": método codificado, gente dentro,
transparência total e inteligência de rede.

## Módulos

| # | Módulo | Onde | O que resolve |
|---|---|---|---|
| 1 | **Playbooks** | `/[tenant]/playbooks` | Processo escrito: etapas, quem executa, quem aprova, prazo relativo, checklist, estimativa. 5 modelos NEST (ciclo mensal, campanha nacional, data comercial, inauguração, onboarding); o cliente personaliza uma cópia. |
| 1 | **Projetos** | `/[tenant]/projetos` | Projeto nasce de um playbook (`start_project`). Etapas com status, responsável, checklist, conversa, notas internas, horas (Hub). Aprovação por papel é garantida no banco (`guard_task`). Botão "Terceirizar" gera brief para a bancada. |
| 1 | **Sala de controle** | `/[tenant]/controle` | Aguardando você, atrasados, próximos 7 dias, projetos, contrato vivo e linha do tempo (triggers `log_activity`). |
| 1 | **Contrato vivo** | `/[tenant]/contrato` | Escopo por mês (peças publicadas por formato ou etapas concluídas) × entregue. Só Hub edita; cliente vê. |
| 1 | **Relatório do mês** | `/[tenant]/relatorio` | Pronto para imprimir/PDF; resumo executivo por IA. |
| 2 | **Marca (Brand OS)** | `/[tenant]/marca` | Identidade (cores claro/escuro, logos, fonte), voz, personas, produtos, regras (termos proibidos/obrigatórios, regulatório, estilo) e exemplos aprovados/reprovados. Alimenta a IA e o guardião. |
| 2 | **Guardião de marca** | editor de peça e aba "Testar texto" | Regras no banco (`check_brand`); termo proibido com gravidade "bloqueia" impede a peça de ir para aprovação (`guard_item_brand`). Com IA: nota de aderência e reescrita. |
| 2 | **IA** | `/[tenant]/ia` (Hub) | Liga por marca e por função, orçamento mensal em USD, modelo, instruções versionadas por marca (`ai_prompts`) e registro de uso/custo (`ai_usage`). Toda chamada passa por `runAi` em `src/lib/ai`. |
| 3 | **Kits & Ativos** | `/[tenant]/ativos` | Upload direto ao Storage (bucket privado `assets`, pasta = tenant), link ou texto pronto. Oficial × da loja, versões derivadas (linhagem), direitos de uso com validade (direito vencido bloqueia download fora da gestão), kits por campanha, uso (download/cópia/reuso), compartilhamento com outra marca e "Reaproveitar". |
| 3 | **Biblioteca** | `/[tenant]/biblioteca` | Cases com métricas, por que funcionou e como replicar; "Replicar como ideia" no plano de uma operação. Aba **Rede NEST**: cases compartilhados por outras marcas, anonimizados (`network_practices`). |
| 4 | **Resultados** | `/[tenant]/resultados` e na peça | Resultado por peça/canal, faturamento por loja, marketing × vendas, benchmark (percentil) de cada loja na rede sem expor as outras (`operation_benchmark`), importação CSV, integrações "prontas para ligar", leitura do mês por IA, "Virar case". |
| 5 | **Minha mesa** | `/mesa` | Fila da pessoa em todas as marcas, aprovações pendentes, carga da equipe × capacidade. |
| 5 | **Carteira** | `/mesa/carteira` (Hub) | Fee × horas × custo/hora + IA = margem por cliente; escopo entregue. |
| 5 | **Equipe** | `/mesa/equipe` | Custo/hora e capacidade (só admin edita; cliente nunca vê). |
| 6 | **Parceiros (marca)** | `/[tenant]/parceiros` | Brief padronizado (IA opcional), publicação com retrato da marca, convite, propostas, aceite, entrega, aprovação, pagamento e avaliação; comissão da plataforma (15% padrão). |
| 6 | **Portal do parceiro** | `/parceiro` | Freelancer vê só briefs abertos/atribuídos a ele, manda proposta e entrega (`deliver_brief`). Nunca acessa dados do tenant. |
| 6 | **Curadoria** | `/mesa/parceiros` (admin) | Convite do parceiro (link de acesso), verificar/suspender. |

## Para ligar

1. **IA**: `AI_GATEWAY_API_KEY` no `.env.local` e nas variáveis da Vercel. A IA já está ligada para a Mahogany em `ai_settings`; sem a chave, as telas avisam e seguem no modo manual.
2. **Convites** (equipe e parceiros): `SUPABASE_SECRET_KEY` no servidor.
3. **Integrações** (Meta, Google Business, TikTok, ERP): a tabela `integrations` e a tela já existem; falta o OAuth de cada plataforma e um job de sincronização gravando em `result_entries`/`operation_sales` com `source = 'integracao'`.
4. **Pagamento dos parceiros**: status `pago` é manual; o meio de pagamento entra no mesmo ponto.
5. **Supabase › Auth**: ligar a proteção contra senhas vazadas (aviso do advisor).

## Testes de permissão (RLS)

Cada arquivo em `supabase/tests/` simula perfis dentro de uma transação que termina em `RAISE` (nada fica no banco) e traz o resultado esperado no cabeçalho:
`rls_probe.sql` (base), `projects_probe.sql`, `brand_ai_probe.sql`, `assets_probe.sql`, `results_probe.sql`, `staff_probe.sql`, `partners_probe.sql`.
