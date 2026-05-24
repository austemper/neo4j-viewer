import { useState, useCallback } from 'react'
import {
  Play, Loader, ChevronRight, AlertCircle, Clock,
  LayoutGrid, GitBranch, Plus, Pencil, Trash2, Check, X,
} from 'lucide-react'
import { parseGraphResults, parseRowResults } from './useNeo4jApi'
import NodeCard from './NodeCard'
import NodeDetail from './NodeDetail'
import GraphView from './GraphView'

// ---- プリセット管理 -------------------------------------------------------

const PRESETS_KEY = 'neo4j_query_presets'

const DEFAULT_PRESETS = [
  { id: 'p1', label: 'ノード件数', cypher: 'MATCH (n) RETURN labels(n) AS label, count(n) AS count ORDER BY count DESC' },
  { id: 'p2', label: '全ノード (50)', cypher: 'MATCH (n) RETURN n LIMIT 50' },
  { id: 'p3', label: 'リレーション件数', cypher: 'MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC' },
  { id: 'p4', label: 'スキーマ', cypher: 'CALL db.schema.visualization()' },
]

function loadPresets() {
  try {
    const s = localStorage.getItem(PRESETS_KEY)
    return s ? JSON.parse(s) : DEFAULT_PRESETS
  } catch { return DEFAULT_PRESETS }
}

function savePresets(presets) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

function genId() {
  return `p${Date.now()}`
}

// ---- テーブル表示 ----------------------------------------------------------

function ResultTable({ columns, rows }) {
  if (!columns.length) return null
  return (
    <div className="overflow-x-auto -mx-4">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {columns.map(col => (
              <th key={col} className="text-left px-4 py-2 text-xs text-slate-500 font-semibold uppercase tracking-wide whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-800/50">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-slate-200 align-top">
                  <span className="font-mono text-xs break-all">
                    {cell === null ? <span className="text-slate-600">null</span>
                      : typeof cell === 'object' ? JSON.stringify(cell, null, 1)
                      : String(cell)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-center text-slate-600 text-sm py-8">結果なし</p>}
    </div>
  )
}

// ---- プリセットパネル -------------------------------------------------------

function PresetPanel({ onSelect, onClose }) {
  const [presets, setPresets] = useState(loadPresets)
  const [editMode, setEditMode] = useState(false)
  const [editingId, setEditingId] = useState(null) // null=none, 'new'=新規, id=編集中
  const [editLabel, setEditLabel] = useState('')
  const [editCypher, setEditCypher] = useState('')

  const persist = (updated) => { setPresets(updated); savePresets(updated) }

  const startEdit = (preset) => {
    setEditingId(preset.id)
    setEditLabel(preset.label)
    setEditCypher(preset.cypher)
  }

  const startNew = () => {
    setEditingId('new')
    setEditLabel('')
    setEditCypher('')
  }

  const commitEdit = () => {
    if (!editLabel.trim() || !editCypher.trim()) return
    if (editingId === 'new') {
      persist([...presets, { id: genId(), label: editLabel.trim(), cypher: editCypher.trim() }])
    } else {
      persist(presets.map(p => p.id === editingId
        ? { ...p, label: editLabel.trim(), cypher: editCypher.trim() }
        : p))
    }
    setEditingId(null)
  }

  const cancelEdit = () => setEditingId(null)

  const deletePreset = (id) => persist(presets.filter(p => p.id !== id))

  return (
    <div className="card overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <span className="text-xs text-slate-500 font-semibold uppercase tracking-wide">クエリ例</span>
        <div className="flex gap-1">
          <button
            onClick={() => { setEditMode(v => !v); setEditingId(null) }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
              ${editMode ? 'bg-neo-600 text-white' : 'bg-slate-700 text-slate-400 active:bg-slate-600'}`}
          >
            {editMode ? '完了' : '編集'}
          </button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-slate-500 active:text-slate-300">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* プリセット一覧 */}
      <div className="divide-y divide-slate-700/30">
        {presets.map(p => (
          <div key={p.id}>
            {editingId === p.id ? (
              // インライン編集フォーム
              <div className="p-3 space-y-2 bg-slate-800/50">
                <input
                  value={editLabel}
                  onChange={e => setEditLabel(e.target.value)}
                  placeholder="名前"
                  className="input-field text-sm py-2"
                  autoCapitalize="none"
                />
                <textarea
                  value={editCypher}
                  onChange={e => setEditCypher(e.target.value)}
                  placeholder="MATCH ..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono
                    text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-neo-500 h-20"
                  spellCheck="false" autoCapitalize="none" autoCorrect="off"
                />
                <div className="flex gap-2">
                  <button onClick={commitEdit}
                    className="flex-1 py-1.5 rounded-lg bg-neo-600 text-white text-xs font-medium active:bg-neo-700 flex items-center justify-center gap-1">
                    <Check size={12} /> 保存
                  </button>
                  <button onClick={cancelEdit}
                    className="flex-1 py-1.5 rounded-lg bg-slate-700 text-slate-400 text-xs font-medium active:bg-slate-600">
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center">
                <button
                  onClick={() => { if (!editMode) { onSelect(p.cypher); onClose() } }}
                  className={`flex-1 text-left px-3 py-2.5 min-w-0 ${!editMode ? 'active:bg-slate-700' : ''}`}
                >
                  <p className="text-sm text-slate-200 font-medium truncate">{p.label}</p>
                  <p className="text-xs text-slate-500 font-mono truncate mt-0.5">{p.cypher}</p>
                </button>
                {!editMode && (
                  <ChevronRight size={14} className="text-slate-600 shrink-0 mr-3" />
                )}
                {editMode && (
                  <div className="flex gap-1 shrink-0 px-2">
                    <button onClick={() => startEdit(p)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 text-slate-400 active:bg-slate-600">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => deletePreset(p.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-900/50 text-rose-400 active:bg-rose-900">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* 新規追加フォーム */}
        {editingId === 'new' && (
          <div className="p-3 space-y-2 bg-slate-800/50">
            <input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              placeholder="名前"
              className="input-field text-sm py-2"
              autoCapitalize="none"
            />
            <textarea
              value={editCypher}
              onChange={e => setEditCypher(e.target.value)}
              placeholder="MATCH ..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono
                text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-neo-500 h-20"
              spellCheck="false" autoCapitalize="none" autoCorrect="off"
            />
            <div className="flex gap-2">
              <button onClick={commitEdit}
                className="flex-1 py-1.5 rounded-lg bg-neo-600 text-white text-xs font-medium active:bg-neo-700 flex items-center justify-center gap-1">
                <Check size={12} /> 保存
              </button>
              <button onClick={cancelEdit}
                className="flex-1 py-1.5 rounded-lg bg-slate-700 text-slate-400 text-xs font-medium active:bg-slate-600">
                キャンセル
              </button>
            </div>
          </div>
        )}

        {/* 追加ボタン */}
        <button
          onClick={startNew}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-neo-400 text-sm active:bg-slate-700"
        >
          <Plus size={14} /> 追加
        </button>
      </div>
    </div>
  )
}

// ---- メインコンポーネント --------------------------------------------------

export default function QueryRunner({ runQuery }) {
  const [cypher, setCypher] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [elapsed, setElapsed] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showPresets, setShowPresets] = useState(false)
  const [viewMode, setViewMode] = useState('cards')

  const execute = useCallback(async (query) => {
    const q = (query || cypher).trim()
    if (!q) return
    setIsRunning(true)
    setError(null)
    setResult(null)
    const t0 = Date.now()
    try {
      const results = await runQuery(q)
      setElapsed(Date.now() - t0)
      const { nodes, relationships } = parseGraphResults(results)
      if (nodes.length > 0) {
        setResult({ type: 'graph', nodes, relationships })
      } else {
        setResult({ type: 'table', ...parseRowResults(results) })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }, [cypher, runQuery])

  const relCountMap = result?.type === 'graph'
    ? result.relationships.reduce((m, r) => {
        m[r.startNode] = (m[r.startNode] || 0) + 1
        m[r.endNode] = (m[r.endNode] || 0) + 1
        return m
      }, {})
    : {}

  const getRelatedNodes = useCallback((nodeId) => {
    if (result?.type !== 'graph') return []
    return result.relationships
      .filter(r => r.startNode === nodeId || r.endNode === nodeId)
      .map(r => {
        const isOut = r.startNode === nodeId
        return { rel: r, node: result.nodes.find(n => n.id === (isOut ? r.endNode : r.startNode)), direction: isOut ? 'out' : 'in' }
      })
  }, [result])

  return (
    <div className="flex flex-col h-full">
      {/* クエリ入力 */}
      <div className="px-4 pt-4 pb-2 space-y-2 shrink-0">
        <textarea
          value={cypher}
          onChange={e => setCypher(e.target.value)}
          placeholder="MATCH (n) RETURN n LIMIT 10"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono
            text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-neo-500 min-h-[100px]"
          spellCheck="false" autoCapitalize="none" autoCorrect="off"
        />
        <div className="flex gap-2">
          <button
            onClick={() => execute()}
            disabled={!cypher.trim() || isRunning}
            className="flex-1 py-3 rounded-xl bg-neo-600 text-white font-semibold active:bg-neo-700
              disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center gap-2"
          >
            {isRunning ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
            {isRunning ? '実行中' : '実行'}
          </button>
          <button
            onClick={() => setShowPresets(v => !v)}
            className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors
              ${showPresets ? 'bg-neo-600/20 border border-neo-600/40 text-neo-400' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
          >
            例
          </button>
        </div>

        {showPresets && (
          <PresetPanel
            onSelect={(c) => setCypher(c)}
            onClose={() => setShowPresets(false)}
          />
        )}
      </div>

      {/* 結果エリア */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {error && (
          <div className="mx-4 mt-2 flex items-start gap-2 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3 shrink-0">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300 break-all font-mono">{error}</p>
          </div>
        )}

        {result && (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 shrink-0">
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  {result.type === 'graph'
                    ? `${result.nodes.length} ノード · ${result.relationships.length} 関係`
                    : `${result.rows.length} 件`}
                </p>
                {elapsed !== null && (
                  <span className="text-xs text-slate-600 flex items-center gap-1">
                    <Clock size={10} />{elapsed}ms
                  </span>
                )}
              </div>
              {result.type === 'graph' && (
                <div className="flex bg-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium
                      ${viewMode === 'cards' ? 'bg-slate-600 text-slate-100' : 'text-slate-500 active:text-slate-300'}`}
                  >
                    <LayoutGrid size={13} /> カード
                  </button>
                  <button
                    onClick={() => setViewMode('graph')}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium
                      ${viewMode === 'graph' ? 'bg-slate-600 text-slate-100' : 'text-slate-500 active:text-slate-300'}`}
                  >
                    <GitBranch size={13} /> グラフ
                  </button>
                </div>
              )}
            </div>

            {result.type === 'graph' && viewMode === 'graph' && (
              <div className="flex-1 overflow-hidden">
                <GraphView nodes={result.nodes} relationships={result.relationships} />
              </div>
            )}

            {result.type === 'graph' && viewMode === 'cards' && (
              <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-2">
                {result.nodes.map(node => (
                  <NodeCard
                    key={node.id}
                    node={node}
                    relCount={relCountMap[node.id] || 0}
                    onClick={() => setSelectedNode(node)}
                  />
                ))}
              </div>
            )}

            {result.type === 'table' && (
              <div className="flex-1 overflow-y-auto px-4 pb-8">
                <ResultTable columns={result.columns} rows={result.rows} />
              </div>
            )}
          </div>
        )}

        {!result && !error && !isRunning && (
          <div className="flex flex-col items-center justify-center py-20 text-center text-slate-600">
            <Play size={32} className="mb-3 opacity-30" />
            <p className="text-sm">Cypher を入力して実行</p>
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeDetail
          node={selectedNode}
          relatedNodes={getRelatedNodes(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
          onNavigate={setSelectedNode}
        />
      )}
    </div>
  )
}
