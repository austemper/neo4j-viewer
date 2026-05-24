import { useState } from 'react'
import { Sparkles, Loader, X, ArrowLeft } from 'lucide-react'
import { loadGeminiSettings, callGemini, calcCost, buildNodePrompt, buildPathPrompt } from './useGemini'

// ---- 簡易マークダウンレンダラー -------------------------------------------

function renderInline(text) {
  // **bold** を処理
  const parts = text.split(/\*\*(.*?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="text-slate-100 font-semibold">{part}</strong>
      : part
  )
}

function renderMarkdown(text) {
  const lines = text.split('\n')
  const result = []

  lines.forEach((line, i) => {
    if (line.startsWith('#### ')) {
      result.push(
        <p key={i} className="text-sm font-semibold text-slate-200 mt-3 mb-0.5">{line.slice(5)}</p>
      )
    } else if (line.startsWith('### ')) {
      result.push(
        <p key={i} className="text-base font-semibold text-slate-100 mt-4 mb-1">{line.slice(4)}</p>
      )
    } else if (line.startsWith('## ')) {
      result.push(
        <p key={i} className="text-lg font-bold text-white mt-5 mb-1">{line.slice(3)}</p>
      )
    } else if (line.startsWith('# ')) {
      result.push(
        <p key={i} className="text-xl font-bold text-white mt-5 mb-2">{line.slice(2)}</p>
      )
    } else if (/^[-*]\s/.test(line)) {
      result.push(
        <div key={i} className="flex items-start gap-2.5 my-1">
          <span className="text-violet-400 mt-[3px] shrink-0 text-base leading-none">•</span>
          <span className="text-sm text-slate-200 leading-relaxed flex-1">{renderInline(line.replace(/^[-*]\s/, ''))}</span>
        </div>
      )
    } else if (/^\d+\.\s/.test(line)) {
      const num = line.match(/^(\d+)\.\s/)[1]
      result.push(
        <div key={i} className="flex items-start gap-2.5 my-1">
          <span className="text-violet-400 text-xs font-bold mt-0.5 shrink-0 w-4 text-right">{num}.</span>
          <span className="text-sm text-slate-200 leading-relaxed flex-1">{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      )
    } else if (line.trim() === '') {
      result.push(<div key={i} className="h-2" />)
    } else if (line.startsWith('---') || line.startsWith('===')) {
      result.push(<hr key={i} className="border-slate-700 my-3" />)
    } else {
      result.push(
        <p key={i} className="text-sm text-slate-200 leading-[1.75]">{renderInline(line)}</p>
      )
    }
  })

  return result
}

// ---- 全画面結果ビューア -------------------------------------------------------

function ResultViewer({ result, cost, promptName, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 shrink-0">
        <div className="flex items-center gap-3 py-3">
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700 shrink-0">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-violet-400 shrink-0" />
              <p className="text-xs text-violet-400 font-medium">Gemini AI 解析結果</p>
            </div>
            <p className="text-sm text-slate-200 font-semibold truncate">{promptName}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 active:text-slate-300 shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 結果本文（スクロール可能） */}
      <div className="flex-1 overflow-y-auto px-5 py-4 pb-10">
        <div className="space-y-0.5">
          {renderMarkdown(result)}
        </div>

        {/* コスト */}
        {cost && (
          <div className="mt-6 pt-4 border-t border-slate-800">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <span className="text-slate-500 font-medium">利用コスト目安</span><br />
              約 ¥{cost.jpy.toFixed(4)}（${cost.usd.toFixed(6)}）<br />
              入力 {cost.inputTokens.toLocaleString()} トークン・
              出力 {cost.outputTokens.toLocaleString()} トークン<br />
              ※ Gemini 2.5 Flash 非公式目安（$0.15/1M入力・$0.60/1M出力）
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- メインコンポーネント ---------------------------------------------------

export default function GeminiAnalysis({ node, pathNodes, pathRels }) {
  const settings = loadGeminiSettings()
  const [selectedId, setSelectedId] = useState(settings.prompts[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [cost, setCost] = useState(null)
  const [showViewer, setShowViewer] = useState(false)

  if (!settings.apiKey || settings.prompts.length === 0) return null

  const selectedPrompt = settings.prompts.find(p => p.id === selectedId)

  const run = async () => {
    if (!selectedPrompt) return
    const fullText = node
      ? buildNodePrompt(selectedPrompt.prompt, node)
      : buildPathPrompt(selectedPrompt.prompt, pathNodes, pathRels)

    setLoading(true)
    setError(null)
    setResult(null)
    setCost(null)

    try {
      const res = await callGemini(settings.apiKey, settings.modelId, fullText)
      setResult(res.text)
      setCost(calcCost(res.inputTokens, res.outputTokens))
      setShowViewer(true) // 完了後に自動で全画面表示
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* コンパクトなボタン行 */}
      <div className="px-4 py-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* プロンプト選択 */}
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs
              rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500"
          >
            {settings.prompts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          {/* 結果を見るボタン（結果あり時） */}
          {result && !loading && (
            <button
              onClick={() => setShowViewer(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg
                bg-violet-900/50 border border-violet-700/50 text-violet-300 text-xs font-medium
                active:bg-violet-900 shrink-0"
            >
              <Sparkles size={11} /> 結果
            </button>
          )}

          {/* 解析ボタン */}
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              bg-violet-600 text-white text-xs font-semibold active:bg-violet-700
              disabled:opacity-50 shrink-0"
          >
            {loading
              ? <Loader size={12} className="animate-spin" />
              : <Sparkles size={12} />}
            {loading ? '解析中' : '解析'}
          </button>
        </div>

        {/* エラー */}
        {error && (
          <p className="text-xs text-rose-400 mt-2 leading-relaxed">{error}</p>
        )}
      </div>

      {/* 全画面結果ビューア */}
      {showViewer && result && (
        <ResultViewer
          result={result}
          cost={cost}
          promptName={selectedPrompt?.name ?? ''}
          onClose={() => setShowViewer(false)}
        />
      )}
    </>
  )
}
