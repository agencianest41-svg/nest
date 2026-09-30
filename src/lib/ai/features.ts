// Funções de IA da plataforma. Cada uma liga/desliga por tenant (ai_settings.features)
// e tem instruções padrão que o Hub pode sobrescrever por tenant (ai_prompts).

export type AiFeature =
  | "estudio.sugerir"
  | "estudio.escrever"
  | "marca.checar"
  | "relatorio.resumo"
  | "resultado.insights"
  | "biblioteca.case"
  | "brief.gerar"
  | "base.gerar";

export const AI_FEATURES: Record<AiFeature, { label: string; description: string; instructions: string }> = {
  "estudio.sugerir": {
    label: "Estúdio · sugerir peças",
    description: "Sugere peças do plano mensal a partir do calendário, da cidade e da marca.",
    instructions: [
      "Sugira peças ou ações para o plano deste mês da loja, distribuídas ao longo do mês e ancoradas nas datas do calendário.",
      "Misture formatos (reels, carrossel, stories, whatsapp, evento, acao_loja) e inclua pelo menos uma ação que traga cliente para dentro da loja.",
      "Use a cidade e o clima da região quando fizer sentido. scheduled_on deve estar dentro do mês.",
      "event_title é o título exato do evento do calendário que a peça ativa, ou null.",
      "why explica em uma frase por que a peça faz sentido para esta loja.",
      "script é o roteiro (ou a mensagem, para whatsapp; ou o passo a passo, para evento e ação na loja). caption é a legenda do post (vazia para whatsapp e ação na loja).",
    ].join("\n"),
  },
  "estudio.escrever": {
    label: "Estúdio · escrever roteiro e legenda",
    description: "Escreve roteiro e legenda de uma peça, na voz da marca.",
    instructions: [
      "Escreva o roteiro e a legenda da peça indicada.",
      "script: roteiro (ou mensagem, para whatsapp; ou passo a passo, para evento e ação na loja). caption: legenda do post, vazia se não se aplicar.",
      "Roteiros para celular: gancho nos 3 primeiros segundos, 15 a 30 segundos, indicações simples de enquadramento e luz.",
    ].join("\n"),
  },
  "marca.checar": {
    label: "Guardião de marca",
    description: "Revisa um texto contra voz, regras e exemplos da marca e sugere ajustes.",
    instructions: [
      "Revise o texto contra a voz, as regras e os exemplos da marca.",
      "Liste problemas concretos (trecho, por que fere a marca, como corrigir). Não invente regras que não estejam no contexto.",
      "score de 0 a 100 indica aderência à marca. rewrite é uma versão corrigida mantendo a intenção original.",
    ].join("\n"),
  },
  "relatorio.resumo": {
    label: "Relatório · resumo executivo",
    description: "Escreve o resumo executivo do mês a partir dos números da operação.",
    instructions: [
      "Escreva um resumo executivo do mês para o cliente, em até 5 parágrafos curtos.",
      "Comece pelo que foi entregue versus o contratado, depois resultados, destaques, riscos e próximos passos.",
      "Use só os números fornecidos; não invente métricas. Tom direto e profissional.",
    ].join("\n"),
  },
  "resultado.insights": {
    label: "Resultados · leitura do mês",
    description: "Lê os resultados por operação e aponta padrões, destaques e ajustes.",
    instructions: [
      "Analise os resultados das peças e operações do mês.",
      "Aponte até 5 padrões (formato, tema, dia, cidade) com o dado que sustenta cada um, e até 3 ajustes práticos para o próximo plano.",
      "Não invente números; se os dados forem poucos, diga isso.",
    ].join("\n"),
  },
  "biblioteca.case": {
    label: "Biblioteca · escrever case",
    description: "Transforma uma peça com bom resultado em case replicável.",
    instructions: [
      "Transforme a peça e seus resultados em um case para a Biblioteca de melhores práticas.",
      "summary: o que foi feito, em 2 frases. why_it_worked: por que funcionou, citando os números. how_to_replicate: passo a passo para outra loja repetir.",
      "tags: até 5 palavras-chave curtas (formato, tema, momento).",
    ].join("\n"),
  },
  "brief.gerar": {
    label: "Parceiros · gerar brief",
    description: "Escreve o brief para um freelancer a partir da etapa do projeto e da marca.",
    instructions: [
      "Escreva um brief claro para um profissional externo executar a entrega.",
      "Inclua objetivo, entregáveis (formatos e quantidades), referências da marca, o que evitar e critérios de aprovação.",
      "Seja específico e curto; o parceiro não conhece a marca.",
    ].join("\n"),
  },
  "base.gerar": {
    label: "Calendário-base · gerar mês",
    description: "Gera o calendário-base da rede para o mês, a partir das campanhas, editorias, pacotes e cases.",
    instructions: [
      "Monte o calendário-base do mês para toda a rede de lojas: as pautas que cada loja vai criar e publicar.",
      "Cada pauta é para qualquer loja da rede: nada de cidade, bairro ou nome de loja; a adaptação local vem depois.",
      "Ancore as pautas nas campanhas e datas do calendário, distribua pelo mês (sem dois posts no mesmo dia) e respeite o peso de cada editoria.",
      "min_tier indica o menor pacote que recebe a pauta: as mais importantes são essencial; as extras vão para os pacotes maiores, até fechar o volume de cada um.",
      "why explica em uma frase por que a rede deve postar isso agora. Use os cases da Biblioteca como referência do que já funcionou.",
      "sensitive = true quando a pauta fala de preço, promoção, condição comercial ou tema regulatório.",
    ].join("\n"),
  },
};

export const AI_FEATURE_KEYS = Object.keys(AI_FEATURES) as AiFeature[];

// Modelo padrão via Vercel AI Gateway; o tenant pode trocar em ai_settings.model.
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
