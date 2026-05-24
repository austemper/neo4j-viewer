import { useMemo, useState, useCallback } from 'react'
import {
  BarChart3, Network, ArrowRightLeft, Hash, Unlink, LayoutDashboard,
  AlignLeft, PieChart, TrendingUp,
} from 'lucide-react'
import { useLabelSettings } from './LabelSettingsContext'
import { getNodeTitle } from './useNeo4jData'

// ---- チャートタイプ永続化 ----------------------------------------------------

const CHART_TYPES_KEY = 'neo4j_widget_chart_types'

function useChartType(widgetId, defaultType) {
  const [type, setType] = useState(() => {
    try {
      const s = localStorage.getItem(CHART_TYPES_KEY)
      return s ? (JSON.parse(s)[widgetId] ?? defaultType) : defaultType
    } catch { return defaultType }
  })
  const update = useCallback((t) => {
    setType(t)
    try {
      const s = localStorage.getItem(CHART_TYPES_KEY)
      localStorage.setItem(CHART_TYPES_KEY, JSON.stringify({ ...(s ? JSON.parse(s) : {}), [widgetId]: t }))
    } catch {}
  }, [widgetId])
  return [type, update]
}

// ---- チャートコンポーネント --------------------------------------------------

function HBarChart({ items, maxItems = 12 }) {
  const shown = items.slice(0, maxItems)
  const max = Math.max(...shown.map(i => i.value), 1)
  return (
    <div className="space-y-2">
      {shown.map((item, i) => (
        <div key={i}>
          <div className="flex items-center gap-1.5 mb-0.5">
            {item.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />}
            <span className="text-xs text-slate-400 flex-1 truncate">{item.label}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-500 w-8 text-right">{item.value}</span>
              {item.onTap && <button onClick={item.onTap} className="text-[10px] text-neo-400 active:text-neo-300">→</button>}
            </div>
          </div>
          <div className="h-3 bg-slate-800 rounded-sm overflow-hidden">
            <div className="h-full rounded-sm" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: item.color || '#3b82f6', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      ))}
      {items.length > maxItems && <p className="text-[10px] text-slate-600 text-right">他 {items.length - maxItems} 件</p>}
    </div>
  )
}

function VBarChart({ items, maxItems = 12 }) {
  const shown = items.slice(0, maxItems)
  const max = Math.max(...shown.map(i => i.value), 1)
  const BAR_H = 80
  return (
    <div className="overflow-x-auto scrollbar-hide">
      <div className="flex items-end gap-2 pb-1" style={{ minHeight: BAR_H + 32, minWidth: shown.length * 44 }}>
        {shown.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5 shrink-0" style={{ width: 40 }}
            onClick={item.onTap}>
            <span className="text-[9px] text-slate-500 tabular-nums">{item.value}</span>
            <div className="w-7 rounded-t-sm" style={{
              height: Math.max(2, (item.value / max) * BAR_H),
              backgroundColor: item.color || '#3b82f6',
              transition: 'height 0.6s ease',
            }} />
            <span className="text-[9px] text-slate-500 text-center w-full truncate block">
              {item.label.length > 6 ? item.label.slice(0, 6) + '…' : item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ items }) {
  const shown = items.slice(0, 8)
  const total = items.reduce((s, i) => s + i.value, 0)
  if (!total) return null
  const shownTotal = shown.reduce((s, i) => s + i.value, 0)
  const segs = [
    ...shown,
    ...(shownTotal < total ? [{ label: 'その他', value: total - shownTotal, color: '#475569' }] : [])
  ]

  const SIZE = 110, cx = 55, cy = 55, outerR = 44, innerR = 27
  let cum = -Math.PI / 2
  const paths = segs.map(seg => {
    const a = (seg.value / total) * 2 * Math.PI
    const start = cum; cum += a
    const [c0, s0] = [Math.cos(start), Math.sin(start)]
    const [c1, s1] = [Math.cos(cum), Math.sin(cum)]
    const large = a > Math.PI ? 1 : 0
    return {
      d: `M ${cx + outerR * c0} ${cy + outerR * s0} A ${outerR} ${outerR} 0 ${large} 1 ${cx + outerR * c1} ${cy + outerR * s1} L ${cx + innerR * c1} ${cy + innerR * s1} A ${innerR} ${innerR} 0 ${large} 0 ${cx + innerR * c0} ${cy + innerR * s0} Z`,
      color: seg.color || '#3b82f6',
      label: seg.label,
      value: seg.value,
    }
  })

  return (
    <div className="flex items-center gap-3">
      <svg width={SIZE} height={SIZE} className="shrink-0">
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="#94a3b8" fontSize="8">合計</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#f1f5f9" fontSize="13" fontWeight="bold">{total}</text>
      </svg>
      <div className="flex-1 space-y-1 min-w-0">
        {segs.slice(0, 7).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: seg.color || '#3b82f6' }} />
            <span className="text-[11px] text-slate-400 flex-1 truncate">{seg.label}</span>
            <span className="text-[11px] text-slate-500 shrink-0">{((seg.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChart({ items, maxItems = 15 }) {
  const shown = items.slice(0, maxItems)
  const max = Math.max(...shown.map(i => i.value), 1)
  const W = 280, H = 90, pt = 12, pr = 8, pb = 20, pl = 28
  const w = W - pl - pr, h = H - pt - pb
  const pts = shown.map((item, i) => ({
    x: pl + (i / Math.max(shown.length - 1, 1)) * w,
    y: pt + (1 - item.value / max) * h,
    ...item,
  }))
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - pb} L ${pts[0].x.toFixed(1)} ${H - pb} Z`

  return (
    <div className="overflow-x-auto scrollbar-hide">
      <svg width={W} height={H}>
        <path d={area} fill="#3b82f618" />
        <path d={line} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#3b82f6" />)}
        <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="#1e293b" strokeWidth="1" />
        <text x={pl - 2} y={pt + 3} textAnchor="end" fill="#475569" fontSize="7">{max}</text>
        <text x={pl - 2} y={H - pb} textAnchor="end" fill="#475569" fontSize="7">0</text>
        {pts.length > 1 && [0, pts.length - 1].map(i => (
          <text key={i} x={pts[i].x} y={H - 3} textAnchor="middle" fill="#475569" fontSize="7">
            {(pts[i].label || '').slice(0, 6)}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ---- ウィジェット -------------------------------------------------------------

const CHART_DEFS = {
  hbar:  { icon: AlignLeft,  label: '横棒' },
  vbar:  { icon: BarChart3,  label: '縦棒' },
  donut: { icon: PieChart,   label: '円グラフ' },
  line:  { icon: TrendingUp, label: '折れ線' },
}

function DistributionWidget({ id, title, Icon, items, types = ['hbar', 'vbar', 'donut'] }) {
  const [chartType, setChartType] = useChartType(id, types[0])
  const empty = items.length === 0

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-neo-400 shrink-0" />
        <h2 className="text-sm font-semibold text-slate-200 flex-1">{title}</h2>
        {!empty && (
          <div className="flex gap-0.5 shrink-0">
            {types.map(t => {
              const TypeIcon = CHART_DEFS[t].icon
              return (
                <button key={t} onClick={() => setChartType(t)} title={CHART_DEFS[t].label}
                  className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors
                    ${chartType === t ? 'bg-neo-600 text-white' : 'text-slate-600 active:text-slate-400'}`}>
                  <TypeIcon size={11} />
                </button>
              )
            })}
          </div>
        )}
      </div>
      {empty
        ? <p className="text-sm text-slate-600 text-center py-4">データなし</p>
        : chartType === 'hbar'  ? <HBarChart items={items} />
        : chartType === 'vbar'  ? <VBarChart items={items} />
        : chartType === 'donut' ? <DonutChart items={items} />
        : <LineChart items={items} />
      }
    </div>
  )
}

// ---- ダッシュボード本体 -------------------------------------------------------

export default function Dashboard({ nodes, relationships, onNodeSelect }) {
  const { getColor, getCardTitleProp } = useLabelSettings()

  // cardTitleProp を反映したタイトル取得
  const getCardTitle = useCallback((node) => {
    const label = (node.labels || ['?'])[0]
    const prop = getCardTitleProp(label)
    return prop ? String(node.properties?.[prop] ?? getNodeTitle(node)) : getNodeTitle(node)
  }, [getCardTitleProp])

  // ラベル分布
  const labelStats = useMemo(() => {
    const counts = {}
    nodes.forEach(n => (n.labels || []).forEach(l => { counts[l] = (counts[l] || 0) + 1 }))
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value, color: getColor(label) }))
      .sort((a, b) => b.value - a.value)
  }, [nodes, getColor])

  // リレーションタイプ分布（ランダム色）
  const relTypeStats = useMemo(() => {
    const counts = {}
    relationships.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1 })
    const palette = ['#3b82f6','#8b5cf6','#f59e0b','#f43f5e','#0ea5e9','#10b981','#f97316','#ec4899']
    return Object.entries(counts)
      .map(([label, value], i) => ({ label, value, color: palette[i % palette.length] }))
      .sort((a, b) => b.value - a.value)
  }, [relationships])

  // 接続数ランキング Top10（cardTitleProp 反映）
  const connectivityRanking = useMemo(() => {
    const counts = {}
    relationships.forEach(r => {
      counts[r.startNode] = (counts[r.startNode] || 0) + 1
      counts[r.endNode] = (counts[r.endNode] || 0) + 1
    })
    return nodes
      .filter(n => counts[n.id])
      .map(n => ({
        label: getCardTitle(n),
        value: counts[n.id] || 0,
        color: getColor((n.labels || ['?'])[0]),
        onTap: () => onNodeSelect?.(n),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [nodes, relationships, getColor, getCardTitle, onNodeSelect])

  // ラベル間接続パターン Top10
  const labelPairs = useMemo(() => {
    const nodeLabel = new Map(nodes.map(n => [n.id, (n.labels || ['?'])[0]]))
    const pairs = {}
    relationships.forEach(r => {
      const sl = nodeLabel.get(r.startNode), el = nodeLabel.get(r.endNode)
      if (!sl || !el) return
      const key = `${sl} →[${r.type}]→ ${el}`
      pairs[key] = (pairs[key] || 0) + 1
    })
    return Object.entries(pairs)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [nodes, relationships])

  // 平均プロパティ数
  const avgPropsStats = useMemo(() => {
    const sums = {}, counts = {}
    nodes.forEach(n => {
      const l = (n.labels || ['?'])[0]
      sums[l] = (sums[l] || 0) + Object.keys(n.properties || {}).length
      counts[l] = (counts[l] || 0) + 1
    })
    return Object.entries(sums)
      .map(([label, sum]) => ({
        label,
        value: Math.round((sum / counts[label]) * 10) / 10,
        color: getColor(label),
      }))
      .sort((a, b) => b.value - a.value)
  }, [nodes, getColor])

  // 孤立ノード
  const isolatedNodes = useMemo(() => {
    const connected = new Set()
    relationships.forEach(r => { connected.add(r.startNode); connected.add(r.endNode) })
    return nodes.filter(n => !connected.has(n.id))
  }, [nodes, relationships])

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
        <LayoutDashboard size={40} className="text-slate-700 mb-4" />
        <p className="text-slate-400 font-medium">閲覧タブでデータを読み込むと</p>
        <p className="text-slate-600 text-sm mt-1">ダッシュボードが表示されます</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4 pb-24 space-y-4">

      {/* 概要カード */}
      <div className="grid grid-cols-2 gap-3">
        {[
          ['ノード', nodes.length, 'text-neo-400'],
          ['リレーション', relationships.length, 'text-violet-400'],
          ['ラベル種類', labelStats.length, 'text-amber-400'],
          ['関係タイプ', relTypeStats.length, 'text-sky-400'],
        ].map(([label, value, color]) => (
          <div key={label} className="card p-3 text-center">
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <DistributionWidget id="label_dist" title="ラベル分布" Icon={BarChart3}
        items={labelStats} types={['hbar', 'vbar', 'donut']} />

      <DistributionWidget id="connectivity" title="接続数ランキング Top10" Icon={Network}
        items={connectivityRanking} types={['hbar', 'vbar', 'line']} />

      <DistributionWidget id="rel_types" title="リレーションタイプ分布" Icon={ArrowRightLeft}
        items={relTypeStats} types={['hbar', 'vbar', 'donut']} />

      <DistributionWidget id="label_pairs" title="ラベル間接続パターン Top10" Icon={ArrowRightLeft}
        items={labelPairs} types={['hbar', 'vbar']} />

      <DistributionWidget id="avg_props" title="ラベル別 平均プロパティ数" Icon={Hash}
        items={avgPropsStats} types={['hbar', 'vbar', 'donut']} />

      {/* 孤立ノード（リスト固定） */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Unlink size={15} className="text-neo-400 shrink-0" />
          <h2 className="text-sm font-semibold text-slate-200 flex-1">孤立ノード（リレーションなし）</h2>
          {isolatedNodes.length > 0 && (
            <span className="text-xs text-amber-400 font-semibold">{isolatedNodes.length} 件</span>
          )}
        </div>
        {isolatedNodes.length === 0
          ? <p className="text-sm text-slate-400 text-center py-2">孤立ノードなし ✓</p>
          : (
            <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1">
              {isolatedNodes.map(n => {
                const label = (n.labels || ['?'])[0]
                return (
                  <button key={n.id} onClick={() => onNodeSelect?.(n)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-xl active:bg-slate-800">
                    <span className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                      style={{ backgroundColor: getColor(label) }}>
                      {label[0]?.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-300 truncate flex-1">{getCardTitle(n)}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">{label}</span>
                  </button>
                )
              })}
            </div>
          )}
      </div>

    </div>
  )
}
