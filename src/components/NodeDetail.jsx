import { X, ArrowRight, ArrowLeft, ExternalLink, Copy } from 'lucide-react'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'

function formatValue(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  if (typeof v === 'string' && v.startsWith('http')) return (
    <a href={v} target="_blank" rel="noopener noreferrer"
      className="text-neo-400 underline underline-offset-2 flex items-center gap-1">
      {v.length > 40 ? v.slice(0, 40) + '…' : v}
      <ExternalLink size={10} />
    </a>
  )
  return String(v)
}

function copyRaw(v) {
  const text = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
  navigator.clipboard.writeText(text).catch(() => {})
}

function PropRow({ label, value }) {
  return (
    <div className="prop-row">
      <span className="text-xs text-slate-500 font-mono w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-200 break-all font-medium flex-1">{formatValue(value)}</span>
      <button onClick={() => copyRaw(value)}
        className="shrink-0 ml-1 p-1 rounded text-slate-600 active:text-slate-200 active:bg-slate-700">
        <Copy size={12}/>
      </button>
    </div>
  )
}

export default function NodeDetail({ node, relatedNodes, onClose, onNavigate }) {
  const { getColor, getDisplayProps } = useLabelSettings()
  if (!node) return null

  const props = node.properties || {}
  const title = getNodeTitle(node)
  const primaryLabel = (node.labels || [])[0]
  const displayProps = getDisplayProps(primaryLabel, props)

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 pt-safe">
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700 shrink-0"
          >
            <X size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 font-mono truncate">ID: {node.id}</p>
            <p className="text-slate-100 font-semibold truncate">{title}</p>
          </div>
          <button
            onClick={() => {
              const text = displayProps.map(([k, v]) => `${k}: ${v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join('\n')
              navigator.clipboard.writeText(text).catch(() => {})
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700 shrink-0"
            title="全プロパティをコピー"
          >
            <Copy size={15} />
          </button>
        </div>

        {/* ラベルバッジ */}
        <div className="flex flex-wrap gap-1.5 pb-3">
          {(node.labels || []).map(l => (
            <span
              key={l}
              className="badge text-white"
              style={{ backgroundColor: getColor(l) }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      {/* スクロールコンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {/* プロパティセクション */}
        <section className="px-4 pt-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            プロパティ ({displayProps.length})
          </h2>
          <div className="card px-4">
            {displayProps.length > 0
              ? displayProps.map(([k, v]) => (
                  <PropRow key={k} label={k} value={v} />
                ))
              : <p className="py-4 text-sm text-slate-500 text-center">プロパティなし</p>
            }
          </div>
        </section>

        {/* 関連ノードセクション */}
        {relatedNodes.length > 0 && (
          <section className="px-4 pt-6 pb-8">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              関連ノード ({relatedNodes.length})
            </h2>
            <div className="space-y-2">
              {relatedNodes.map(({ rel, node: other, direction }, i) => (
                <button
                  key={`${rel.id}-${i}`}
                  onClick={() => other && onNavigate(other)}
                  disabled={!other}
                  className="card card-active w-full text-left p-3 flex items-center gap-3 disabled:opacity-40"
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0
                    ${direction === 'out' ? 'bg-neo-900 text-neo-400' : 'bg-violet-900 text-violet-400'}`}>
                    {direction === 'out' ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-neo-400 font-semibold">{rel.type}</p>
                    {other
                      ? <>
                          <div className="flex gap-1 mt-0.5 flex-wrap">
                            {(other.labels || []).map(l => (
                              <span
                                key={l}
                                className="badge text-[10px] text-white"
                                style={{ backgroundColor: getColor(l) }}
                              >
                                {l}
                              </span>
                            ))}
                          </div>
                          <p className="text-sm text-slate-200 font-medium truncate mt-0.5">
                            {getNodeTitle(other)}
                          </p>
                        </>
                      : <p className="text-xs text-slate-500 mt-0.5">
                          ID: {direction === 'out' ? rel.endNode : rel.startNode}
                        </p>
                    }
                    {Object.keys(rel.properties || {}).length > 0 && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate">
                        {Object.entries(rel.properties).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {relatedNodes.length === 0 && (
          <div className="px-4 pt-6 pb-8">
            <p className="text-sm text-slate-600 text-center py-6 border border-slate-800 rounded-2xl">
              関連ノードなし
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
