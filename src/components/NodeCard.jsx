import { ChevronRight } from 'lucide-react'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'

function formatValue(v) {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? '✓ true' : '✗ false'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function NodeCard({ node, relCount, onClick }) {
  const { getColor, getPreviewProps, getCardTitleProp } = useLabelSettings()
  const props = node.properties || {}
  const primaryLabel = (node.labels || ['?'])[0]
  const color = getColor(primaryLabel)
  const cardTitleProp = getCardTitleProp(primaryLabel)
  const title = cardTitleProp
    ? String(props[cardTitleProp] ?? getNodeTitle(node))
    : getNodeTitle(node)
  const previewProps = getPreviewProps(primaryLabel, props, title)

  return (
    <div className="card">
      <button
        onClick={onClick}
        onContextMenu={e => e.preventDefault()}
        className="card-active w-full text-left p-4 flex items-start gap-3"
        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
      >
        {/* ラベルアイコン */}
        <div className="shrink-0 mt-0.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white"
            style={{ backgroundColor: color }}
          >
            {primaryLabel[0]?.toUpperCase() ?? '?'}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1 mb-1.5">
            {(node.labels || []).map(l => (
              <span key={l} className="badge text-white" style={{ backgroundColor: getColor(l) }}>{l}</span>
            ))}
          </div>
          <p className="text-slate-100 font-semibold text-sm truncate">{title}</p>
          {previewProps.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {previewProps.map(([k, v]) => (
                <p key={k} className="text-xs text-slate-400 truncate">
                  <span className="text-slate-500">{k}:</span> {formatValue(v)}
                </p>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2">
            <span className="text-xs text-slate-500">{Object.keys(props).length} プロパティ</span>
            {relCount > 0 && (
              <span className="text-xs" style={{ color }}>{relCount} 関係</span>
            )}
          </div>
        </div>

        <ChevronRight size={16} className="text-slate-600 shrink-0 mt-2" />
      </button>
    </div>
  )
}
