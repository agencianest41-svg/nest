# NEST — Motor de pautas (desenho, 29/09/2026)

A NEST gera o **cérebro** (campanhas, pautas, por quê, roteiro) e o **franqueado cria e publica**.
Inspirado no fluxo mensal da Hub, com uma inversão: na Hub a agência produz e esconde o briefing do
cliente; na NEST o briefing completo é o produto entregue à loja.

## Decisões (29/09/2026)

| Tema | Decisão |
|---|---|
| Plano | **Calendário-base da rede** (marca + Hub) e adaptação por loja pela IA (cidade, datas locais, histórico) |
| Validação do cérebro | **IA gera, Hub revisa**, depois libera para a rede |
| Volume | **Pelo pacote contratado** da operação (`operations.tier`) |
| Aprovação do post | **Pareto**: o Guardião de marca checa; passa direto se estiver ok. Só sobe para Hub/Marca o que for sinalizado ou marcado como sensível (preço, promoção, regulatório) |

## Ciclo mensal (sempre M+1)

| Quando | O quê | Quem |
|---|---|---|
| até dia 10 | Campanhas e datas de M+1 no calendário; editorias revisadas | Marca / Hub |
| dia 15 | Motor gera o **calendário-base** de M+1 (campanhas + editorias + volume máximo + cases que funcionaram) | IA |
| 15 a 22 | Revisão: editar, trocar, reordenar, marcar pautas sensíveis | Hub |
| ~22 | **Liberar para a rede**: IA adapta a base para cada loja e corta pelo volume do pacote | IA (lote) |
| 22 ao fim do mês | Franqueado vê "Próximo mês", troca pautas pelo banco de ideias; checkpoint mensal (análise de M-1 + apresentação de M+1) | Franqueado / Hub (Mentoria) |
| durante M | Modo criar → publicou (link) → Guardião → direto ou fila de revisão | Franqueado |
| fim de M | Resultados → Biblioteca → alimentam o motor de M+2 | Todos |

## A pauta (campos)

Data, editoria, título, **ideia** (conteúdo da pauta), **por quê** (justificativa estratégica), estágio do funil,
formato, gancho, roteiro breve, legenda sugerida, campanha/evento, kit de ativos, case de referência,
`sensivel` (exige revisão), origem (base | local | banco).

Hoje `plan_items` tem título, formato, data, status, roteiro, legenda e evento. A IA já produz o `why`
em `suggestionSchema` (`src/lib/studio.ts`), mas o campo não é gravado.

## O que já existe

Calendário nacional/regional/local (em lista) · plano mensal por loja · sugestões e redação por IA com a voz da marca ·
Guardião de marca · Kits & ativos · resultado por peça · Biblioteca com "Replicar como ideia" · contrato vivo.

## Fases

1. **Cérebro da pauta**: tabela `editorias` por tenant; novos campos em `plan_items`; cotas por pacote (posts/stories por tier).
2. **Calendário visual do franqueado**: grade do mês como home da loja; card por dia (editoria, formato, status); a pauta abre em "modo criar" (passo a passo, ativos do kit, copiar legenda, "publiquei" + link).
3. **Calendário-base da rede**: `network_plans` / `network_plan_items`; geração de M+1 por IA; revisão da Hub; "Liberar" gera os planos por loja em lote.
4. **Aprovação Pareto**: trocar `guard_item_approval` por Guardião + flag `sensivel`; fila de revisão na Minha mesa.
5. **Banco de ideias e ciclo**: trocar pauta, datas do ciclo por tenant, avisos, checkpoint mensal (Mentoria).

## Status

- [x] **Fase 1 (29/09/2026)**: `editorias` (Marca › Editorias), `tier_quotas` (Contrato › Volume por pacote, padrão 12/16/22/22), pacote por operação,
  campos do cérebro em `plan_items` (`idea`, `rationale`, `hook`, `funnel`, `editoria_id`, `kit_id`, `practice_id`, `sensitive`, `published_url`, `origin`).
  Trigger `guard_item_brain`: lojista não mexe no porquê/editoria/funil de pautas `hub`/`base` nem marca "sensível". Guardião também lê o gancho.
  O Estúdio (IA) recebe editorias e volume e grava ideia, porquê, gancho e funil. Teste: `supabase/tests/pautas_probe.sql`.
- [x] **Fase 2 (29/09/2026)**: página da operação abre no **Calendário** (grade do mês; agenda no celular; campanhas longas na faixa "No mês"),
  "Entrega do mês" (posts/stories × meta do pacote), "Próximas pautas" e painel da pauta (modo criar: ideia, porquê, gancho, roteiro e legenda
  com copiar, kit, case, próximo passo, publicar com link). A antiga lista virou a aba **Planejamento**.
- [x] **Fase 3 (30/09/2026)**: `network_plans` / `network_plan_items` (só Hub e Marca leem), aba **Plano › Calendário-base**
  (abre em M+1). "Gerar com IA" (`base.gerar`) monta ideia, porquê, gancho, funil, editoria e campanha, e define o **pacote mínimo**
  de cada pauta até fechar o volume de cada pacote; a tabela mostra posts/stories × cota e lojas por pacote. Pautas de preço/promoção
  vêm marcadas como sensíveis. `release_network_plan` cria o plano do mês de cada loja (piloto; a rede toda se não houver piloto),
  copia as pautas como origem `base` e corta posts/stories pela cota em ordem de data; lojas sem pacote recebem o Essencial.
  Liberar de novo só envia o que é novo (`plan_items.base_item_id`). A adaptação à cidade fica no "escrever com IA" da loja.
- [ ] Fases 4 e 5

## Em aberto

- Volume de cada pacote: hoje com padrão 12/16/22/22 (posts e stories), a confirmar
- Stories como trilha separada (sequência diária) ou só como formato de pauta (hoje: formato, com meta própria)
- Editorias da Mahogany: 5 sugeridas no seed, a validar com a marca
- Pacote de cada operação (só Belém está definida, como Essencial, para a demonstração)
