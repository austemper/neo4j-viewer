import { useMemo } from 'react'
import { Route, ChevronRight } from 'lucide-react'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'

// cardTitleProp を考慮したタイトル取得
function useCardTitle() {
  const { getCardTitleProp } = useLabelSettings()
  return (node) => {
    const label = (node.labels || ['?'])[0]
    const prop = getCardTitleProp(label)
    return prop ? String(node.properties?.[prop] ?? getNodeTitle(node)) : getNodeTitle(node)
  }
}

// ---- コンパクトビュー --------------------------------------------------------
// 1行 = ラベルドット + タイトル + 関係数 + 経路探索ボタン

export function CompactView({ nodes, relCountMap, onNodeClick, onPathExplore }) {
  const { getColor } = useLabelSettings()
  const getTitle = useCardTitle()

  return (
    <div className="bg-slate-900 rounded-2xl overflow-hidden">
      {nodes.map(node => {
        const label = (node.labels || ['?'])[0]
        const color = getColor(label)
        const title = getTitle(node)
        const relCount = relCountMap[node.id] || 0

        return (
          <div key={node.id} className="relative flex items-center border-b border-slate-800/50 last:border-0">
            <button onClick={() => onNodeClick(node)}
              className="flex items-center gap-2.5 px-4 py-2.5 flex-1 min-w-0 active:bg-slate-800/40">
              <span
                className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: color }}
              >
                {label[0]?.toUpperCase()}
              </span>
              <span className="text-sm text-slate-200 truncate flex-1">{title}</span>
              {relCount > 0 && (
                <span className="text-[10px] text-slate-600 shrink-0 mr-1">{relCount}</span>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onPathExplore(node) }}
              className="px-3 py-2.5 text-slate-700 active:text-slate-500 shrink-0"
            >
              <Route size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ---- ギャラリービュー --------------------------------------------------------
// 2カラムグリッド。大きいラベルアイコン + タイトル + ラベルバッジ

export function GalleryView({ nodes, onNodeClick }) {
  const { getColor } = useLabelSettings()
  const getTitle = useCardTitle()

  return (
    <div className="grid grid-cols-2 gap-2">
      {nodes.map(node => {
        const label = (node.labels || ['?'])[0]
        const color = getColor(label)
        const title = getTitle(node)

        return (
          <button
            key={node.id}
            onClick={() => onNodeClick(node)}
            className="card card-active p-3 flex flex-col items-center gap-2 text-center min-h-[110px] justify-center"
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: color }}
            >
              {label[0]?.toUpperCase()}
            </div>
            <p className="text-xs text-slate-100 font-semibold leading-snug line-clamp-2 w-full">{title}</p>
            <div className="flex flex-wrap gap-0.5 justify-center">
              {(node.labels || []).map(l => (
                <span key={l} className="badge text-white" style={{ backgroundColor: getColor(l), fontSize: '9px' }}>
                  {l}
                </span>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---- テーブルビュー ----------------------------------------------------------
// 横スクロール可能なスプレッドシート風。最初の列は固定。

function getTableColumns(nodes, activeLabel, settings) {
  if (activeLabel !== 'すべて') {
    const cfg = settings[activeLabel]
    const keys = new Set()
    nodes.filter(n => (n.labels || []).includes(activeLabel))
      .forEach(n => Object.keys(n.properties || {}).forEach(k => keys.add(k)))
    if (cfg?.propOrder) {
      const hidden = new Set(cfg.hidden || [])
      const ordered = cfg.propOrder.filter(k => keys.has(k) && !hidden.has(k))
      const rest = Array.from(keys).filter(k => !cfg.propOrder.includes(k))
      return [...ordered, ...rest].slice(0, 7)
    }
    return Array.from(keys).slice(0, 7)
  }
  // すべて: 全ノードで使用頻度上位5プロパティ
  const freq = {}
  nodes.forEach(n => Object.keys(n.properties || {}).forEach(k => { freq[k] = (freq[k] || 0) + 1 }))
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k)
}

export function TableView({ nodes, activeLabel, onNodeClick }) {
  const { getColor, settings } = useLabelSettings()
  const getTitle = useCardTitle()

  const columns = useMemo(
    () => getTableColumns(nodes, activeLabel, settings),
    [nodes, activeLabel, settings]
  )

  if (!nodes.length) return null

  return (
    <div className="overflow-x-auto scrollbar-thin -mx-4">
      <table className="min-w-full" style={{ tableLayout: 'fixed', minWidth: 280 + columns.length * 120 }}>
        <thead>
          <tr className="border-b border-slate-700">
            <th className="text-left px-4 py-2 text-xs text-slate-500 font-semibold whitespace-nowrap"
              style={{ width: 160, position: 'sticky', left: 0, backgroundColor: '#020617' }}>
              ノード
            </th>
            {columns.map(col => (
              <th key={col}
                className="text-left px-3 py-2 text-xs text-slate-500 font-semibold font-mono whitespace-nowrap"
                style={{ width: 120 }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map(node => {
            const label = (node.labels || ['?'])[0]
            const color = getColor(label)
            const title = getTitle(node)

            return (
              <tr
                key={node.id}
                onClick={() => onNodeClick(node)}
                className="border-b border-slate-800/50 active:bg-slate-800/40 cursor-pointer"
              >
                {/* 固定列 */}
                <td className="px-4 py-2.5"
                  style={{ position: 'sticky', left: 0, backgroundColor: '#020617', width: 160 }}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {label[0]?.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-200 truncate">{title}</span>
                  </div>
                </td>
                {columns.map(col => {
                  const val = node.properties?.[col]
                  return (
                    <td key={col} className="px-3 py-2.5" style={{ width: 120 }}>
                      <span className="text-xs text-slate-400 font-mono block truncate">
                        {val != null ? String(val).slice(0, 30) : <span className="text-slate-700">—</span>}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
