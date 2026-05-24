const STORAGE_KEY = 'neo4j_gemini_settings'

export const DEFAULT_SETTINGS = {
  apiKey: '',
  modelId: 'gemini-2.5-flash',
  // PDF文字選択 → Gemini遷移時に選択テキストの前に付けるプロンプト
  pdfPrompt: '以下のテキストについて、意味・読み方・使い方を日本語で簡潔に説明してください：',
  prompts: [
    { id: '1', name: '概要説明', prompt: 'このノードについて、その役割・特徴・他要素との関係性を日本語で簡潔に説明してください。' },
    { id: '2', name: '活用提案', prompt: 'このノードを活用したユースケースや応用例を3つ提案してください。' },
    { id: '3', name: '経路解説', prompt: 'この経路（ノード間のつながり）が示す意味・関係性を日本語で解説してください。' },
  ]
}

export function loadGeminiSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

export function saveGeminiSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

// Gemini API 呼び出し
export async function callGemini(apiKey, modelId, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const textOut = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const usage = data.usageMetadata ?? {}

  return {
    text: textOut,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  }
}

// コスト計算（Gemini 2.5 Flash 想定）
// 入力: $0.15/1M tokens, 出力: $0.60/1M tokens
const INPUT_USD = 0.15 / 1_000_000
const OUTPUT_USD = 0.60 / 1_000_000
const JPY_RATE = 150

export function calcCost(inputTokens, outputTokens) {
  const usd = inputTokens * INPUT_USD + outputTokens * OUTPUT_USD
  return { usd, jpy: usd * JPY_RATE, inputTokens, outputTokens }
}

// ノードデータをプロンプトに埋め込む
export function buildNodePrompt(promptText, node) {
  const labels = (node.labels || []).join(', ')
  const props = Object.entries(node.properties || {})
    .map(([k, v]) => `  ${k}: ${String(v).slice(0, 300)}`)
    .join('\n')
  return `${promptText}\n\n---\n対象ノード:\nラベル: ${labels}\n\nプロパティ:\n${props || '  （なし）'}`
}

// 経路データをプロンプトに埋め込む
export function buildPathPrompt(promptText, pathNodes, pathRels) {
  const lines = pathNodes.map((node, i) => {
    const label = (node.labels || ['?'])[0]
    const title = Object.values(node.properties || {})[0] ?? `Node#${i}`
    const rel = pathRels[i]?.type
    return rel ? `[${label}] ${title}\n  ↓ ${rel}` : `[${label}] ${title}`
  }).join('\n')
  return `${promptText}\n\n---\n対象経路（${pathNodes.length - 1} hop）:\n${lines}`
}


// Neo4j API 設定
const NEO4J_API_KEY = 'neo4j_api_settings_v1'
export function loadNeo4jApiSettings() {
  try { const s = localStorage.getItem(NEO4J_API_KEY); return s ? JSON.parse(s) : { url: '' } }
  catch { return { url: '' } }
}
export function saveNeo4jApiSettings(s) {
  localStorage.setItem(NEO4J_API_KEY, JSON.stringify(s))
}
