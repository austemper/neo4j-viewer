import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Database, Settings, LayoutDashboard, RefreshCw, WifiOff, Loader,
         ArrowUpDown, ArrowUp, ArrowDown, X, ChevronDown, ChevronUp,
         FileSpreadsheet, Sun, Moon, Sparkles, Wifi, NotebookPen,
         FileText, PenLine } from 'lucide-react'
import { useNeo4jApi, parseGraphResults } from './components/useNeo4jApi'
import { LabelSettingsProvider } from './components/LabelSettingsContext'
import ConnectionForm from './components/ConnectionForm'
import LabelSettingsPanel from './components/LabelSettingsPanel'
import LabelFilter from './components/LabelFilter'
import SearchBar from './components/SearchBar'
import NodeCard from './components/NodeCard'
import NodePopup from './components/NodePopup'
import PathExplorer from './components/PathExplorer'
import Dashboard from './components/Dashboard'
import PomodoroTimer from './components/PomodoroTimer'
import NotesTab from './components/NotesTab'
import NoteViewer from './components/NoteViewer'
import CalcPanel from './components/CalcPanel'
import NoteDrawer from './components/NoteDrawer'
import GeminiSettings from './components/GeminiSettings'
import { loadNeo4jApiSettings, saveNeo4jApiSettings } from './components/useGemini'
import SheetsViewer from './components/SheetsViewer'
import SheetsSettings from './components/SheetsSettings'


const TABS = [
  { id: 'browse',     label: '閲覧',     icon: Database },
  { id: 'notes',      label: 'ノート',   icon: NotebookPen },
  { id: 'dashboard',  label: 'ダッシュ',  icon: LayoutDashboard },
  { id: 'sheets',     label: 'シート',   icon: FileSpreadsheet },
  { id: 'settings',   label: '設定',     icon: Settings },
]

const INITIAL_SIZE = 5000

// ---- CollSection: 折りたたみ可能な設定セクション ----------------------------
function CollSection({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(false)
  // defaultOpen は初回のみ反映
  const [init] = useState(defaultOpen)
  const [opened, setOpened] = useState(init)
  const isOpen = init ? opened : open
  const toggle = () => init ? setOpened(v => !v) : setOpen(v => !v)

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/50">
      <button onClick={toggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-slate-800/60 active:bg-slate-700/60">
        <Icon size={15} className="text-neo-400 shrink-0" />
        <span className="flex-1 text-sm font-semibold text-left text-slate-200">{title}</span>
        {isOpen
          ? <ChevronUp size={15} className="text-slate-500 shrink-0" />
          : <ChevronDown size={15} className="text-slate-500 shrink-0" />}
      </button>
      {isOpen && <div className="border-t border-slate-700/50">{children}</div>}
    </div>
  )
}
const MORE_SIZE    = 1000

// ---- ソートピッカー --------------------------------------------------------

function SortPicker({ allPropKeys, sortConfig, onChange, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-slate-900 rounded-t-2xl border-t border-slate-700 pb-8"
        onClick={e => e.stopPropagation()}
      >
        {/* ハンドル */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-slate-700" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <p className="text-sm font-semibold text-slate-100">並び替え</p>
          <button onClick={onClose} className="text-slate-500 active:text-slate-300">
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-72 px-3 space-y-0.5">
          {/* デフォルト */}
          <button
            onClick={() => { onChange({ prop: null, dir: 'asc' }); onClose() }}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm
              ${!sortConfig.prop ? 'bg-neo-600/20 text-neo-400 font-semibold' : 'text-slate-400 active:bg-slate-800'}`}
          >
            デフォルト（並び替えなし）
          </button>
          {allPropKeys.map(prop => {
            const isActive = sortConfig.prop === prop
            return (
              <button
                key={prop}
                onClick={() => {
                  onChange({
                    prop,
                    dir: isActive && sortConfig.dir === 'asc' ? 'desc' : 'asc',
                  })
                  onClose()
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm
                  ${isActive ? 'bg-neo-600/20 text-neo-400 font-semibold' : 'text-slate-300 active:bg-slate-800'}`}
              >
                <span className="font-mono">{prop}</span>
                {isActive && (
                  sortConfig.dir === 'asc'
                    ? <ArrowUp size={14} />
                    : <ArrowDown size={14} />
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---- Neo4j API URL 設定 ---------------------------------------------------
function Neo4jApiSettings() {
  const [s, setS] = useState(loadNeo4jApiSettings)
  const save = (updated) => { setS(updated); saveNeo4jApiSettings(updated) }
  return (
    <div className="px-4 py-3 space-y-2">
      <label className="block text-xs text-slate-500 font-medium">API エンドポイント URL</label>
      <input
        type="text"
        value={s.url}
        onChange={e => save({ ...s, url: e.target.value })}
        placeholder="https://xxxx.ngrok-free.app/run_graph"
        className="input-field text-xs font-mono"
        autoCapitalize="none" autoCorrect="off" spellCheck="false"
      />
      <p className="text-[10px] text-slate-600 leading-relaxed">
        POST {"{"} concept: 選択テキスト {"}"} を送信します。ngrok URL が変わったらここを更新してください。
      </p>
    </div>
  )
}

// ---- App ------------------------------------------------------------------

export default function App() {
  const { connection, isConnected, isLoading, error, runQuery, connect, disconnect } = useNeo4jApi()
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('app_tab') || 'browse' } catch { return 'browse' }
  })

  // 計算機・計算ノートの共有開閉状態（どちらを開いても両方展開）
  const [panelOpen, setPanelOpen] = useState(false)

  // ナビバーの高さを同期的に計測（useLayoutEffect + ref で timing 問題を回避）
  const navRef       = useRef(null)
  const navHeightRef = useRef(0)
  useEffect(() => {
    if (navRef.current) navHeightRef.current = navRef.current.offsetHeight
  })  // 依存配列なし → レンダー毎に更新（常に最新値）

  // ノートビューアー状態（複数ノートをタブで管理）── リロード後も復元
  const [openNotes, setOpenNotes] = useState(() => {
    try {
      const s = localStorage.getItem('open_notes')
      return s ? JSON.parse(s) : []
    } catch { return [] }
  })
  const [activeNoteId, setActiveNoteId] = useState(() => {
    try { return localStorage.getItem('active_note_id') || null } catch { return null }
  })
  const [twoUpMode, setTwoUpMode] = useState(false)
  const [twoUpNoteIds, setTwoUpNoteIds] = useState([null, null]) // [左ペイン, 右ペイン]
  const [notesRefreshKey, setNotesRefreshKey] = useState(0)
  const [navBarVisible, setNavBarVisible] = useState(() => {
    try { return localStorage.getItem('nav_bar_visible') !== 'false' } catch { return true }
  })
  const [crossSearchNoteId, setCrossSearchNoteId] = useState(() => {
    try { return localStorage.getItem('cross_search_note_id') || null } catch { return null }
  })
  const [crossSearchQuery, setCrossSearchQuery] = useState(null)

  const openNote = useCallback(({ id, name, type }) => {
    setOpenNotes(prev => prev.find(n => n.id === id) ? prev : [...prev, { id, name, type }])
    setActiveNoteId(id)
  }, [])

  // ── 状態を localStorage に永続化 ──────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('app_tab', tab) } catch {}
  }, [tab])
  useEffect(() => {
    try { localStorage.setItem('nav_bar_visible', String(navBarVisible)) } catch {}
  }, [navBarVisible])
  useEffect(() => {
    try { localStorage.setItem('open_notes', JSON.stringify(openNotes)) } catch {}
  }, [openNotes])
  useEffect(() => {
    try {
      if (activeNoteId) localStorage.setItem('active_note_id', activeNoteId)
      else localStorage.removeItem('active_note_id')
    } catch {}
  }, [activeNoteId])

  useEffect(() => {
    try {
      if (crossSearchNoteId) localStorage.setItem('cross_search_note_id', crossSearchNoteId)
      else localStorage.removeItem('cross_search_note_id')
    } catch {}
  }, [crossSearchNoteId])

  // openNotes と activeNoteId/crossSearchNoteId の整合性チェック
  useEffect(() => {
    if (activeNoteId && openNotes.length > 0 && !openNotes.find(n => n.id === activeNoteId)) {
      setActiveNoteId(openNotes[0].id)
    } else if (activeNoteId && openNotes.length === 0) {
      setActiveNoteId(null)
    }
    // 検索対象PDFが開かれていなければクリア
    if (crossSearchNoteId && !openNotes.find(n => n.id === crossSearchNoteId)) {
      setCrossSearchNoteId(null)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // ────────────────────────────────────────────────────────────────────────

  // ── クロスタブ検索 ───────────────────────────────────────────────────────
  const handleSetCrossSearchTarget = useCallback((id) => {
    setCrossSearchNoteId(prev => prev === id ? null : id)
  }, [])

  const handleCrossSearch = useCallback((query) => {
    if (!crossSearchNoteId || !query.trim()) return
    setCrossSearchQuery(query)
    setActiveNoteId(crossSearchNoteId)
  }, [crossSearchNoteId])

  const handleClearCrossSearchQuery = useCallback(() => {
    setCrossSearchQuery(null)
  }, [])
  // ────────────────────────────────────────────────────────────────────────

  // ノートを閉じる（タブ × ボタン）
  const closeNote = useCallback((id) => {
    setOpenNotes(prev => {
      const idx = prev.findIndex(n => n.id === id)
      const remaining = prev.filter(n => n.id !== id)
      setActiveNoteId(cur => {
        if (cur !== id) return cur
        if (remaining.length === 0) return null
        return remaining[Math.min(idx, remaining.length - 1)].id
      })
      if (remaining.length === 0) {
        setTwoUpMode(false)
        setNotesRefreshKey(k => k + 1)
      }
      return remaining
    })
  }, [])

  // 戻るボタン → リストへ戻す（タブは維持）
  const handleNoteBack = useCallback(() => {
    setActiveNoteId(null)
    setTwoUpMode(false)
  }, [])

  // Browse データ
  const [nodes, setNodes] = useState([])
  const [relationships, setRelationships] = useState([])
  const [browseLoading, setBrowseLoading] = useState(false)
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false)
  const [browseError, setBrowseError] = useState(null)

  const [browseOffset, setBrowseOffset] = useState(0)
  const [browseHasMore, setBrowseHasMore] = useState(false)

  // フィルター / ソート
  const [activeLabel, setActiveLabel] = useState('すべて')
  const [search, setSearch] = useState('')
  const [sortConfig, setSortConfig] = useState({ prop: null, dir: 'asc' })
  const [showSort, setShowSort] = useState(false)

  // ポップアップ / 探索
  const [selectedNode, setSelectedNode] = useState(null)
  const [pathExploreNode, setPathExploreNode] = useState(null)

  // ---- リレーション読み込み ----
  const loadRelationships = useCallback(async (nodeList) => {
    if (nodeList.length === 0) { setRelationships([]); return }
    try {
      const ids = nodeList.map(n => n.id)
      const relData = await runQuery(
        'MATCH (a)-[r]-(b) WHERE elementId(a) IN $ids AND elementId(b) IN $ids RETURN DISTINCT r LIMIT 5000',
        { ids }
      )
      const { relationships: rs } = parseGraphResults(relData)
      setRelationships(rs)
    } catch { /* rels optional */ }
  }, [runQuery])

  // ---- 初回読み込み ----
  const loadBrowseData = useCallback(async () => {
    setBrowseLoading(true)
    setBrowseError(null)
    setNodes([])
    setRelationships([])
    setBrowseOffset(0)
    setBrowseHasMore(false)
    try {
      const nodeData = await runQuery(`MATCH (n) RETURN n SKIP 0 LIMIT ${INITIAL_SIZE + 1}`)
      const { nodes: ns } = parseGraphResults(nodeData)
      const hasMore = ns.length > INITIAL_SIZE
      const batch = hasMore ? ns.slice(0, INITIAL_SIZE) : ns
      setNodes(batch)
      setBrowseOffset(INITIAL_SIZE)
      setBrowseHasMore(hasMore)
      await loadRelationships(batch)
    } catch (err) {
      setBrowseError(err.message)
    } finally {
      setBrowseLoading(false)
    }
  }, [runQuery, loadRelationships])

  // ---- 追加読み込み ----
  const loadMoreNodes = useCallback(async () => {
    if (!browseHasMore || browseLoadingMore) return
    setBrowseLoadingMore(true)
    try {
      const nodeData = await runQuery(
        `MATCH (n) RETURN n SKIP ${browseOffset} LIMIT ${MORE_SIZE + 1}`
      )
      const { nodes: newNs } = parseGraphResults(nodeData)
      const hasMore = newNs.length > MORE_SIZE
      const batch = hasMore ? newNs.slice(0, MORE_SIZE) : newNs
      const allNodes = [...nodes, ...batch]
      setNodes(allNodes)
      setBrowseOffset(prev => prev + MORE_SIZE)
      setBrowseHasMore(hasMore)
      await loadRelationships(allNodes)
    } catch (err) {
      setBrowseError(err.message)
    } finally {
      setBrowseLoadingMore(false)
    }
  }, [runQuery, browseOffset, browseHasMore, browseLoadingMore, nodes, loadRelationships])

  useEffect(() => {
    if (isConnected) loadBrowseData()
  }, [isConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 派生データ ----
  const allLabels = useMemo(() => {
    const s = new Set()
    nodes.forEach(n => (n.labels || []).forEach(l => s.add(l)))
    return ['すべて', ...Array.from(s)]
  }, [nodes])

  const labelCounts = useMemo(() => {
    const c = {}
    nodes.forEach(n => (n.labels || []).forEach(l => { c[l] = (c[l] || 0) + 1 }))
    return c
  }, [nodes])

  const relCountMap = useMemo(() => {
    const m = {}
    relationships.forEach(r => {
      m[r.startNode] = (m[r.startNode] || 0) + 1
      m[r.endNode] = (m[r.endNode] || 0) + 1
    })
    return m
  }, [relationships])

  // ソートに使える全プロパティキー
  const allPropKeys = useMemo(() => {
    const keys = new Set()
    nodes.forEach(n => Object.keys(n.properties || {}).forEach(k => keys.add(k)))
    return Array.from(keys).sort()
  }, [nodes])

  // フィルタリング + ソート
  const displayNodes = useMemo(() => {
    let result = nodes
    if (activeLabel !== 'すべて') result = result.filter(n => (n.labels || []).includes(activeLabel))
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(n =>
        (n.labels || []).some(l => l.toLowerCase().includes(q)) ||
        Object.values(n.properties || {}).some(v => String(v).toLowerCase().includes(q))
      )
    }
    if (sortConfig.prop) {
      result = [...result].sort((a, b) => {
        const va = String(a.properties?.[sortConfig.prop] ?? '')
        const vb = String(b.properties?.[sortConfig.prop] ?? '')
        const cmp = va.localeCompare(vb, undefined, { numeric: true })
        return sortConfig.dir === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [nodes, activeLabel, search, sortConfig])

  const getRelatedNodes = useCallback((nodeId) => {
    return relationships
      .filter(r => r.startNode === nodeId || r.endNode === nodeId)
      .map(r => {
        const isOut = r.startNode === nodeId
        return { rel: r, node: nodes.find(n => n.id === (isOut ? r.endNode : r.startNode)), direction: isOut ? 'out' : 'in' }
      })
  }, [nodes, relationships])

  // ---- テーマ ----
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('app_theme') || 'dark' } catch { return 'dark' }
  })
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme !== 'light')
    try { localStorage.setItem('app_theme', theme) } catch {}
  }, [theme])



  // 認証情報がなく未接続 → ConnectionForm（初回ログイン）
  // 認証情報あり未接続 → 自動再接続中: ノートタブは通す、他タブはインライン接続フォーム
  const needsLogin = !isConnected && !connection.uri

  if (needsLogin) {
    return <ConnectionForm connection={connection} onConnect={connect} isLoading={isLoading} error={error} />
  }

  return (
    <LabelSettingsProvider>
    <div className="min-h-screen flex flex-col">

      {/* ヘッダー（ノートタブでは非表示） */}
      {tab !== 'notes' && (
        <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur border-b border-slate-800"
                style={{ WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)', willChange: 'transform' }}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-neo-400" />
              <div>
                <h1 className="text-sm font-bold text-slate-100 truncate max-w-[180px]">
                  {connection.uri.replace(/^.*?\/\//, '').split('.')[0]}
                </h1>
                <p className="text-xs text-slate-500">
                  {nodes.length}{browseHasMore ? '+' : ''} ノード · {relationships.length} 関係
                </p>
              </div>
            </div>
            {tab === 'browse' && (
              <button
                onClick={() => { loadBrowseData(); setActiveLabel('すべて'); setSearch(''); setSortConfig({ prop: null, dir: 'asc' }) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-400 text-xs active:bg-slate-700"
              >
                <RefreshCw size={12} />
                更新
              </button>
            )}
          </div>
          {tab === 'browse' && (
            <div className="px-4 pb-3 space-y-2">
              <SearchBar value={search} onChange={setSearch} />
              <div className="flex gap-2 items-center">
                <div className="flex-1 min-w-0">
                  <LabelFilter labels={allLabels} active={activeLabel} onChange={setActiveLabel} counts={labelCounts} />
                </div>
                <button
                  onClick={() => setShowSort(true)}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors
                    ${sortConfig.prop
                      ? 'bg-neo-600/20 border border-neo-600/40 text-neo-400'
                      : 'bg-slate-800 text-slate-500 active:bg-slate-700'}`}
                >
                  {sortConfig.prop
                    ? <>{sortConfig.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}</>
                    : <ArrowUpDown size={12} />}
                </button>
              </div>
            </div>
          )}
        </header>
      )}

      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* ── ノートビューアーエリア ──────────────────────────────────
            NoteViewer は常時マウント（display:none で隠す）。
            twoUpMode でもモード切り替えでリマウントしないためクラッシュなし。 */}
        {openNotes.length > 0 && (
          <div style={{
            display: tab === 'notes' ? 'flex' : 'none',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'white',
            ...(twoUpMode || activeNoteId ? { flex: 1, minHeight: 0 } : { flexShrink: 0 }),
          }}>

            {/* タブバー */}
            {twoUpMode ? (
              // 2画面: 左ペインのタブ | 右ペインのタブ を横並び
              <div className="shrink-0 flex border-b border-slate-200 bg-white" style={{ height: 32 }}>
                {[0, 1].map(paneIdx => (
                  <div key={paneIdx}
                    className="flex-1 flex overflow-x-auto scrollbar-hide min-w-0"
                    style={{ borderRight: paneIdx === 0 ? '2px solid #334155' : undefined }}>
                    {openNotes.map(note => (
                      <div key={note.id}
                        onClick={() => setTwoUpNoteIds(prev => { const n = [...prev]; n[paneIdx] = note.id; return n })}
                        className={`flex items-center gap-1 px-2 h-8 border-r border-slate-200 shrink-0 cursor-pointer select-none transition-colors
                          ${twoUpNoteIds[paneIdx] === note.id
                            ? 'bg-white text-slate-800 font-semibold border-b-2 border-b-neo-500'
                            : note.id === crossSearchNoteId
                              ? 'bg-teal-50 text-teal-700 active:bg-teal-100'
                              : 'bg-slate-50 text-slate-500 active:bg-slate-100'}`}
                        style={{ maxWidth: 120, fontSize: 10 }}>
                        {note.type === 'pdf'
                          ? <FileText size={10} className="shrink-0 text-rose-400" />
                          : <PenLine  size={10} className="shrink-0 text-neo-400" />}
                        <span className="ml-1 truncate">{note.name}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              // 1画面: 通常タブバー
              <div className="shrink-0 flex overflow-x-auto bg-white border-b border-slate-200 scrollbar-hide">
                {openNotes.map(note => (
                  <div key={note.id}
                    onClick={() => setActiveNoteId(note.id)}
                    className={`flex items-center gap-1 pl-3 pr-1.5 h-9 border-r border-slate-200 shrink-0 cursor-pointer select-none transition-colors
                      ${note.id === activeNoteId
                        ? 'bg-white text-slate-800 border-b-2 border-b-neo-500'
                        : note.id === crossSearchNoteId
                          ? 'bg-teal-50 text-teal-700 border-b-2 border-b-teal-400 active:bg-teal-100'
                          : 'bg-slate-50 text-slate-500 active:bg-slate-100'}`}
                    style={{ maxWidth: 180 }}>
                    {note.type === 'pdf'
                      ? <FileText size={12} className="shrink-0 text-rose-400" />
                      : <PenLine  size={12} className="shrink-0 text-neo-400" />}
                    <span className="text-xs font-medium truncate flex-1 mx-1.5">{note.name}</span>
                    <button onClick={e => { e.stopPropagation(); closeNote(note.id) }}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-slate-400 active:text-slate-700">
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ビューアー: NoteViewer は常時マウント。CSS で表示・位置を制御 */}
            {(() => {
              // 2画面時: 左ペイン → 右ペイン → その他(hidden) の順に並べて視覚順を保証
              const activeIdx = openNotes.findIndex(n => n.id === activeNoteId)
              const ordered = twoUpMode
                ? [
                    ...openNotes.filter(n => n.id === twoUpNoteIds[0]),
                    ...openNotes.filter(n => n.id === twoUpNoteIds[1] && n.id !== twoUpNoteIds[0]),
                    ...openNotes.filter(n => n.id !== twoUpNoteIds[0] && n.id !== twoUpNoteIds[1]),
                  ]
                : openNotes
              return (
                <div style={{
                  flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden',
                  flexDirection: twoUpMode ? 'row' : 'column',
                }}>
                  {ordered.map(note => {
                    const isLeft   = twoUpMode && note.id === twoUpNoteIds[0]
                    const isRight  = twoUpMode && note.id === twoUpNoteIds[1] && note.id !== twoUpNoteIds[0]
                    const isSingle = !twoUpMode && note.id === activeNoteId
                    const visible  = isLeft || isRight || isSingle
                    return (
                      <div key={note.id} style={{
                        display: visible ? 'flex' : 'none',
                        flexDirection: 'column',
                        ...(twoUpMode ? { flex: 1, minWidth: 0 } : { flex: 1, minHeight: 0 }),
                        overflow: 'hidden',
                        borderRight: isLeft ? '2px solid #334155' : undefined,
                      }}>
                        <NoteViewer
                          noteId={note.id}
                          splitMode={twoUpMode}
                          onToggleSplit={() => {
                            if (twoUpMode) {
                              setTwoUpMode(false)
                            } else {
                              const other = openNotes.find(n => n.id !== activeNoteId)
                              setTwoUpNoteIds([activeNoteId, other?.id ?? null])
                              setTwoUpMode(true)
                            }
                          }}
                          onBack={() => { if (twoUpMode) { setTwoUpMode(false) } else { handleNoteBack() } }}
                          canPrevNote={!twoUpMode && activeIdx > 0}
                          canNextNote={!twoUpMode && activeIdx < openNotes.length - 1}
                          onPrevNote={() => { if (activeIdx > 0) setActiveNoteId(openNotes[activeIdx - 1].id) }}
                          onNextNote={() => { if (activeIdx < openNotes.length - 1) setActiveNoteId(openNotes[activeIdx + 1].id) }}
                          navHeightRef={navHeightRef}
                          openNotes={openNotes}
                          crossSearchNoteId={crossSearchNoteId}
                          onSetCrossSearchTarget={handleSetCrossSearchTarget}
                          onCrossSearch={handleCrossSearch}
                          crossSearchQuery={note.id === crossSearchNoteId ? crossSearchQuery : null}
                          onClearCrossSearchQuery={handleClearCrossSearchQuery}
                          navBarVisible={navBarVisible}
                          onToggleNavBar={() => setNavBarVisible(v => !v)}
                        />
                      </div>
                    )
                  })}
                  {/* 空ペインのプレースホルダー */}
                  {twoUpMode && !twoUpNoteIds[0] && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white', borderRight: '2px solid #334155' }}>
                      <p className="text-sm text-slate-400">左のタブからPDFを選択</p>
                    </div>
                  )}
                  {twoUpMode && !twoUpNoteIds[1] && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
                      <p className="text-sm text-slate-400">右のタブからPDFを選択</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* タブコンテンツ: ノートが全画面 or 2画面のときは非表示 */}
        <div
          style={{
            display: tab === 'notes' && (twoUpMode || !!activeNoteId) ? 'none' : 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            minHeight: 0,
          }}
        >

          {/* 未接続インライン: ノートタブ以外で接続が必要なタブ */}
          {!isConnected && tab !== 'notes' && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="w-full max-w-sm space-y-3">
                {isLoading
                  ? <div className="flex flex-col items-center gap-3 py-8">
                      <Loader size={28} className="text-neo-400 animate-spin" />
                      <p className="text-sm text-slate-400">再接続中…</p>
                    </div>
                  : <>
                      <div className="flex items-center gap-2 text-amber-400 mb-2">
                        <WifiOff size={16} />
                        <span className="text-sm font-semibold">Neo4j 未接続</span>
                      </div>
                      <ConnectionForm connection={connection} onConnect={connect} isLoading={isLoading} error={error} />
                    </>
                }
              </div>
            </div>
          )}

          {/* 閲覧タブ */}
          {isConnected && tab === 'browse' && (
            <div className="h-full overflow-y-auto px-4 py-3">
              {browseLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader size={28} className="text-neo-400 animate-spin mb-3" />
                  <p className="text-sm text-slate-400">読み込み中...</p>
                </div>
              ) : browseError ? (
                <div className="flex items-start gap-2 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3">
                  <WifiOff size={16} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-rose-300 break-all">{browseError}</p>
                </div>
              ) : displayNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <p className="text-3xl mb-3">🔍</p>
                  <p className="text-slate-400 font-medium">ノードが見つかりません</p>
                  <p className="text-slate-600 text-sm mt-1">検索条件を変えてみてください</p>
                </div>
              ) : (
                <div className="pb-24">
                  <div className="space-y-2">
                    {displayNodes.map(node => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        relCount={relCountMap[node.id] || 0}
                        onClick={() => setSelectedNode(node)}
                      />
                    ))}
                  </div>

                  <div className="py-4 text-center space-y-2">
                    <p className="text-xs text-slate-600">{displayNodes.length} 件表示</p>
                    {browseHasMore && (
                      <button
                        onClick={loadMoreNodes}
                        disabled={browseLoadingMore}
                        className="px-5 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium
                          active:bg-slate-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                      >
                        {browseLoadingMore
                          ? <><Loader size={14} className="animate-spin" />読み込み中...</>
                          : `さらに ${MORE_SIZE} 件読み込む`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ダッシュボードタブ */}
          {isConnected && tab === 'dashboard' && (
            <div className="h-full overflow-hidden">
              <Dashboard
                nodes={nodes}
                relationships={relationships}
                onNodeSelect={(node) => setSelectedNode(node)}
              />
            </div>
          )}

          {/* ノート一覧タブ */}
          {tab === 'notes' && (
            <div className="h-full overflow-hidden">
              <NotesTab
                onOpenNote={openNote}
                refreshKey={notesRefreshKey}
              />
            </div>
          )}

          {/* シートタブ */}
          {isConnected && tab === 'sheets' && (
            <div className="h-full overflow-hidden">
              <SheetsViewer />
            </div>
          )}


          {/* 設定タブ */}
          {tab === 'settings' && (
            <div className="h-full overflow-y-auto pb-24">
              <div className="px-4 pt-4 pb-3 space-y-3">

                {/* 接続情報 */}
                <CollSection title="接続情報" icon={Wifi} defaultOpen={true}>
                  <div className="px-4 py-3 space-y-2">
                    {[['URI', connection.uri], ['ユーザー名', connection.username], ['データベース', connection.database]].map(([label, val]) => (
                      <div key={label} className="flex items-start gap-3">
                        <span className="text-xs text-slate-500 w-24 shrink-0 pt-0.5">{label}</span>
                        <span className="text-sm text-slate-200 break-all font-mono">{val || '—'}</span>
                      </div>
                    ))}
                    {error && (
                      <div className="flex items-start gap-2 bg-rose-950/50 border border-rose-800 rounded-xl px-3 py-2 mt-1">
                        <WifiOff size={14} className="text-rose-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-rose-300 break-all">{error}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => connect(connection)} disabled={isLoading}
                        className="flex-1 py-2 rounded-xl bg-neo-600/20 border border-neo-600/40 text-neo-400
                          font-semibold text-sm active:bg-neo-600/30 disabled:opacity-40 flex items-center justify-center gap-1.5">
                        {isLoading ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                        再接続
                      </button>
                      <button onClick={disconnect}
                        className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-400 font-semibold text-sm active:bg-slate-700">
                        切断
                      </button>
                    </div>
                  </div>
                </CollSection>

                {/* テーマ */}
                <CollSection title="テーマ" icon={theme === 'light' ? Sun : Moon}>
                  <div className="px-4 py-3">
                    <div className="flex bg-slate-800 rounded-xl p-1 gap-1">
                      {[{ id: 'dark', label: 'ダーク', icon: Moon }, { id: 'light', label: 'ライト', icon: Sun }].map(({ id, label, icon: TIcon }) => (
                        <button key={id} onClick={() => setTheme(id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors
                            ${theme === id ? 'bg-neo-600 text-white' : 'text-slate-400 active:bg-slate-700'}`}>
                          <TIcon size={14} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </CollSection>

                {/* ラベル・グラフ設定 */}
                <CollSection title="ラベル・グラフ・経路設定" icon={Settings}>
                  <LabelSettingsPanel nodes={nodes} />
                </CollSection>

                {/* Gemini AI */}
                <CollSection title="Gemini AI 解析" icon={Sparkles}>
                  <div className="p-3">
                    <GeminiSettings />
                  </div>
                </CollSection>

                {/* Google Sheets */}
                <CollSection title="Google Sheets 連携" icon={FileSpreadsheet}>
                  <div className="p-3">
                    <SheetsSettings />
                  </div>
                </CollSection>

                {/* Neo4j API */}
                <CollSection title="Neo4j API 連携" icon={Database}>
                  <Neo4jApiSettings />
                </CollSection>

              </div>
            </div>
          )}

        </div>

      </main>

      {/* ボトムナビ（navBarVisible=false で非表示） */}
      <nav ref={navRef} className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur border-t border-slate-800 flex items-center"
           style={{ WebkitTransform: 'translateZ(0)', willChange: 'transform', display: navBarVisible ? 'flex' : 'none' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors
              ${tab === id ? 'text-neo-400' : 'text-slate-500 active:text-slate-300'}`}>
            <Icon size={20} />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        ))}
      </nav>

      {/* ノードポップアップ */}
      {selectedNode && (
        <NodePopup
          node={selectedNode}
          relatedNodes={getRelatedNodes(selectedNode.id)}
          onClose={() => setSelectedNode(null)}
          onNavigate={setSelectedNode}
          onPathExplore={() => {
            setPathExploreNode(selectedNode)
            setSelectedNode(null)
          }}
        />
      )}

      {/* 同タイプ経路探索 */}
      {pathExploreNode && (
        <PathExplorer
          sourceNode={pathExploreNode}
          runQuery={runQuery}
          onClose={() => setPathExploreNode(null)}
        />
      )}

      {/* ソートピッカー */}
      {showSort && (
        <SortPicker
          allPropKeys={allPropKeys}
          sortConfig={sortConfig}
          onChange={setSortConfig}
          onClose={() => setShowSort(false)}
        />
      )}

      {/* ポモドーロタイマー */}
      <PomodoroTimer />

      {/* 電卓・計算ノート（共有開閉状態：どちらを開いても両方展開） */}
      <CalcPanel open={panelOpen} onOpenChange={setPanelOpen} />
      {tab === 'notes' && <NoteDrawer open={panelOpen} onOpenChange={setPanelOpen} />}


    </div>
    </LabelSettingsProvider>
  )
}
