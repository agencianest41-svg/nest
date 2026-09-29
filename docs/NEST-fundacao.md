# NEST — Fundação do produto (piloto Mahogany)

NEST é uma plataforma multi-marca de **Last Mile**: ela leva a campanha nacional de uma marca com rede
(franquias, consultoras, revenda) até a rotina de cada loja, e devolve para a rede o que funcionou.
A Mahogany é o primeiro cliente e o primeiro tema. Tudo que é Mahogany é **dado de tenant**, nunca código.

Fontes: proposta "Hub — Last Mile Mahogany" (18 slides) e "Mahogany — Fundação de Marca e Design" (28/09/2026).

## 1. Produto × tenant

| Camada | O que é | Exemplo Mahogany |
|---|---|---|
| **Produto NEST** | Módulos, fluxos, componentes, estados, neutros, espaçamento, permissões | Igual para todos os clientes |
| **Tenant (marca)** | Tokens de marca, logo, fonte display, calendário nacional, campanhas, ativos, lojas, regiões, planos contratados | `brand #551525`, `accent #C9A563`, DM Serif Display, 200+ operações, 4 regiões |
| **Operação (loja / grupo)** | Unidade que recebe plano mensal, publica e é medida | `@mahogany_recife`, `@mahoganypoaiguatemi`… |

Um novo cliente troca apenas: `brand`, `brand-hover`, `brand-soft`, `on-brand`, `accent`, `accent-ink`, `font-display`, logo
(claro/escuro) e nome. Os valores ficam numa tabela `tenant_theme` e viram CSS variables no layout.

## 2. Módulos (espelham as 5 etapas do método)

| Etapa do método | Módulo NEST | O que faz na tela |
|---|---|---|
| 1. Direção Local | **Calendário & Plano mensal** | Calendário nacional (marca) + datas locais (cidade/região/clima) → plano do mês por operação |
| 2. Criação Assistida | **Estúdio** | Roteiros, legendas, templates, prompts e checklists; IA adapta a campanha nacional à loja; peça passa por aprovação |
| 3. Treinamento & Mentoria | **Mentoria** | Agenda de encontros mensais, trilhas (ex.: "Consultora Creator"), presença, materiais |
| 4. Ativação Comercial | **Kits & Ativos** | Banco de ativos oficiais, kits de campanha local, materiais para Grupos VIP de WhatsApp (copiar/baixar em 1 clique), recrutamento de revendedoras |
| 5. Inteligência & Resultado | **Resultado & Biblioteca** | Registro do que foi publicado, métricas por operação, e curadoria de cases → **Biblioteca de melhores práticas** que volta para a rede |

O ciclo mensal (leitura do calendário → plano → ideias/roteiros → captação → mentoria → análise → ajustes) é o
esqueleto de navegação: cada operação tem um "mês" com status por etapa.

## 3. Perfis de acesso

| Perfil | Quem | Vê / faz |
|---|---|---|
| Admin NEST | Hub / time interno | Todos os tenants, temas, planos, curadoria |
| Estrategista Hub | Consultor que atende a rede | Planos, mentorias, análise e curadoria das operações da carteira |
| Marca (central) | Marketing Mahogany | Campanhas nacionais, ativos oficiais, aprovação, visão da rede toda |
| Gestor regional | Grupo de lojas / região | Operações do grupo |
| Lojista / franqueado | Operação | Seu plano, estúdio, kits, mentorias, resultados da própria loja |
| Consultora | Venda direta (fase 2) | Kits e roteiros prontos, link pessoal |

## 4. Modelo de dados (esboço)

```
tenant ─┬─ tenant_theme
        ├─ region ── operation (loja / grupo) ── operation_member (perfil)
        ├─ national_campaign ── asset
        ├─ calendar_event (nacional | regional | local)
        ├─ monthly_plan (operation, mês) ── plan_item (ideia/roteiro/peça, status)
        ├─ mentoring_session ── attendance
        ├─ result_entry (plan_item, canal, métricas)
        └─ best_practice (origem: result_entry, curadoria, tags: formato/tema/região)
subscription (tenant | operation, plano: Essencial | Acompanhamento | Ativação | Inteligência)
```

Contratação é **por operação** (slide 17), então o plano vive na operação e libera módulos por feature flag.

## 5. MVP do piloto (proposta)

Objetivo: rodar 1–2 ciclos mensais com um grupo pequeno de operações e gerar os primeiros cases.

1. Multi-tenant + tema Mahogany + login por perfil
2. Cadastro de regiões e operações do piloto
3. Calendário nacional + local e **plano mensal por operação**
4. Estúdio simples: itens do plano com roteiro/legenda (IA opcional), status e aprovação
5. Kits & ativos: upload pela marca, download/cópia pela loja
6. Registro de resultado manual por item + **biblioteca de melhores práticas** curada pela Hub

Fica para depois: integração Instagram/Meta (métricas automáticas), app de consultora, dashboards de mídia paga,
WhatsApp API.

### Status (28/09/2026)

- [x] Multi-tenant + tema por tokens + login (senha ou link) + perfis com RLS (teste em `supabase/tests/rls_probe.sql`)
- [x] Regiões e operações (seed com as 20 lojas do estudo)
- [x] Calendário nacional/regional/local + plano mensal por operação com fluxo de aprovação
- [x] Equipe: convite por link (WhatsApp) com perfil e escopo; convidado cria a senha no 1º acesso
- [x] Estúdio v1: sugestões de peças por loja e "escrever com IA" roteiro/legenda, a partir da voz de marca do tenant (`brand_voices`)
- [x] Kits & ativos, Biblioteca de melhores práticas, registro de resultado (29/09/2026, ver `docs/NEST-plataforma.md`)
- [ ] Mentoria (agenda, trilhas, presença)

## 6. Design

Seguir os tokens do documento de marca (Source Sans 3 na UI, DM Serif Display só em título de página, cantos 4/8px,
densidade média-alta, sucesso em azul-petróleo, dourado nunca como texto sobre claro, tema escuro). Tom da interface
neutro e direto; a voz sensorial fica nas peças geradas.

## 7. Em aberto

- Quais operações entram no piloto e quem é o lojista usuário de cada uma
- A Mahogany (central) usa a ferramenta ou só a Hub opera no piloto?
- Métricas: manuais no piloto ou já puxar do Instagram?
- Manual de marca, logo SVG, licença de fontes; ano de fundação e nº de lojas/consultoras
