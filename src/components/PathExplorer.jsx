import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Loader, AlertCircle, ChevronRight, ArrowLeft } from 'lucide-react'
import { parsePathResults } from './useNeo4jApi'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'
import NodePopup from './NodePopup'
import GeminiAnalysis from './GeminiAnalysis'

// ---- ノードタイトル取得ユーティリティ ----------------------------------------

function useGetTitle() {
  const { getCardTitleProp } = useLabelSettings()
  return useCallback((node) => {
    const label = (node.labels || ['?'])[0]
    const prop = getCardTitleProp(label)
    return prop ? String(node.properties?.[prop] ?? getNodeTitle(node)) : getNodeTitle(node)
  }, [getCardTitleProp])
}

// ---- PathDetailPopup ---------------------------------------------------------
// 経路内のノードを縦に並べた中央ポップアップ。左スワイプで閉じる。

function PathDetailPopup({ path, onClose, onNodeSelect }) {
  const { getColor } = useLabelSettings()
  const getTitle = useGetTitle()
  const touchRef = useRef({})
  const [swipeHint, setSwipeHint] = useState(false)

  const onTouchStart = (e) => {
    touchRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, decided: false, horiz: false }
    setSwipeHint(false)
  }
  const onTouchMove = (e) => {
    const tr = touchRef.current
    const dx = e.touches[0].clientX - tr.sx
    const dy = e.touches[0].clientY - tr.sy
    if (!tr.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      tr.decided = true; tr.horiz = Math.abs(dx) > Math.abs(dy)
    }
    if (tr.horiz) setSwipeHint(dx < -30)
  }
  const onTouchEnd = (e) => {
    const tr = touchRef.current
    if (tr.horiz) {
      const dx = e.changedTouches[0].clientX - tr.sx
      const dy = e.changedTouches[0].clientY - tr.sy
      if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.2) { onClose(); return }
    }
    setSwipeHint(false); touchRef.current = {}
  }

  const { nodes, relationships } = path

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-slate-950/75"
      onClick={onClose}>
      <div
        className="w-full max-w-sm flex flex-col bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden"
        style={{ maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* ヘッダー */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-100">
              経路 ({nodes.length - 1} hop)
            </p>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
              <X size={15} />
            </button>
          </div>
          <span className={`inline-flex items-center gap-1 text-xs mt-1.5 transition-colors
            ${swipeHint ? 'text-rose-400' : 'text-slate-600'}`}>
            <ArrowLeft size={11} /> 左スワイプで閉じる
          </span>
        </div>

        {/* ノード一覧（縦） */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {/* Gemini 経路解析（ノード一覧の上） */}
          <GeminiAnalysis pathNodes={nodes} pathRels={relationships} />

          {nodes.map((node, i) => {
            const label = (node.labels || ['?'])[0]
            const color = getColor(label)
            const title = getTitle(node)
            return (
              <div key={node.id}>
                <button
                  onClick={() => onNodeSelect(node)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-slate-800"
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: color }}>
                    {label[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex gap-1 flex-wrap mb-0.5">
                      {(node.labels || []).map(l => (
                        <span key={l} className="badge text-white text-[10px]"
                          style={{ backgroundColor: getColor(l) }}>{l}</span>
                      ))}
                    </div>
                    <p className="text-sm text-slate-100 font-semibold truncate">{title}</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-600 shrink-0" />
                </button>

                {/* リレーション矢印 */}
                {i < nodes.length - 1 && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-950/30 border-t border-b border-slate-800/40">
                    <div className="w-9 flex justify-center text-slate-600 text-sm">↓</div>
                    <span className="text-xs font-mono text-slate-500 truncate">
                      {relationships[i]?.type ?? ''}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- PathCard （経路リストの各行） -------------------------------------------

function PathCard({ path, onSelect, getColor, getTitle }) {
  const { nodes, relationships } = path
  const endNode = nodes[nodes.length - 1]
  const endLabel = (endNode?.labels || ['?'])[0]
  const endColor = getColor(endLabel)
  const endTitle = getTitle(endNode)
  const hops = nodes.length - 1

  return (
    <button onClick={onSelect} className="card card-active w-full text-left p-3 space-y-2">
      {/* 終点ノード */}
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
          style={{ backgroundColor: endColor }}>
          {endLabel[0]?.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{endTitle}</p>
          <p className="text-xs text-slate-500">{hops} hop</p>
        </div>
        <ChevronRight size={14} className="text-slate-600 shrink-0" />
      </div>

      {/* 経路チェーン（横スクロール） */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-0.5">
        {nodes.map((node, i) => {
          const label = (node.labels || ['?'])[0]
          const color = getColor(label)
          const title = getTitle(node)
          const short = title.length > 10 ? title.slice(0, 10) + '…' : title
          return (
            <div key={node.id} className="flex items-center gap-1 shrink-0">
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: color + 'bb', border: `1px solid ${color}` }}>
                {short}
              </span>
              {i < nodes.length - 1 && (
                <span className="text-[9px] text-slate-600 font-mono whitespace-nowrap">
                  →{(relationships[i]?.type ?? '').slice(0, 10)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </button>
  )
}

// ---- PathExplorer（再帰ナビ対応） --------------------------------------------

export default function PathExplorer({ sourceNode, runQuery, onClose }) {
  const { getColor, pathSettings } = useLabelSettings()
  const getTitle = useGetTitle()
  const maxDegree = pathSettings?.maxNodeDegree ?? 20

  const [paths, setPaths] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ナビゲーション状態
  const [selectedPath, setSelectedPath] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [subExploreNode, setSubExploreNode] = useState(null)

  // 左スワイプで戻る
  const swipeTouchRef = useRef({})
  const [swipeHint, setSwipeHint] = useState(false)

  const onSwipeTouchStart = useCallback((e) => {
    swipeTouchRef.current = { sx: e.touches[0].clientX, sy: e.touches[0].clientY, decided: false, horiz: false }
    setSwipeHint(false)
  }, [])

  const onSwipeTouchMove = useCallback((e) => {
    const tr = swipeTouchRef.current
    const dx = e.touches[0].clientX - tr.sx
    const dy = e.touches[0].clientY - tr.sy
    if (!tr.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      tr.decided = true; tr.horiz = Math.abs(dx) > Math.abs(dy)
    }
    if (tr.horiz) setSwipeHint(dx < -30)
  }, [])

  const onSwipeTouchEnd = useCallback((e) => {
    const tr = swipeTouchRef.current
    if (tr.horiz) {
      const dx = e.changedTouches[0].clientX - tr.sx
      const dy = e.changedTouches[0].clientY - tr.sy
      if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.2) { setSwipeHint(false); onClose(); return }
    }
    setSwipeHint(false); swipeTouchRef.current = {}
  }, [onClose])

  const sourceLabels = sourceNode.labels || []
  const primaryLabel = sourceLabels[0] ?? '?'

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true); setError(null)
      // maxDegree が最大値のときはフィルターなし
      const degreeFilter = maxDegree < 20
        ? 'AND all(n IN nodes(path) WHERE n = start OR n = end OR COUNT { (n)--() } < $maxDeg)'
        : ''
      try {
        const result = await runQuery(
          `MATCH (start) WHERE elementId(start) = $id
           WITH start, labels(start) AS startLabels
           MATCH path = (start)-[*1..5]-(end)
           WHERE any(l IN labels(end) WHERE l IN startLabels) AND start <> end
           ${degreeFilter}
           WITH path ORDER BY length(path)
           LIMIT 40
           RETURN [n IN nodes(path) | n] AS pathNodes,
                  [r IN relationships(path) | r] AS pathRels`,
          { id: sourceNode.id, maxDeg: maxDegree }
        )
        if (!cancelled) setPaths(parsePathResults(result))
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [sourceNode.id, maxDegree]) // eslint-disable-line react-hooks/exhaustive-deps

  // NodePopup から右スワイプで経路探索
  const handleNodePathExplore = useCallback((node) => {
    setSelectedNode(null)
    setSelectedPath(null)
    setSubExploreNode(node)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* ヘッダー */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 shrink-0">
        <div className="flex items-center gap-3 py-3">
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 active:bg-slate-700 shrink-0">
            <X size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500">同タイプへの経路</p>
            <p className="text-slate-100 font-semibold truncate">{getTitle(sourceNode)}</p>
          </div>
          <span className={`flex items-center gap-1 text-xs transition-colors duration-150 shrink-0
            ${swipeHint ? 'text-rose-400' : 'text-slate-600'}`}>
            <ArrowLeft size={11} /> 戻る
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 pb-3">
          {sourceLabels.map(l => (
            <span key={l} className="badge text-white text-xs" style={{ backgroundColor: getColor(l) }}>{l}</span>
          ))}
        </div>
      </div>

      {/* 経路リスト */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 pb-8"
        onTouchStart={onSwipeTouchStart}
        onTouchMove={onSwipeTouchMove}
        onTouchEnd={onSwipeTouchEnd}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader size={24} className="text-neo-400 animate-spin mb-3" />
            <p className="text-sm text-slate-400">経路を探索中...</p>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300 break-all">{error}</p>
          </div>
        )}
        {!loading && !error && paths.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-3xl mb-3">🔍</p>
            <p className="text-slate-400 font-medium">同タイプのノードが見つかりません</p>
            <p className="text-slate-600 text-sm mt-1">5 hop 以内に [{primaryLabel}] ノードが存在しません</p>
          </div>
        )}
        {!loading && paths.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-3">
              {paths.length} 経路
            </p>
            {paths.map((path, i) => (
              <PathCard
                key={i}
                path={path}
                onSelect={() => setSelectedPath(path)}
                getColor={getColor}
                getTitle={getTitle}
              />
            ))}
          </div>
        )}
      </div>

      {/* 経路詳細ポップアップ（z-60） */}
      {selectedPath && (
        <PathDetailPopup
          path={selectedPath}
          onClose={() => setSelectedPath(null)}
          onNodeSelect={(node) => setSelectedNode(node)}
        />
      )}

      {/* ノードポップアップ（z-70）: 左スワイプで閉じ・右スワイプで経路探索 */}
      {selectedNode && (
        <NodePopup
          node={selectedNode}
          relatedNodes={[]}
          onClose={() => setSelectedNode(null)}
          onNavigate={setSelectedNode}
          onPathExplore={() => handleNodePathExplore(selectedNode)}
        />
      )}

      {/* 再帰的な経路探索（z-50、DOM順で最前面） */}
      {subExploreNode && (
        <PathExplorer
          sourceNode={subExploreNode}
          runQuery={runQuery}
          onClose={() => setSubExploreNode(null)}
        />
      )}
    </div>
  )
}
