import { useRef, useState } from 'react'
import { ArrowRight, ArrowLeft, ExternalLink, ChevronRight, Search } from 'lucide-react'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'
import GeminiAnalysis from './GeminiAnalysis'


function formatValue(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  if (typeof v === 'string' && v.startsWith('http')) return (
    <a href={v} target="_blank" rel="noopener noreferrer"
      className="text-neo-400 underline underline-offset-2 inline-flex items-center gap-1">
      {v.length > 40 ? v.slice(0, 40) + '…' : v}
      <ExternalLink size={10} />
    </a>
  )
  return String(v)
}

export default function NodePopup({ node, relatedNodes, onClose, onNavigate, onPathExplore }) {
  const { getColor, getDisplayProps } = useLabelSettings()
  const touchRef = useRef({})
  const [swipeHint, setSwipeHint] = useState(null)

  if (!node) return null

  const props = node.properties || {}
  const primaryLabel = (node.labels || ['?'])[0]
  const title = getNodeTitle(node)
  const displayProps = getDisplayProps(primaryLabel, props)

  // ---- 水平スワイプ検出（コンテンツエリアのみ） ----
  const onTouchStart = (e) => {
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      decided: false,
      isHorizontal: false,
    }
    setSwipeHint(null)
  }

  const onTouchMove = (e) => {
    const tr = touchRef.current
    const dx = e.touches[0].clientX - tr.startX
    const dy = e.touches[0].clientY - tr.startY
    if (!tr.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      tr.decided = true
      tr.isHorizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (tr.isHorizontal) {
      const hint = dx < -30 ? 'close' : dx > 30 ? 'explore' : null
      setSwipeHint(hint)
    }
  }

  const onTouchEnd = (e) => {
    const tr = touchRef.current
    if (tr.isHorizontal) {
      const dx = e.changedTouches[0].clientX - tr.startX
      const dy = e.changedTouches[0].clientY - tr.startY
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        setSwipeHint(null)
        if (dx < 0) { onClose(); return }
        if (dx > 0 && onPathExplore) { onPathExplore(); return }
      }
    }
    setSwipeHint(null)
    touchRef.current = {}
  }

  return (
    <>
    {/* 背景オーバーレイ：タップで閉じる */}
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 bg-slate-950/75"
      onClick={onClose}
    >
      {/* モーダル本体：タップ伝播を止める */}
      <div
        className="relative w-full max-w-lg flex flex-col bg-slate-900 rounded-2xl
          border border-slate-700 shadow-2xl overflow-hidden"
        style={{ maxHeight: '88vh' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* ---- ヘッダー（固定） ---- */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-800">
          {/* ラベルバッジ + ボタン群 */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap gap-1.5 flex-1">
              {(node.labels || []).map(l => (
                <span key={l} className="badge text-white text-xs" style={{ backgroundColor: getColor(l) }}>
                  {l}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Google 検索 */}
              <a
                href={`https://www.google.com/search?q=${encodeURIComponent(title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 flex items-center justify-center rounded-xl
                  bg-slate-800 text-slate-400 active:bg-slate-700"
                title={`「${title}」をGoogle検索`}
              >
                <Search size={14} />
              </a>
            </div>
          </div>

          {/* ノードタイトル */}
          <p className="text-slate-100 font-bold text-base leading-snug">{title}</p>

          {/* スワイプヒント */}
          <div className="flex items-center justify-between mt-2.5">
            <span className={`flex items-center gap-1 text-xs transition-colors duration-150
              ${swipeHint === 'close' ? 'text-rose-400' : 'text-slate-600'}`}>
              <ArrowLeft size={11} /> 閉じる
            </span>
            <span className={`flex items-center gap-1 text-xs transition-colors duration-150
              ${swipeHint === 'explore' ? 'text-neo-400' : 'text-slate-600'}`}>
              経路探索 <ArrowRight size={11} />
            </span>
          </div>
        </div>

        {/* ---- スクロール可能なコンテンツ ---- */}
        <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
          {/* Gemini 解析（プロパティの上） */}
          <GeminiAnalysis node={node} />

          {/* プロパティ */}
          {displayProps.length > 0 && (
            <div className="px-4 pt-3 pb-2">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-2">
                プロパティ
              </p>
              <div className="space-y-2">
                {displayProps.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="text-slate-500 font-mono text-xs w-24 shrink-0 pt-0.5">{k}</span>
                    <span className="text-slate-200 break-all flex-1 text-sm">{formatValue(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 関連ノード */}
          {relatedNodes.length > 0 && (
            <div className="px-4 pt-2 pb-5">
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest mb-2">
                関連ノード ({relatedNodes.length})
              </p>
              <div className="space-y-1.5">
                {relatedNodes.map(({ rel, node: other, direction }, i) => (
                  <button
                    key={`${rel.id}-${i}`}
                    onClick={() => other && onNavigate(other)}
                    disabled={!other}
                    className="card card-active w-full text-left p-2.5 flex items-center gap-2.5 disabled:opacity-40"
                  >
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0
                      ${direction === 'out' ? 'bg-neo-900 text-neo-400' : 'bg-violet-900 text-violet-400'}`}>
                      {direction === 'out' ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-neo-400 leading-tight">{rel.type}</p>
                      {other && (
                        <p className="text-xs text-slate-300 truncate mt-0.5">{getNodeTitle(other)}</p>
                      )}
                    </div>
                    <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayProps.length === 0 && relatedNodes.length === 0 && (
            <p className="px-4 py-6 text-slate-600 text-sm text-center">プロパティなし</p>
          )}
        </div>
      </div>
    </div>

    </>
  )
}
