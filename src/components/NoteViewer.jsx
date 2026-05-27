import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { ArrowLeft, RotateCcw, Trash2, ChevronLeft, ChevronRight, Save, Loader,
         PanelTop, Maximize2, Eraser, Pencil, Copy, Search, Sparkles, X,
         MousePointer2, ChevronsLeft, ChevronsRight, Layers, FileText,
         ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { getNote, saveNote } from './useNotesDB'
import { getDocument, GlobalWorkerOptions, version as pdfjsVersion } from 'pdfjs-dist'
import { loadGeminiSettings, loadNeo4jApiSettings } from './useGemini'

GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`

// iOS Safari は ReadableStream の for-await (Symbol.asyncIterator) 非対応のため
// getTextContent() の代わりに streamTextContent() + reader.read() で実装
async function readTextContent(page, opts = {}) {
  const stream = page.streamTextContent(opts)
  const reader = stream.getReader()
  const result = { items: [], styles: Object.create(null), lang: null }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value.lang != null) result.lang = result.lang ?? value.lang
    Object.assign(result.styles, value.styles)
    result.items.push(...value.items)
  }
  return result
}

// 1文字アイテム配列からクエリのマッチスパン配列を構築
// 戻り値: [{ indices: [charItemIdx, ...] }, ...]  ヒット1件につき1スパン
function buildMatchSpans(items, q, caseSensitive = false) {
  if (!items.length || !q) return []
  const fullText = items.map(it => it.str).join('')
  const haystack = caseSensitive ? fullText : fullText.toLowerCase()
  const spans = []
  let pos = 0
  while ((pos = haystack.indexOf(q, pos)) >= 0) {
    const indices = Array.from({ length: q.length }, (_, i) => pos + i)
    spans.push({ indices })
    pos++
  }
  return spans
}

// 全角ローマ字・数字・記号 → 半角変換 + 連続スペース圧縮
const toHankaku = (str) =>
  str.replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
     .replace(/　/g, ' ')
     .replace(/\s+/g, ' ')
     .trim()

const PEN_COLORS = ['#1e293b','#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ffffff']
const PEN_WIDTHS = [2, 4, 8, 16]

const pinchDist = (t0, t1) => {
  const dx = t0.clientX - t1.clientX; const dy = t0.clientY - t1.clientY
  return Math.sqrt(dx * dx + dy * dy)
}

// pan をコンテナ内に収める（コンテンツが小さければ中央寄せ）
function clampPan(pan, cssDim, zoom, containerDim) {
  const scaled = cssDim * zoom
  if (scaled <= containerDim) return (containerDim - scaled) / 2
  return Math.min(0, Math.max(containerDim - scaled, pan))
}

// 文字種別の相対幅（等幅配分の補正用）
// 日本語句読点・括弧は CJK 文字より狭いため 0.5 に設定
const getCharRelWidth = (c) => {
  if (/[。、．，；：…‥]/.test(c))              return 0.45  // 狭い句読点
  if (/[「」『』【】〔〕〈〉《》（）｛｝]/.test(c)) return 0.5   // 括弧類
  if (/[\x20-\x7E]/.test(c))                   return 0.55  // ASCII
  return 1.0  // CJK・全角文字
}


export default function NoteViewer({ noteId, splitMode, onToggleSplit, onBack,
                                     canPrevNote, canNextNote, onPrevNote, onNextNote,
                                     navHeightRef,
                                     openNotes = [], crossSearchNoteId = null,
                                     onSetCrossSearchTarget, onCrossSearch,
                                     crossSearchQuery = null, onClearCrossSearchQuery,
                                     navBarVisible = true, onToggleNavBar }) {
  const [noteMeta, setNoteMeta]     = useState(null)
  const [pdfDoc, setPdfDoc]         = useState(null)
  const [pageNum, setPageNum]       = useState(() => {
    try { const s = localStorage.getItem(`note_page_${noteId}`); return s ? Math.max(1, parseInt(s, 10)) : 1 }
    catch { return 1 }
  })
  const [totalPages, setTotalPages] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [penColor, setPenColor]     = useState('#1e293b')
  const [penWidth, setPenWidth]     = useState(4)
  const [penMode, setPenMode]       = useState('pen')
  const penModeRef = useRef('pen')
  penModeRef.current = penMode  // レンダーのたびに最新値を同期（useEffect 内の stale closure 対策）
  const [zoomLevel, setZoomLevel]   = useState(1)
  const baseFitScaleRef  = useRef(1)   // fitScale（zoom=1 時のレンダースケール）
  const rerenderTimerRef = useRef(null)
  const pageNumRef       = useRef(1)

  // ---- PDF 内検索 -----------------------------------------------------------
  const [showSearchBar,    setShowSearchBar]    = useState(false)
  const [showCrossTabPicker, setShowCrossTabPicker] = useState(false)
  const [searchText,       setSearchText]       = useState('')
  const [searchMatches,    setSearchMatches]    = useState([])   // textItems のインデックス配列
  const [searchMatchIdx,   setSearchMatchIdx]   = useState(0)    // 現在フォーカス中のマッチ
  const [allPageResults,   setAllPageResults]   = useState(null) // null=未検索, []=なし, [{page,snippet,count}]=あり
  const [searchAllLoading, setSearchAllLoading] = useState(false)
  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pdf_search_history') || '[]') } catch { return [] }
  })
  const [searchMode, setSearchMode] = useState('partial') // 'partial' | 'exact'
  const searchHlCanvasRef  = useRef(null)   // 検索ハイライト専用キャンバス
  const searchTextRef      = useRef('')     // runSearch → renderPage 間で共有
  const searchModeRef      = useRef('partial') // renderPage 内の stale closure 防止
  searchModeRef.current = searchMode
  const searchAllAbortRef  = useRef(null)   // 全ページ検索キャンセル用
  const searchAllTimerRef  = useRef(null)   // デバウンスタイマー
  const historyTimerRef    = useRef(null)   // 履歴保存デバウンスタイマー

  const [selWord, setSelWord]             = useState(null)
  const [popup, setPopup]                 = useState(null)
  const [textItemCount, setTextItemCount] = useState(null)
  const [neo4jJob, setNeo4jJob]           = useState(null) // {status,jobId,graphUrl,error}
  const neo4jPollRef                      = useRef(null)
  const [textDiag, setTextDiag]           = useState('')

  const textItemsRef   = useRef([])   // [{str, tx, ty, w, fontH}] PDF座標
  const viewportRef    = useRef(null) // 現在の pdfjs PageViewport

  const titleSwipeRef      = useRef(null)  // タイトルスワイプによるタブ切替

  const pathsRef           = useRef([])
  const currentPath        = useRef(null)
  const drawingRef         = useRef(false)
  const lastPoint          = useRef(null)
  const pdfCanvasRef       = useRef(null)
  const drawCanvasRef      = useRef(null)
  const wrapperRef         = useRef(null)
  const pinchRef           = useRef(null)
  const zoomRef            = useRef(1)
  const containerRef       = useRef(null)
  const renderVersionRef   = useRef(0)          // レンダー世代管理
  const currentRenderTask  = useRef(null)       // 進行中の renderTask（キャンセル用）
  const canvasCssSizeRef   = useRef({ w: 0, h: 0 }) // CSS サイズキャッシュ（clampPan 用）
  const panRef             = useRef({ x: 0, y: 0 }) // 現在の translate 量（px）
  const autoSaveTimer      = useRef(null)           // 描画の自動保存タイマー
  const pageNumRef         = useRef(pageNum)        // auto-save の stale closure 防止用
  pageNumRef.current = pageNum
  const prevPageNumRef     = useRef(pageNum)        // ページ遷移前の保存に使う前ページ番号
  const panGestureRef      = useRef(null)       // 1本指パン開始情報
  const scrollbarTrackRef  = useRef(null)       // ページスクロールバーのトラック要素

  // 選択ボックス（React state 不使用）
  const selBoxRef    = useRef(null)
  const selBoxDivRef = useRef(null)

  // transform を refs から DOM に適用（レンダー後に毎回同期）
  const applyTransform = useCallback(() => {
    if (!wrapperRef.current) return
    const { x, y } = panRef.current
    wrapperRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoomRef.current})`
  }, [])
  useLayoutEffect(() => { applyTransform() })

  // rerenderAtZoom を useEffect 内から常に最新版で呼べるよう ref に保持
  const rerenderAtZoomRef = useRef(null)
  rerenderAtZoomRef.current = rerenderAtZoom

  // ---- タッチ（ピンチズーム）--------------------------------------------------
  // noteMeta が揃ってから containerRef が DOM に現れるため deps に含める
  useEffect(() => {
    const el = containerRef.current; if (!el) return

    const getRect = () => el.getBoundingClientRect()

    const onStart = (e) => {
      if ([...e.touches].some(t => t.touchType === 'stylus')) return
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDist: pinchDist(e.touches[0], e.touches[1]),
          initialZoom: zoomRef.current,
          initialPan:  { ...panRef.current },
          midX0: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          midY0: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
        panGestureRef.current = null
      } else if (e.touches.length === 1) {
        panGestureRef.current = {
          startX: e.touches[0].clientX, startY: e.touches[0].clientY,
          startPan: { ...panRef.current },
        }
        pinchRef.current = null
      }
    }
    const onMove = (e) => {
      e.preventDefault()
      if (e.touches.length === 2 && pinchRef.current) {
        // ---- ピンチズーム ----
        const dist    = pinchDist(e.touches[0], e.touches[1])
        const newZoom = Math.min(4, Math.max(0.5,
          pinchRef.current.initialZoom * (dist / pinchRef.current.initialDist)))
        const rect = getRect()
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        // ピンチ開始時の画面中心（コンテナ相対）
        const px0 = pinchRef.current.midX0 - rect.left
        const py0 = pinchRef.current.midY0 - rect.top
        // コンテンツ上の固定点（開始時の zoom + pan で計算）
        const { x: p0x, y: p0y } = pinchRef.current.initialPan
        const contentX = (px0 - p0x) / pinchRef.current.initialZoom
        const contentY = (py0 - p0y) / pinchRef.current.initialZoom
        // ピンチ中心の移動量（パン）
        const dpx = midX - pinchRef.current.midX0
        const dpy = midY - pinchRef.current.midY0
        // 新しい pan: コンテンツ固定点を現在のピンチ中心に合わせる + ドラッグ移動
        const rawPanX = (midX - rect.left) - contentX * newZoom
        const rawPanY = (midY - rect.top ) - contentY * newZoom
        const { w: cssW, h: cssH } = canvasCssSizeRef.current
        const cW = el.clientWidth, cH = el.clientHeight
        panRef.current = {
          x: clampPan(rawPanX, cssW, newZoom, cW),
          y: clampPan(rawPanY, cssH, newZoom, cH),
        }
        zoomRef.current = newZoom
        if (wrapperRef.current) {
          const { x, y } = panRef.current
          wrapperRef.current.style.transform = `translate(${x}px,${y}px) scale(${newZoom})`
        }
        setZoomLevel(newZoom)

      } else if (e.touches.length === 1 && panGestureRef.current) {
        // ---- 1本指パン ----
        const dx = e.touches[0].clientX - panGestureRef.current.startX
        const dy = e.touches[0].clientY - panGestureRef.current.startY
        const { w: cssW, h: cssH } = canvasCssSizeRef.current
        const zoom = zoomRef.current
        const cW = el.clientWidth, cH = el.clientHeight
        panRef.current = {
          x: clampPan(panGestureRef.current.startPan.x + dx, cssW, zoom, cW),
          y: clampPan(panGestureRef.current.startPan.y + dy, cssH, zoom, cH),
        }
        if (wrapperRef.current) {
          const { x, y } = panRef.current
          wrapperRef.current.style.transform = `translate(${x}px,${y}px) scale(${zoom})`
        }
      }
    }
    const onEnd = (e) => {
      if ([...e.changedTouches].some(t => t.touchType === 'stylus')) return
      if (e.touches.length === 0) {
        const wasPinching = !!pinchRef.current
        pinchRef.current = null
        panGestureRef.current = null
        if (wasPinching && noteMeta?.type === 'pdf') {
          const zoom = zoomRef.current
          const num  = pageNumRef.current
          clearTimeout(rerenderTimerRef.current)
          rerenderTimerRef.current = setTimeout(() => rerenderAtZoomRef.current?.(zoom, num), 400)
        }
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false }) // preventDefault のため
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, [noteMeta])


  // ---- 初期化 ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const note = await getNote(noteId)
      if (cancelled || !note) return
      setNoteMeta(note); setTotalPages(note.pageCount || 1)
      if (note.type === 'pdf' && note.pdfData) {
        setPdfLoading(true)
        try {
          const raw  = note.pdfData
          const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
          // cMapUrl: 日本語スキャナーが使う Adobe-Japan1 等の CID フォントを解読するために必須
          const doc  = await getDocument({
            data,
            enableXfa: false,
            cMapUrl:    '/cmaps/',
            cMapPacked: true,
          }).promise
          if (!cancelled) { setPdfDoc(doc); setTotalPages(doc.numPages) }
        } catch (e) {
          console.error('PDF load error:', e)
        } finally { if (!cancelled) setPdfLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [noteId])

  // ---- 描画保存/読み込み（renderPage より前に定義：renderPage の deps で参照するため）
  const loadDrawing = useCallback(async (page) => {
    const note = await getNote(noteId); const dataUrl = note?.drawings?.[page]
    const d = drawCanvasRef.current; if (!d) return
    const ctx = d.getContext('2d'); ctx.clearRect(0,0,d.width,d.height)
    pathsRef.current = []
    if (!dataUrl) return
    const img = new Image(); img.onload = () => ctx.drawImage(img,0,0); img.src = dataUrl
  }, [noteId])

  // ---- PDF レンダリング + テキストアイテム取得 ------------------------------
  const renderPage = useCallback(async (num) => {
    if (!pdfDoc || !pdfCanvasRef.current) return

    // 前の renderTask をキャンセルして世代番号を更新
    if (currentRenderTask.current) {
      currentRenderTask.current.cancel()
      currentRenderTask.current = null
    }
    const ver = ++renderVersionRef.current
    const stale = () => ver !== renderVersionRef.current

    let page
    try { page = await pdfDoc.getPage(num) } catch { return }
    if (stale()) { page.cleanup?.(); return }

    const dpr        = window.devicePixelRatio || 1
    const containerEl = containerRef.current
    const containerW  = containerEl?.clientWidth  || window.innerWidth
    // navHeightRef は App.jsx の useEffect で毎レンダー後に更新される
    // fixed ナビバーの分だけ clientHeight から引いて正しい表示可能高さを得る
    const navH       = navHeightRef?.current ?? 0
    const containerH = Math.max((containerEl?.clientHeight || window.innerHeight) - navH, 80)

    const baseVp      = page.getViewport({ scale: 1 })
    // 縦横どちらにもはみ出さないスケールで描画
    const fitScale = Math.min(
      (containerW * dpr) / baseVp.width,
      (containerH * dpr) / baseVp.height,
    )
    baseFitScaleRef.current = fitScale
    pageNumRef.current = num
    const viewport = page.getViewport({ scale: fitScale })
    viewportRef.current = viewport

    // キャンバスサイズ（CSS のみ先に確定、ピクセルサイズはレンダリング後に適用）
    const cssW = viewport.width  / dpr
    const cssH = viewport.height / dpr
    const c = pdfCanvasRef.current
    // 描画キャンバスをリサイズ（リサイズでクリアされるので、直後に保存済み描画を復元）
    const d = drawCanvasRef.current
    d.width = viewport.width; d.height = viewport.height
    d.style.width = `${cssW}px`; d.style.height = `${cssH}px`
    // renderPage がキャンバスをクリアした直後に復元する
    // （useEffect の loadDrawing より後に renderPage が動くと上書きされるバグを防ぐ）
    loadDrawing(num)
    const sh = searchHlCanvasRef.current
    if (sh) { sh.width = viewport.width; sh.height = viewport.height; sh.style.width = `${cssW}px`; sh.style.height = `${cssH}px` }
    canvasCssSizeRef.current = { w: cssW, h: cssH }

    // pan + zoom をリセット（メイン PDF キャンバスはまだ変更しない → 旧ページが残り白フラッシュなし）
    const initPanX = Math.max(0, (containerW - cssW) / 2)
    const initPanY = Math.max(0, (containerH - cssH) / 2)
    panRef.current  = { x: initPanX, y: initPanY }
    zoomRef.current = 1
    setZoomLevel(1)
    if (wrapperRef.current)
      wrapperRef.current.style.transform = `translate(${initPanX}px,${initPanY}px) scale(1)`

    setSearchMatches([]); setSearchMatchIdx(0)

    // ── 一時キャンバスにレンダリング（ダブルバッファ）──────────────────────
    // メインキャンバスに描画完了後に転写することで白フラッシュを排除
    const tmp = document.createElement('canvas')
    tmp.width = viewport.width; tmp.height = viewport.height
    const task = page.render({ canvasContext: tmp.getContext('2d'), viewport })
    currentRenderTask.current = task
    try {
      await task.promise
    } catch (e) {
      page.cleanup?.()
      return
    }
    if (stale()) { page.cleanup?.(); return }
    currentRenderTask.current = null

    // メインキャンバスにアトミックに転写（この2行は同期なので中間状態は描画されない）
    c.width = viewport.width; c.height = viewport.height
    c.style.width = `${cssW}px`; c.style.height = `${cssH}px`
    c.getContext('2d').drawImage(tmp, 0, 0)

    // ── テキスト抽出をブラウザの次描画後に遅延 ─────────────────────────────
    // ページの表示を先に確定させてから処理することで体感速度を向上
    await new Promise(r => setTimeout(r, 0))
    if (stale()) return

    // テキスト抽出: 1パス目でテキストが取れれば 2 パス目をスキップ（約 50% 高速化）
    let best = { items: [] }
    let diagStr = ''
    try {
      const detail = (tc) => {
        const tot = tc.items.length
        const str = tc.items.filter(i => typeof i.str === 'string').length
        const ok  = tc.items.filter(i => i.str?.trim()).length
        return `${tot}(${str}/${ok})`
      }
      const tc1 = await readTextContent(page, {})
      if (stale()) { page.cleanup?.(); return }
      const nonEmpty1 = tc1.items.filter(i => i.str?.trim()).length
      if (nonEmpty1 > 0) {
        // 1パスで十分 → 2パス目をスキップ
        best = tc1
        diagStr = `1:${detail(tc1)}`
      } else {
        // テキストが空のときのみ markedContent 付きで再試行
        const tc2 = await readTextContent(page, { includeMarkedContent: true })
        if (stale()) { page.cleanup?.(); return }
        diagStr = `1:${detail(tc1)} 2:${detail(tc2)}`
        const score = (tc) =>
          tc.items.filter(i => i.str?.trim()).length * 10000 +
          tc.items.filter(i => typeof i.str === 'string').length * 100 +
          tc.items.length
        best = score(tc1) >= score(tc2) ? tc1 : tc2
      }
    } catch (e) {
      diagStr += ` ERR:${String(e).slice(0, 50)}`
    }

    // ページリソース解放（テキスト取得後）
    page.cleanup?.()

    if (stale()) return

    const withStr  = best.items.filter(i => typeof i.str === 'string').length
    const nonEmpty = best.items.filter(i => i.str?.trim()).length
    setTextDiag(`${diagStr} →best:${withStr}/${nonEmpty}`)

    const items = []
    for (const item of best.items) {
      if (typeof item.str !== 'string') continue
      const [ia, ib, ic, id, tx, ty] = item.transform
      const fontH = Math.abs(item.height) > 0.5
        ? item.height
        : (Math.sqrt(ic*ic + id*id) || Math.sqrt(ia*ia + ib*ib) || 10)
      const w = Math.abs(item.width)
      if (w < 0.01 || item.str.length === 0) continue

      const chars   = [...item.str]
      const weights = chars.map(getCharRelWidth)
      const totalW  = weights.reduce((s, v) => s + v, 0) || 1
      let cumW = 0
      chars.forEach((ch, i) => {
        const wt = weights[i]
        if (!ch.trim()) { cumW += wt; return }
        const r0 = cumW / totalW, r1 = (cumW + wt) / totalW
        const cTx = tx + w * r0, cW = w * (r1 - r0)
        cumW += wt
        items.push({ str: ch, tx: cTx, ty, w: cW, fontH })
      })
    }

    textItemsRef.current = items
    setTextItemCount(
      withStr  === 0 ? -1 :
      nonEmpty === 0 ? -2 :
      items.length
    )

    // ── 文字認識ベースの安全確認ズーム ──────────────────────────────────────
    // fitScale 後もテキストがナビバーに隠れていないかを確認し、必要なら縮小。
    if (items.length > 0 && viewportRef.current && wrapperRef.current) {
      const [,,,dvp,,fvp] = viewportRef.current.transform
      let bottomCssY = 0
      for (const item of items) {
        const y = (dvp * item.ty + fvp) / dpr
        if (y > bottomCssY) bottomCssY = y
      }
      // container 内での文字最下端（zoom=1, pan=initPan）
      const textBottom = initPanY + bottomCssY
      if (bottomCssY > 0 && textBottom > containerH - 4) {
        const z = (containerH - initPanY - 4) / bottomCssY
        if (z > 0.1 && z < 0.9999) {
          const px = Math.max(0, (containerW - cssW * z) / 2)
          zoomRef.current = z
          setZoomLevel(z)
          panRef.current = { x: px, y: initPanY }
          wrapperRef.current.style.transform = `translate(${px}px,${initPanY}px) scale(${z})`
        }
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // 検索クエリが残っていれば現在ページを再検索してハイライト
    const cs = searchModeRef.current === 'exact'
    const activeQ = cs ? searchTextRef.current.trim() : searchTextRef.current.trim().toLowerCase()
    if (activeQ) {
      const spans = buildMatchSpans(items, activeQ, cs)
      setSearchMatches(spans); setSearchMatchIdx(0)
      Promise.resolve().then(() => {
        drawSearchHL(spans, 0)
        if (spans.length) scrollToMatch(spans, 0)
      })
    }

    // OCR キャッシュ（fire and forget）
    if (items.length > 0) {
      const pageText = items.map(i => i.str).join(' ')
      getNote(noteId).then(n => {
        if (!n) return
        const prev = n.ocrText || ''
        if (prev.includes(pageText.slice(0, 40))) return
        saveNote({ ...n, ocrText: (prev + '\n' + pageText).trim().slice(-12000) }).catch(() => {})
      }).catch(() => {})
    }

    setSelWord(null); setPopup(null)
  }, [pdfDoc, noteId, loadDrawing])

  // ---- ズーム後の高解像度再レンダリング ----------------------------------------
  const rerenderAtZoom = useCallback(async (zoom, num) => {
    if (!pdfDoc || !pdfCanvasRef.current || zoom < 1.1) return
    if (currentRenderTask.current) {
      currentRenderTask.current.cancel()
      currentRenderTask.current = null
    }
    const ver = ++renderVersionRef.current
    const stale = () => ver !== renderVersionRef.current
    let page
    try { page = await pdfDoc.getPage(num) } catch { return }
    if (stale()) { page.cleanup?.(); return }
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: baseFitScaleRef.current * zoom })
    viewportRef.current = viewport
    const cssW = viewport.width / dpr
    const cssH = viewport.height / dpr
    const d = drawCanvasRef.current
    d.width = viewport.width; d.height = viewport.height
    d.style.width = `${cssW}px`; d.style.height = `${cssH}px`
    loadDrawing(num)
    const sh = searchHlCanvasRef.current
    if (sh) { sh.width = viewport.width; sh.height = viewport.height; sh.style.width = `${cssW}px`; sh.style.height = `${cssH}px` }
    canvasCssSizeRef.current = { w: cssW, h: cssH }
    // pan はそのまま維持、CSS zoom のみ 1 にリセット
    zoomRef.current = 1
    setZoomLevel(1)
    if (wrapperRef.current) {
      const { x, y } = panRef.current
      wrapperRef.current.style.transform = `translate(${x}px,${y}px) scale(1)`
    }
    const tmp = document.createElement('canvas')
    tmp.width = viewport.width; tmp.height = viewport.height
    const task = page.render({ canvasContext: tmp.getContext('2d'), viewport })
    currentRenderTask.current = task
    try { await task.promise } catch { page.cleanup?.(); return }
    if (stale()) { page.cleanup?.(); return }
    currentRenderTask.current = null
    const c = pdfCanvasRef.current
    c.width = viewport.width; c.height = viewport.height
    c.style.width = `${cssW}px`; c.style.height = `${cssH}px`
    c.getContext('2d').drawImage(tmp, 0, 0)
    page.cleanup?.()
  }, [pdfDoc, loadDrawing])

  useEffect(() => {
    if (!pdfDoc) return
    const prevPage = prevPageNumRef.current
    prevPageNumRef.current = pageNum
    clearTimeout(autoSaveTimer.current)

    if (prevPage !== pageNum) {
      // ページ遷移前のキャンバスを同期的にスナップショット → バックグラウンド保存
      const canvas = drawCanvasRef.current
      const snapshot = canvas && canvas.width > 0 && pathsRef.current.length > 0
        ? canvas.toDataURL('image/png')
        : null
      pathsRef.current = []
      renderPage(pageNum)
      if (snapshot) {
        ;(async () => {
          try {
            const note = await getNote(noteId)
            if (!note) return
            const drawings = { ...(note.drawings || {}) }
            drawings[prevPage] = snapshot
            await saveNote({ ...note, drawings })
          } catch {}
        })()
      }
    } else {
      pathsRef.current = []
      renderPage(pageNum)
    }
  }, [pdfDoc, pageNum, noteId, renderPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // コンテナサイズ変化時（分割/通常切替、ナビバー表示切替など）に PDF を再レンダリング
  // → panRef を新しいコンテナサイズに合わせて更新することでペン座標ズレを防ぐ
  useEffect(() => {
    const container = containerRef.current
    if (!container || !pdfDoc) return
    let raf = null
    let initial = true  // 初回発火（observe() 直後の強制通知）はスキップ
    const observer = new ResizeObserver(() => {
      if (initial) { initial = false; return }
      if (!pdfCanvasRef.current || pdfCanvasRef.current.width === 0) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => renderPage(pageNum))
    })
    observer.observe(container)
    return () => { observer.disconnect(); cancelAnimationFrame(raf) }
  }, [pdfDoc, pageNum, renderPage])

  // ---- 白紙初期化 -----------------------------------------------------------
  useEffect(() => {
    if (!noteMeta || noteMeta.type !== 'blank' || !pdfCanvasRef.current) return
    const raf = requestAnimationFrame(() => {
      const c = pdfCanvasRef.current; if (!c) return
      const dpr  = window.devicePixelRatio || 1
      const cssW = Math.min(window.innerWidth - 16, 600)
      const cssH = Math.round(cssW * 1.414)
      c.width = cssW * dpr; c.height = cssH * dpr
      c.style.width = `${cssW}px`; c.style.height = `${cssH}px`
      const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height)
      const d = drawCanvasRef.current
      if (d) { d.width=c.width; d.height=c.height; d.style.width=c.style.width; d.style.height=c.style.height }
    })
    return () => cancelAnimationFrame(raf)
  }, [noteMeta])

  useEffect(() => { loadDrawing(pageNum) }, [pageNum, loadDrawing])
  // ページ番号をリロード後も復元
  useEffect(() => {
    try { localStorage.setItem(`note_page_${noteId}`, String(pageNum)) } catch {}
  }, [noteId, pageNum])

  const handleSave = async () => {
    setSaving(true)
    try {
      const note = await getNote(noteId); const drawings = note?.drawings || {}
      drawings[pageNum] = drawCanvasRef.current?.toDataURL('image/png') ?? ''
      await saveNote({ ...note, drawings })
    } finally { setSaving(false) }
  }

  // ---- 描画 ----------------------------------------------------------------
  // CSS zoom 対応: container 基準で座標を計算してズームを明示的に除去する
  const clientToCanvasPx = (clientX, clientY) => {
    const canvas = drawCanvasRef.current; if (!canvas) return { x: 0, y: 0 }
    const container = containerRef.current; if (!container) return { x: 0, y: 0 }
    const rect = container.getBoundingClientRect()
    const { x: panX, y: panY } = panRef.current
    const zoom = zoomRef.current
    const cssW = parseFloat(canvas.style.width)  || 1
    const cssH = parseFloat(canvas.style.height) || 1
    // client → コンテナ相対 → pan を引く → zoom で割る → canvas px
    const cx = ((clientX - rect.left) - panX) / zoom
    const cy = ((clientY - rect.top ) - panY) / zoom
    return { x: cx / cssW * canvas.width, y: cy / cssH * canvas.height }
  }
  const getPoint = (e) => {
    const src = e.touches ? e.touches[0] : e
    return clientToCanvasPx(src.clientX, src.clientY)
  }
  const applyStroke = (ctx, path) => {
    ctx.globalCompositeOperation = path.composite||'source-over'
    ctx.strokeStyle=path.color; ctx.lineWidth=path.width
    ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath()
    path.points.forEach((p,i)=>i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y))
    ctx.stroke(); ctx.globalCompositeOperation='source-over'
  }
  const redrawAll = () => {
    const d = drawCanvasRef.current; if (!d) return
    const ctx = d.getContext('2d')
    ctx.globalCompositeOperation='source-over'; ctx.clearRect(0,0,d.width,d.height)
    pathsRef.current.forEach(p=>applyStroke(ctx,p))
  }

  // ---- テキスト選択: viewport 逆変換で PDF 座標に変換して照合 ----------------
  const updateSelBoxDiv = (x1,y1,x2,y2) => {
    const div = selBoxDivRef.current; if (!div) return
    div.style.display='block'
    div.style.left=`${Math.min(x1,x2)}px`; div.style.top=`${Math.min(y1,y2)}px`
    div.style.width=`${Math.abs(x2-x1)}px`; div.style.height=`${Math.abs(y2-y1)}px`
  }
  const hideSelBoxDiv = () => { const div=selBoxDivRef.current; if(div) div.style.display='none' }

  // ---- PDF 内検索 ----------------------------------------------------------

  // 全ページを順に読んでマッチ一覧を構築
  const searchAllPages = useCallback(async (q, caseSensitive = false) => {
    if (!pdfDoc || !q) return
    const abort = { aborted: false }
    searchAllAbortRef.current = abort
    setSearchAllLoading(true); setAllPageResults(null)
    const results = []
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      if (abort.aborted) { setSearchAllLoading(false); return }
      try {
        const page = await pdfDoc.getPage(p)
        const tc   = await readTextContent(page, {})
        const text = tc.items.filter(i => i.str?.trim()).map(i => i.str).join('')
        const haystack = caseSensitive ? text : text.toLowerCase()
        if (!haystack.includes(q)) continue
        let count = 0, idx = 0
        while ((idx = haystack.indexOf(q, idx)) >= 0) { count++; idx++ }
        const fi    = haystack.indexOf(q)
        const start = Math.max(0, fi - 20)
        const end   = Math.min(text.length, fi + q.length + 20)
        const snip  = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
        results.push({ page: p, snippet: snip, count })
      } catch {}
    }
    if (!abort.aborted) { setAllPageResults(results); setSearchAllLoading(false) }
  }, [pdfDoc])

  // ハイライトを searchHlCanvas に描画（spans = [{indices:[...]}]）
  const drawSearchHL = useCallback((spans, curIdx) => {
    const hc = searchHlCanvasRef.current; if (!hc) return
    const ctx = hc.getContext('2d')
    ctx.clearRect(0, 0, hc.width, hc.height)
    if (!spans.length) return
    const vt = viewportRef.current?.transform; if (!vt) return
    const [a,,,dv,e,f] = vt
    const items = textItemsRef.current
    spans.forEach((span, si) => {
      const isCur = si === curIdx
      const rects = span.indices.map(idx => {
        const it = items[idx]; if (!it) return null
        const x1 = a * it.tx + e, x2 = a * (it.tx + it.w) + e
        const y1 = dv * (it.ty + it.fontH) + f, y2 = dv * it.ty + f
        return { lx: Math.min(x1,x2), rx: Math.max(x1,x2), ty: Math.min(y1,y2), h: Math.abs(y2-y1) }
      }).filter(Boolean)
      if (!rects.length) return
      ctx.fillStyle = isCur ? 'rgba(255,140,0,0.55)' : 'rgba(255,230,0,0.35)'
      rects.forEach(r => ctx.fillRect(r.lx, r.ty, r.rx - r.lx, r.h))
      if (isCur) {
        const minX = Math.min(...rects.map(r => r.lx))
        const maxX = Math.max(...rects.map(r => r.rx))
        const minY = Math.min(...rects.map(r => r.ty))
        const maxY = Math.max(...rects.map(r => r.ty + r.h))
        ctx.strokeStyle = 'rgba(255,100,0,0.9)'; ctx.lineWidth = 2
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      }
    })
  }, [])

  // マッチスパンが見えるよう pan を調整
  const scrollToMatch = useCallback((spans, idx) => {
    const span = spans[idx]; if (!span?.indices.length) return
    const it = textItemsRef.current[span.indices[0]]; if (!it) return
    const vt = viewportRef.current?.transform; if (!vt) return
    const [a,,,dv,e,f] = vt
    const canvasY = Math.min(dv * (it.ty + it.fontH) + f, dv * it.ty + f)
    const dpr = window.devicePixelRatio || 1
    const cssY = canvasY / dpr   // unscaled CSS 座標
    const container = containerRef.current; if (!container) return
    const { w: cssW, h: cssH } = canvasCssSizeRef.current
    const zoom = zoomRef.current
    const cW = container.clientWidth, cH = container.clientHeight
    const targetPanY = cH / 3 - cssY * zoom
    const newPan = {
      x: clampPan(panRef.current.x, cssW, zoom, cW),
      y: clampPan(targetPanY,       cssH, zoom, cH),
    }
    panRef.current = newPan
    if (wrapperRef.current) {
      wrapperRef.current.style.transition = 'transform 0.25s ease'
      wrapperRef.current.style.transform  = `translate(${newPan.x}px,${newPan.y}px) scale(${zoom})`
      setTimeout(() => { if (wrapperRef.current) wrapperRef.current.style.transition = '' }, 260)
    }
  }, [])

  // 検索履歴の追加・削除
  const addToHistory = useCallback((query) => {
    if (!query.trim()) return
    setSearchHistory(prev => {
      const next = [query, ...prev.filter(h => h !== query)].slice(0, 20)
      try { localStorage.setItem('pdf_search_history', JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const removeFromHistory = useCallback((query) => {
    setSearchHistory(prev => {
      const next = prev.filter(h => h !== query)
      try { localStorage.setItem('pdf_search_history', JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  // 検索実行（現在ページ即時 + 全ページデバウンス）
  const runSearch = useCallback((query, modeOverride) => {
    const converted = toHankaku(query)
    searchTextRef.current = converted
    setSearchText(converted)
    const mode = modeOverride ?? searchModeRef.current
    const caseSensitive = mode === 'exact'
    const q = caseSensitive ? converted : converted.toLowerCase()
    if (!q) {
      setSearchMatches([]); setSearchMatchIdx(0); drawSearchHL([], 0)
      setAllPageResults(null); setSearchAllLoading(false)
      if (searchAllAbortRef.current) searchAllAbortRef.current.aborted = true
      clearTimeout(searchAllTimerRef.current)
      clearTimeout(historyTimerRef.current)
      return
    }
    // 1秒後に履歴保存（入力が落ち着いてから）
    clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(() => addToHistory(converted), 1000)
    // 現在ページを即時ハイライト
    const spans = buildMatchSpans(textItemsRef.current, q, caseSensitive)
    setSearchMatches(spans); setSearchMatchIdx(0)
    drawSearchHL(spans, 0)
    if (spans.length) scrollToMatch(spans, 0)
    // 全ページ検索をデバウンス（400ms）
    if (searchAllAbortRef.current) searchAllAbortRef.current.aborted = true
    clearTimeout(searchAllTimerRef.current)
    searchAllTimerRef.current = setTimeout(() => searchAllPages(q, caseSensitive), 400)
  }, [drawSearchHL, scrollToMatch, searchAllPages, addToHistory])

  // 検索モード切替時に現在のクエリで再検索
  useEffect(() => {
    if (searchTextRef.current.trim()) runSearch(searchTextRef.current, searchMode)
  }, [searchMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const goPrev = useCallback(() => {
    if (!searchMatches.length) return
    const idx = (searchMatchIdx - 1 + searchMatches.length) % searchMatches.length
    setSearchMatchIdx(idx)
    drawSearchHL(searchMatches, idx)
    scrollToMatch(searchMatches, idx)
  }, [searchMatches, searchMatchIdx, drawSearchHL, scrollToMatch])

  const goNext = useCallback(() => {
    if (!searchMatches.length) return
    const idx = (searchMatchIdx + 1) % searchMatches.length
    setSearchMatchIdx(idx)
    drawSearchHL(searchMatches, idx)
    scrollToMatch(searchMatches, idx)
  }, [searchMatches, searchMatchIdx, drawSearchHL, scrollToMatch])

  const closeSearchBar = useCallback(() => {
    // 閉じる時点の検索ワードを即時履歴保存
    clearTimeout(historyTimerRef.current)
    if (searchTextRef.current.trim()) addToHistory(searchTextRef.current)
    searchTextRef.current = ''
    if (searchAllAbortRef.current) searchAllAbortRef.current.aborted = true
    clearTimeout(searchAllTimerRef.current)
    setShowSearchBar(false); setShowCrossTabPicker(false); setSearchText('')
    setSearchMatches([]); setSearchMatchIdx(0)
    setAllPageResults(null); setSearchAllLoading(false)
    const hc = searchHlCanvasRef.current; if (hc) hc.getContext('2d').clearRect(0, 0, hc.width, hc.height)
  }, [addToHistory])

  // 他タブからのクロス検索トリガー：このノートが対象のとき検索を自動実行
  const runSearchRef = useRef(null)
  runSearchRef.current = runSearch
  useEffect(() => {
    if (!crossSearchQuery) return
    setShowSearchBar(true)
    runSearchRef.current?.(crossSearchQuery)
    onClearCrossSearchQuery?.()
  }, [crossSearchQuery, onClearCrossSearchQuery])

  // ---- テキスト選択 --------------------------------------------------------
  const matchTextInBox = useCallback((cliX1, cliY1, cliX2, cliY2) => {
    const vp = viewportRef.current; if (!vp) return
    const canvas = drawCanvasRef.current; if (!canvas) return

    // client → canvas px 座標（CSS zoom を明示的に補正）
    const { x: cpx1, y: cpy1 } = clientToCanvasPx(cliX1, cliY1)
    const { x: cpx2, y: cpy2 } = clientToCanvasPx(cliX2, cliY2)

    // canvas px → PDF 座標: viewport.transform の逆変換
    // vt = [a, b, c, d, e, f]  (一般に b=c=0 の portrait)
    const [a,,, d, e, f] = vp.transform
    const toPdfX = (cx) => (cx - e) / a
    const toPdfY = (cy) => (cy - f) / d   // d < 0 なので y 反転

    const pdfX1 = Math.min(toPdfX(cpx1), toPdfX(cpx2))
    const pdfX2 = Math.max(toPdfX(cpx1), toPdfX(cpx2))
    const pdfY1 = Math.min(toPdfY(cpy1), toPdfY(cpy2))
    const pdfY2 = Math.max(toPdfY(cpy1), toPdfY(cpy2))

    // オーバーラップ率付き照合
    // 句読点は位置推定の誤差が大きいため、より高いオーバーラップ率を要求
    const isPunct = (c) => /[。、．，；：…‥「」『』【】〔〕〈〉《》（）｛｝！？]/.test(c)
    const matched = []
    for (const item of textItemsRef.current) {
      if (!item.str.trim()) continue
      const iX1 = item.tx, iX2 = item.tx + item.w
      const iY1 = Math.min(item.ty, item.ty + item.fontH)
      const iY2 = Math.max(item.ty, item.ty + item.fontH)

      const xL = Math.max(iX1, pdfX1), xR = Math.min(iX2, pdfX2)
      const yB = Math.max(iY1, pdfY1), yT = Math.min(iY2, pdfY2)
      if (xR <= xL || yT <= yB) continue  // オーバーラップなし

      // X 方向のオーバーラップ率（文字幅に対する割合）
      const xRatio = (xR - xL) / (iX2 - iX1)
      // 句読点は 40%、通常文字は 15% 以上のオーバーラップを要求
      const minRatio = isPunct(item.str) ? 0.4 : 0.15
      if (xRatio < minRatio) continue

      matched.push(item)
    }
    if (!matched.length) return

    // 読み順ソート（PDF y軸は上向き: ty 大＝上 → 降順、同行なら tx 昇順）
    matched.sort((a, b) => {
      const ld = b.ty - a.ty
      if (Math.abs(ld) > Math.max(a.fontH, b.fontH) * 0.4) return ld
      return a.tx - b.tx
    })

    // CJK文字同士はスペースなし、英数字間はスペースあり、行替えは改行
    const isCJK = (c) => c && /[　-鿿豈-﫿︰-﹏＀-￯]/.test(c)
    let text = ''
    for (let i = 0; i < matched.length; i++) {
      const cur = matched[i]
      if (i === 0) { text += cur.str; continue }
      const prev = matched[i - 1]
      const gap = Math.abs(cur.ty - prev.ty)
      if (gap > Math.max(cur.fontH, prev.fontH) * 0.4) {
        text += '\n'
      } else if (!isCJK(prev.str.slice(-1)) || !isCJK(cur.str[0])) {
        text += ' '
      }
      text += cur.str
    }

    return text
  }, [])

  const extractTextInBox = useCallback((cliX1, cliY1, cliX2, cliY2) => {
    const text = matchTextInBox(cliX1, cliY1, cliX2, cliY2)
    if (!text) return
    setSelWord({ str: text })
    setPopup({ screenX:(cliX1+cliX2)/2, screenY:Math.max(cliY1,cliY2)+8 })
  }, [matchTextInBox])

  const closePopup   = () => { setSelWord(null); setPopup(null) }

  const handleCopy = () => {
    // navigator.clipboard は iOS で失敗するケースがあるため execCommand で同期コピー
    const ta = document.createElement('textarea')
    ta.value = toHankaku(selWord.str)
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    closePopup()  // 必ず呼ばれる（clipboard エラーでブロックされない）
  }

  // Chrome 指定で開く（googlechromes:// スキーム）
  // 「Chromeで開きますか？」が表示されるが Chrome が確実に開く。未インストール時は Safari へフォールバック
  const openInChrome = (httpsUrl) => {
    const scheme = httpsUrl.replace(/^https:\/\//, 'googlechromes://')
    let opened = false
    const onBlur = () => { opened = true }
    window.addEventListener('blur', onBlur, { once: true })
    window.location.href = scheme
    setTimeout(() => {
      window.removeEventListener('blur', onBlur)
      if (!opened) window.open(httpsUrl, '_blank')
    }, 1500)
  }

  const handleGoogle = () => {
    openInChrome(`https://www.google.com/search?q=${encodeURIComponent(toHankaku(selWord.str))}`)
    closePopup()
  }

  // YouTube：Universal Link → YouTube アプリ（ダイアログなし）
  const handleYouTube = () => {
    window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(toHankaku(selWord.str))}`
    closePopup()
  }

  // Gemini：プロンプトをクリップボードにコピーして Chrome で開く
  const handleGemini = () => {
    const { pdfPrompt } = loadGeminiSettings()
    const template = pdfPrompt?.trim() || '以下のテキストを日本語で説明してください：'
    const fullText = `${template}\n\n${toHankaku(selWord.str)}`
    const ta = document.createElement('textarea')
    ta.value = fullText
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
    openInChrome('https://gemini.google.com/app')
    closePopup()
  }

  // Neo4j：選択テキストを concept として analogy-api に送信し、結果をポーリング
  const handleNeo4j = async () => {
    const { url } = loadNeo4jApiSettings()
    if (!url) { alert('Neo4j API URL が未設定です（設定タブ）'); return }
    const concept = toHankaku(selWord.str)
    closePopup()
    if (neo4jPollRef.current) clearInterval(neo4jPollRef.current)
    setNeo4jJob({ status: 'running', jobId: null })
    try {
      const base = url.replace(/\/run_graph\/?$/, '')
      const res = await fetch(`${base}/run_graph?concept=${encodeURIComponent(concept)}`)
      const { job_id } = await res.json()
      setNeo4jJob({ status: 'running', jobId: job_id })
      let tries = 0
      neo4jPollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${base}/result/${job_id}`)
          const d = await r.json()
          if (d.data?.status === 'done') {
            clearInterval(neo4jPollRef.current)
            setNeo4jJob({ status: 'done', jobId: job_id, graphUrl: d.data.graph_url })
          } else if (d.data?.status === 'error') {
            clearInterval(neo4jPollRef.current)
            setNeo4jJob({ status: 'error', jobId: job_id, error: d.data.error })
          }
        } catch {}
        if (++tries >= 20) clearInterval(neo4jPollRef.current)
      }, 3000)
    } catch (e) {
      setNeo4jJob({ status: 'error', error: e.message })
    }
  }

  // ---- スタイラスダブルタップ：touchend + touchType='stylus' で確実検知 ----------
  useEffect(() => {
    const canvas = drawCanvasRef.current
    if (!canvas) return
    let lastTap = 0
    const onTouchEnd = (e) => {
      const t = e.changedTouches[0]
      if (!t || t.touchType === 'stylus') return  // スタイラスは除外、指のみ検知
      const now = Date.now()
      if (now - lastTap < 400) {
        lastTap = 0
        // 関数型 update で最新の penMode を参照（stale closure 回避）
        setPenMode(m => m === 'text' ? m : m === 'eraser' ? 'pen' : 'eraser')
      } else {
        lastTap = now
      }
    }
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => canvas.removeEventListener('touchend', onTouchEnd)
  }, [noteMeta])  // noteMeta 確定後にキャンバスが DOM に現れる

  // ---- 指の長押し：700ms でテキスト選択モードに切替 + そのままドラッグで選択 ----
  useEffect(() => {
    const canvas = drawCanvasRef.current
    if (!canvas || !noteMeta) return

    let timer = null
    let active = false  // 長押し確定後のドラッグ中
    let sx = 0, sy = 0

    const onStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (t.touchType === 'stylus') return  // ペン先は別ハンドラ
      active = false
      sx = t.clientX; sy = t.clientY
      timer = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(40)
        if (penModeRef.current === 'text') {
          // すでに選択モード → ペンモードに戻す
          setPenMode('pen')
          active = false
        } else {
          // 選択モードに切替 + ドラッグ選択開始
          setPenMode('text')
          active = true
          selBoxRef.current = { x1: sx, y1: sy, x2: sx, y2: sy }
          updateSelBoxDiv(sx, sy, sx, sy)
        }
      }, 700)
    }

    const onMove = (e) => {
      const t = e.touches[0]; if (!t) return
      if (timer && !active) {
        // 少しでも動いたら長押しキャンセル（パン操作）
        if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) {
          clearTimeout(timer); timer = null
        }
      }
      if (active) {
        e.stopPropagation()  // パンジェスチャーへの伝播を防止
        selBoxRef.current = { x1: sx, y1: sy, x2: t.clientX, y2: t.clientY }
        updateSelBoxDiv(sx, sy, t.clientX, t.clientY)
      }
    }

    const onEnd = () => {
      clearTimeout(timer); timer = null
      if (!active) return
      active = false
      hideSelBoxDiv()
      const box = selBoxRef.current; selBoxRef.current = null
      if (!box) return
      let { x1, y1, x2, y2 } = box
      if (x1 > x2) [x1, x2] = [x2, x1]
      if (y1 > y2) [y1, y2] = [y2, y1]
      // タップ（移動なし）は中心に余白を付けて近傍テキストを取得
      if (x2 - x1 < 20 && y2 - y1 < 20) {
        const cx = (x1+x2)/2, cy = (y1+y2)/2
        x1=cx-25; x2=cx+25; y1=cy-18; y2=cy+18
      }
      extractTextInBox(x1, y1, x2, y2)
    }

    const onCancel = () => {
      clearTimeout(timer); timer = null
      active = false; hideSelBoxDiv(); selBoxRef.current = null
    }

    canvas.addEventListener('touchstart',  onStart,  { passive: true })
    canvas.addEventListener('touchmove',   onMove,   { passive: false })
    canvas.addEventListener('touchend',    onEnd,    { passive: true })
    canvas.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      canvas.removeEventListener('touchstart',  onStart)
      canvas.removeEventListener('touchmove',   onMove)
      canvas.removeEventListener('touchend',    onEnd)
      canvas.removeEventListener('touchcancel', onCancel)
    }
  }, [noteMeta, extractTextInBox])

  // ---- ポインタハンドラ -----------------------------------------------------
  const onPointerDown = (e) => {
    if (e.pointerType !== 'pen') return
    setSelWord(null); setPopup(null)
    e.preventDefault()
    if (penMode === 'text') {
      selBoxRef.current = { x1:e.clientX, y1:e.clientY, x2:e.clientX, y2:e.clientY }
      updateSelBoxDiv(e.clientX, e.clientY, e.clientX, e.clientY)
      return
    }
    const pt = getPoint(e)
    drawingRef.current=true; lastPoint.current=pt
    currentPath.current = {
      color:penColor, width:penMode==='eraser'?penWidth*3:penWidth,
      composite:penMode==='eraser'?'destination-out':'source-over', points:[pt]
    }
  }
  const onPointerMove = (e) => {
    if (e.pointerType !== 'pen') return
    if (penMode === 'text') {
      if (!selBoxRef.current) return
      selBoxRef.current.x2=e.clientX; selBoxRef.current.y2=e.clientY
      updateSelBoxDiv(selBoxRef.current.x1, selBoxRef.current.y1, e.clientX, e.clientY)
      return
    }
    if (!drawingRef.current || !currentPath.current) return
    e.preventDefault()
    const pt = getPoint(e)
    currentPath.current.points.push(pt)
    applyStroke(drawCanvasRef.current.getContext('2d'),
                { ...currentPath.current, points:[lastPoint.current, pt] })
    lastPoint.current = pt
  }
  const onPointerUp = (e) => {
    if (e?.pointerType !== 'pen') return
    if (penMode === 'text') {
      hideSelBoxDiv()
      const box = selBoxRef.current; selBoxRef.current=null
      if (!box || noteMeta?.type !== 'pdf') return
      let { x1,y1,x2,y2 } = box
      if (x1>x2)[x1,x2]=[x2,x1]; if (y1>y2)[y1,y2]=[y2,y1]
      // タップ（小さい選択）は 25px の余白を付ける（精度向上）
      if (x2-x1 < 20 && y2-y1 < 20) {
        const cx=(x1+x2)/2, cy=(y1+y2)/2
        x1=cx-25; x2=cx+25; y1=cy-18; y2=cy+18
      }
      extractTextInBox(x1,y1,x2,y2)
      return
    }
    if (currentPath.current) { pathsRef.current.push(currentPath.current); currentPath.current=null }
    drawingRef.current=false

    // ストローク完了後 1.5 秒で自動保存（再更新時も描画を保持）
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      try {
        const note = await getNote(noteId)
        if (!note) return
        const drawings = { ...(note.drawings || {}) }
        drawings[pageNumRef.current] = drawCanvasRef.current?.toDataURL('image/png') ?? ''
        await saveNote({ ...note, drawings })
      } catch {}
    }, 1500)
  }


  if (!noteMeta) return (
    <div style={{flex:1,minHeight:0,display:'flex',alignItems:'center',justifyContent:'center',background:'white'}}>
      <Loader size={28} className="animate-spin text-slate-400" />
    </div>
  )

  return (
    <div style={{flex:1,minHeight:0,display:'flex',flexDirection:'column',background:'white'}}>

      {/* Row 1: タイトルエリアを左右スワイプでタブ切替 */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 bg-white border-b border-slate-200">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 active:bg-slate-200 shrink-0"><ArrowLeft size={16}/></button>

        {/* スワイプ可能なタイトルエリア ← 左スワイプ=次, 右スワイプ=前 */}
        <div className="flex-1 min-w-0 flex items-center gap-1 select-none"
          onTouchStart={e => { if (e.touches.length === 1) titleSwipeRef.current = e.touches[0].clientX }}
          onTouchEnd={e => {
            if (titleSwipeRef.current === null) return
            const dx = e.changedTouches[0].clientX - titleSwipeRef.current
            titleSwipeRef.current = null
            if (dx > 50 && canPrevNote) onPrevNote()
            if (dx < -50 && canNextNote) onNextNote()
          }}>
          {/* 前タブ矢印 */}
          {canPrevNote && (
            <button onClick={e => { e.stopPropagation(); onPrevNote() }}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-400 active:text-slate-700 active:bg-slate-100">
              <ChevronLeft size={14}/>
            </button>
          )}
          <p className="flex-1 text-sm font-semibold text-slate-800 truncate min-w-0">{noteMeta.name}</p>
          {/* タブ位置インジケータ */}
          {openNotes.length > 1 && (
            <span className="text-[10px] text-slate-400 tabular-nums shrink-0 font-medium">
              {openNotes.findIndex(n => n.id === noteId) + 1}/{openNotes.length}
            </span>
          )}
          {/* 次タブ矢印 */}
          {canNextNote && (
            <button onClick={e => { e.stopPropagation(); onNextNote() }}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-400 active:text-slate-700 active:bg-slate-100">
              <ChevronRight size={14}/>
            </button>
          )}
        </div>

        {pdfLoading && <Loader size={14} className="text-slate-400 animate-spin shrink-0"/>}
        {noteMeta.type==='pdf' && <span className="text-xs text-slate-500 tabular-nums shrink-0">{pageNum}/{totalPages}</span>}
        <button onClick={onToggleSplit} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200 shrink-0">
          {splitMode?<Maximize2 size={14}/>:<PanelTop size={14}/>}
        </button>
        {onToggleNavBar && (
          <button onClick={onToggleNavBar} title={navBarVisible?'タブバーを隠す':'タブバーを表示'}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-500 active:bg-slate-200 shrink-0">
            {navBarVisible?<ChevronDown size={14}/>:<ChevronUp size={14}/>}
          </button>
        )}
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-neo-600 text-white text-xs font-semibold active:bg-neo-700 disabled:opacity-50 shrink-0">
          {saving?<Loader size={11} className="animate-spin"/>:<Save size={11}/>} 保存
        </button>
      </div>

      {/* Row 2: 描画ツール */}
      <div className="shrink-0 flex items-center gap-2 px-2 py-1 bg-white border-b border-slate-200 overflow-x-auto scrollbar-hide">
        <div className={`flex items-center gap-2 transition-opacity ${penMode==='text'?'opacity-40 pointer-events-none':''}`}>
          <button onClick={()=>setPenMode(m=>m==='eraser'?'pen':'eraser')}
            className={`w-7 h-7 flex items-center justify-center rounded-lg border shrink-0 transition-colors ${penMode==='eraser'?'bg-amber-100 border-amber-400 text-amber-600':'bg-white border-slate-200 text-slate-500'}`}>
            {penMode==='eraser'?<Pencil size={13}/>:<Eraser size={13}/>}
          </button>
          <div className="w-px h-5 bg-slate-200 shrink-0"/>
          <div className={`flex gap-1 shrink-0 transition-opacity ${penMode==='eraser'?'opacity-30 pointer-events-none':''}`}>
            {PEN_COLORS.map(c=>(
              <button key={c} onClick={()=>setPenColor(c)}
                className="w-5 h-5 rounded-full border-2 shrink-0 transition-transform active:scale-90"
                style={{backgroundColor:c, borderColor:penColor===c?'#3b82f6':(c==='#ffffff'?'#cbd5e1':c), boxShadow:penColor===c?'0 0 0 2px #3b82f6':undefined}}/>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-200 shrink-0"/>
          <div className="flex gap-1 shrink-0">
            {PEN_WIDTHS.map(w=>(
              <button key={w} onClick={()=>setPenWidth(w)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg border shrink-0 transition-colors ${penWidth===w?'bg-slate-700 border-slate-700':'bg-white border-slate-200'}`}>
                <div className="rounded-full" style={{width:Math.min(w*1.2,14),height:Math.min(w*1.2,14),backgroundColor:penWidth===w?'#fff':'#475569'}}/>
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-slate-200 shrink-0"/>
          <button onClick={()=>{pathsRef.current.pop();redrawAll()}} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 shrink-0"><RotateCcw size={13}/></button>
          <button onClick={()=>{pathsRef.current=[];const d=drawCanvasRef.current;d&&d.getContext('2d').clearRect(0,0,d.width,d.height)}} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-rose-400 shrink-0"><Trash2 size={13}/></button>
        </div>

        {/* テキスト選択 + 件数 */}
        <div className="ml-auto shrink-0 flex items-center gap-1.5">
          {penMode==='text' && textItemCount !== null && (
            <span className={`text-[10px] font-bold ${
              textItemCount >= 0 ? 'text-blue-500'
              : textItemCount === -2 ? 'text-amber-500'
              : 'text-rose-500'}`}>
              {textItemCount >= 0  ? `▣ ${textItemCount}文字`
               : textItemCount === -2 ? `⚠ フォント不明(${textDiag})`
               : `✕ なし(${textDiag})`}
            </span>
          )}
          <div className="w-px h-5 bg-slate-200"/>
          <button onClick={()=>setPenMode(m=>m==='text'?'pen':'text')}
            className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${penMode==='text'?'bg-blue-100 border-blue-400 text-blue-600':'bg-white border-slate-200 text-slate-500 active:bg-slate-100'}`}
            title="ドラッグで文字選択">
            <MousePointer2 size={13}/>
          </button>
          <div className="w-px h-5 bg-slate-200"/>
          <button onClick={()=>setShowSearchBar(v=>!v)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg border transition-colors ${showSearchBar?'bg-green-100 border-green-400 text-green-600':'bg-white border-slate-200 text-slate-500 active:bg-slate-100'}`}
            title="PDF内検索">
            <Search size={13}/>
          </button>
        </div>
      </div>

      {/* 検索バー（showSearchBar 時のみ表示） */}
      {showSearchBar && (() => {
        const otherPdfs = openNotes.filter(n => n.type === 'pdf' && n.id !== noteId)
        return (
          <>
            {/* 検索バー（外部検索ボタン同行） */}
            <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
              <input
                type="text" value={searchText} placeholder="PDF内を検索..."
                onChange={e => runSearch(e.target.value)}
                className="flex-1 min-w-0 text-sm bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400 text-slate-800 placeholder-slate-400"
                autoFocus
              />
              {/* ── 右端ボタン群（shrink-0 で固定） ── */}
              <div className="shrink-0 flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {searchMatches.length > 0 && (
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">
                    {searchMatchIdx + 1}/{searchMatches.length}
                  </span>
                )}
                <button onClick={goPrev} disabled={!searchMatches.length}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 active:bg-slate-100 shrink-0">
                  <ChevronLeft size={12}/>
                </button>
                <button onClick={goNext} disabled={!searchMatches.length}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-500 disabled:opacity-30 active:bg-slate-100 shrink-0">
                  <ChevronRight size={12}/>
                </button>
                <div className="flex shrink-0 rounded border border-slate-200 overflow-hidden" style={{fontSize:10}}>
                  <button onClick={() => setSearchMode('partial')}
                    className={`px-1 py-0.5 transition-colors ${searchMode==='partial'?'bg-blue-500 text-white':'bg-white text-slate-500 active:bg-slate-50'}`}>
                    部分
                  </button>
                  <button onClick={() => setSearchMode('exact')}
                    className={`px-1 py-0.5 border-l border-slate-200 transition-colors ${searchMode==='exact'?'bg-blue-500 text-white':'bg-white text-slate-500 active:bg-slate-50'}`}>
                    完全
                  </button>
                </div>
                <div className="w-px h-4 bg-slate-200 shrink-0"/>
                <button onClick={() => openInChrome(`https://www.google.com/search?q=${encodeURIComponent(searchText)}`)}
                  disabled={!searchText.trim()} title="Google検索"
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-blue-500 disabled:opacity-30 active:bg-blue-50 shrink-0">
                  <Search size={11}/>
                </button>
                <button onClick={() => { window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchText)}` }}
                  disabled={!searchText.trim()} title="YouTube検索"
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-rose-500 disabled:opacity-30 active:bg-rose-50 shrink-0">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
                  </svg>
                </button>
                <button onClick={() => {
                    const { pdfPrompt } = loadGeminiSettings()
                    const template = pdfPrompt?.trim() || '以下のテキストを日本語で説明してください：'
                    const ta = document.createElement('textarea')
                    ta.value = `${template}\n\n${searchText}`
                    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
                    document.body.appendChild(ta); ta.focus(); ta.select()
                    try { document.execCommand('copy') } catch {}
                    document.body.removeChild(ta)
                    openInChrome('https://gemini.google.com/app')
                  }}
                  disabled={!searchText.trim()} title="Gemini"
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-neo-600 disabled:opacity-30 active:bg-neo-50 shrink-0">
                  <Sparkles size={11}/>
                </button>
                {(() => {
                  const { url } = loadNeo4jApiSettings()
                  if (!url) return null
                  return (
                    <button onClick={async () => {
                        try { await fetch(`${url}?concept=${encodeURIComponent(searchText)}`) }
                        catch (e) { alert('Neo4j API エラー: ' + e.message) }
                      }}
                      disabled={!searchText.trim()} title="Neo4j"
                      className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-[#018BFF] disabled:opacity-30 active:bg-blue-50 shrink-0">
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                        <circle cx="5.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                        <circle cx="10.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                        <line x1="7.5" y1="6.5" x2="8.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        <circle cx="5.5" cy="4.5" r="1.2" fill="currentColor"/>
                        <circle cx="10.5" cy="11.5" r="1.2" fill="currentColor"/>
                      </svg>
                    </button>
                  )
                })()}
                <div className="w-px h-4 bg-slate-200 shrink-0"/>
                {otherPdfs.length > 0 && (
                  <button onClick={() => setShowCrossTabPicker(v => !v)} title="他タブのPDFで検索"
                    className={`w-6 h-6 flex items-center justify-center rounded border shrink-0 transition-colors ${
                      showCrossTabPicker || crossSearchNoteId
                        ? 'bg-teal-100 border-teal-400 text-teal-600'
                        : 'bg-white border-slate-200 text-slate-400 active:bg-slate-100'
                    }`}>
                    <Layers size={11}/>
                  </button>
                )}
                <button onClick={closeSearchBar}
                  className="w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-200 text-slate-400 active:bg-slate-100 shrink-0">
                  <X size={11}/>
                </button>
              </div>
            </div>

            {/* クロスタブ検索：対象PDFピッカー */}
            {showCrossTabPicker && otherPdfs.length > 0 && (
              <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 bg-teal-50 border-b border-teal-200 overflow-x-auto scrollbar-hide">
                <span className="text-[10px] text-teal-600 font-semibold shrink-0 whitespace-nowrap">検索先:</span>
                {otherPdfs.map(n => (
                  <button key={n.id}
                    onClick={() => onSetCrossSearchTarget?.(n.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 border transition-colors ${
                      n.id === crossSearchNoteId
                        ? 'bg-teal-500 border-teal-500 text-white'
                        : 'bg-white border-slate-300 text-slate-600 active:bg-slate-50'
                    }`}>
                    <FileText size={9} className="shrink-0"/>
                    <span className="max-w-[5rem] truncate">{n.name}</span>
                  </button>
                ))}
                {crossSearchNoteId && searchText.trim() && (
                  <button
                    onClick={() => { onCrossSearch?.(searchText); setShowCrossTabPicker(false) }}
                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-500 text-white text-[10px] font-bold shrink-0 active:bg-teal-600 whitespace-nowrap">
                    <ChevronRight size={10}/>
                    ジャンプして検索
                  </button>
                )}
              </div>
            )}
          </>
        )
      })()}

      {/* ページ横スクロールバー（PDF・複数ページ） */}
      {noteMeta.type === 'pdf' && totalPages > 1 && (() => {
        const ratio = (pageNum - 1) / Math.max(totalPages - 1, 1)
        const pageFromClientX = (clientX) => {
          const el = scrollbarTrackRef.current
          if (!el) return pageNum
          const r = el.getBoundingClientRect()
          const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
          return Math.max(1, Math.min(totalPages, Math.floor(p * totalPages) + 1))
        }
        return (
          <div className="shrink-0 bg-white border-b border-slate-200"
            style={{ height: 24, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>1</span>
            <div
              ref={scrollbarTrackRef}
              style={{ flex: 1, height: 4, background: '#e2e8f0', borderRadius: 2, position: 'relative', cursor: 'pointer' }}
              onClick={e => setPageNum(pageFromClientX(e.clientX))}
              onTouchStart={e => setPageNum(pageFromClientX(e.touches[0].clientX))}
              onTouchMove={e => { e.stopPropagation(); setPageNum(pageFromClientX(e.touches[0].clientX)) }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${ratio * 100}%`, background: '#0d9488', borderRadius: 2 }} />
              <div style={{ position: 'absolute', top: '50%', left: `${ratio * 100}%`, transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: '#0d9488', boxShadow: '0 1px 4px rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
            </div>
            <span style={{ fontSize: 9, color: '#94a3b8', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{totalPages}</span>
          </div>
        )
      })()}

      {/* キャンバスエリア */}
      <div style={{flex:1,minHeight:0,position:'relative',overflow:'hidden'}}>
        <div ref={containerRef} style={{position:'absolute',inset:0,overflow:'hidden',background:'white'}}>
          {/* wrapper: translate + scale で pan/zoom を GPU 完結 */}
          <div ref={wrapperRef} style={{
            position:'absolute', top:0, left:0,
            transformOrigin:'0 0',
            willChange:'transform',
          }}>
            <canvas ref={pdfCanvasRef} style={{display:'block'}}/>
            <canvas ref={searchHlCanvasRef} style={{position:'absolute',inset:0,pointerEvents:'none'}}/>
            <canvas ref={drawCanvasRef}
              style={{position:'absolute',inset:0,touchAction:'none',
                cursor:penMode==='text'?'crosshair':penMode==='eraser'?'cell':'crosshair'}}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerLeave={onPointerUp}/>
          </div>
        </div>

        {/* タブ切替: 下端・大型・親指で届く位置 */}
        {(canPrevNote||canNextNote) && (
          <>
            <button onClick={onPrevNote} disabled={!canPrevNote}
              style={{position:'absolute',left:0,bottom:16,zIndex:20}}
              className="w-14 h-16 flex items-center justify-center bg-white/85 border-t border-r border-slate-200 rounded-tr-2xl text-slate-500 disabled:opacity-0 active:bg-slate-100 transition-opacity shadow-sm">
              <ChevronsLeft size={22}/>
            </button>
            <button onClick={onNextNote} disabled={!canNextNote}
              style={{position:'absolute',right:0,bottom:16,zIndex:20}}
              className="w-14 h-16 flex items-center justify-center bg-white/85 border-t border-l border-slate-200 rounded-tl-2xl text-slate-500 disabled:opacity-0 active:bg-slate-100 transition-opacity shadow-sm">
              <ChevronsRight size={22}/>
            </button>
          </>
        )}
        {noteMeta.type==='pdf' && (
          <>
            {/* 1画面時のみ上ペア（18%）を追加 */}
            {!splitMode && (
              <>
                <button onClick={()=>{if(pageNum>1)setPageNum(p=>p-1)}} disabled={pageNum<=1}
                  style={{position:'absolute',left:0,top:'18%',transform:'translateY(-50%)',zIndex:10}}
                  className="w-10 h-16 flex items-center justify-center bg-black/20 rounded-r-2xl text-white disabled:opacity-0 active:bg-black/40 transition-opacity">
                  <ChevronLeft size={22}/>
                </button>
                <button onClick={()=>{if(pageNum<totalPages)setPageNum(p=>p+1)}} disabled={pageNum>=totalPages}
                  style={{position:'absolute',right:0,top:'18%',transform:'translateY(-50%)',zIndex:10}}
                  className="w-10 h-16 flex items-center justify-center bg-black/20 rounded-l-2xl text-white disabled:opacity-0 active:bg-black/40 transition-opacity">
                  <ChevronRight size={22}/>
                </button>
              </>
            )}
            {/* 下ペア: 1画面=65% / 2画面=中央50% */}
            <button onClick={()=>{if(pageNum>1)setPageNum(p=>p-1)}} disabled={pageNum<=1}
              style={{position:'absolute',left:0,top:splitMode?'50%':'65%',transform:'translateY(-50%)',zIndex:10}}
              className="w-10 h-16 flex items-center justify-center bg-black/20 rounded-r-2xl text-white disabled:opacity-0 active:bg-black/40 transition-opacity">
              <ChevronLeft size={22}/>
            </button>
            <button onClick={()=>{if(pageNum<totalPages)setPageNum(p=>p+1)}} disabled={pageNum>=totalPages}
              style={{position:'absolute',right:0,top:splitMode?'50%':'65%',transform:'translateY(-50%)',zIndex:10}}
              className="w-10 h-16 flex items-center justify-center bg-black/20 rounded-l-2xl text-white disabled:opacity-0 active:bg-black/40 transition-opacity">
              <ChevronRight size={22}/>
            </button>
          </>
        )}

        {/* 全ページ検索結果フロート（左側） */}
        {showSearchBar && searchText.trim() && (searchAllLoading || allPageResults !== null) && (
          <div style={{position:'absolute',left:48,top:6,zIndex:25,width:72,maxHeight:'60vh',
                       overflowY:'auto',borderRadius:12,border:'1px solid #e2e8f0',
                       background:'rgba(255,255,255,0.93)',boxShadow:'0 4px 16px rgba(0,0,0,0.12)'}}
               className="scrollbar-hide">
            {searchAllLoading ? (
              <div className="flex flex-col items-center gap-1 py-3">
                <Loader size={13} className="animate-spin text-slate-400"/>
                <span className="text-[9px] text-slate-400">検索中</span>
              </div>
            ) : allPageResults && allPageResults.length === 0 ? (
              <p className="text-[9px] text-slate-400 text-center py-3 px-1">なし</p>
            ) : (
              <div className="py-1">
                {(allPageResults || []).map(r => (
                  <button key={r.page} onClick={() => setPageNum(r.page)}
                    className="w-full flex flex-col items-center py-1.5 active:bg-green-50"
                    style={{background: pageNum === r.page ? '#f0fdf4' : undefined}}>
                    <span className="text-xs font-bold tabular-nums leading-none"
                          style={{color: pageNum === r.page ? '#16a34a' : '#475569'}}>
                      P{r.page}
                    </span>
                    <span className="text-[9px] tabular-nums leading-none mt-0.5"
                          style={{color: pageNum === r.page ? '#16a34a' : '#94a3b8'}}>
                      {r.count}件
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 検索履歴フロート（右側・検索バーが開いている間は常時表示） */}
        {showSearchBar && searchHistory.length > 0 && (
          <div style={{position:'absolute',right:48,top:6,zIndex:25,width:140,maxHeight:'60vh',
                       overflowY:'auto',borderRadius:12,border:'1px solid #e2e8f0',
                       background:'rgba(255,255,255,0.95)',boxShadow:'0 4px 16px rgba(0,0,0,0.12)'}}
               className="scrollbar-hide">
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-slate-100 sticky top-0 bg-white/95">
              <span className="text-[9px] text-slate-400 font-semibold">履歴</span>
              <button onClick={() => {
                  setSearchHistory([])
                  try { localStorage.removeItem('pdf_search_history') } catch {}
                }}
                className="text-[9px] text-slate-300 active:text-rose-400">全削除</button>
            </div>
            {/* 履歴一覧 */}
            {searchHistory.map((item, idx) => (
              <div key={idx} className="flex items-center border-b border-slate-50 last:border-0">
                <button onClick={() => runSearch(item)}
                  className={`flex-1 flex items-center gap-1 px-2 py-1.5 text-left active:bg-slate-50 min-w-0
                    ${item === searchText ? 'bg-blue-50' : ''}`}>
                  <Clock size={9} className="shrink-0 text-slate-300"/>
                  <span className="text-[9px] text-slate-600 truncate">{item}</span>
                </button>
                <button onClick={() => removeFromHistory(item)}
                  className="shrink-0 px-1.5 py-1 text-slate-200 active:text-slate-400">
                  <X size={9}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 選択ボックス */}
      <div ref={selBoxDivRef} style={{position:'fixed',display:'none',border:'2px solid #3b82f6',background:'rgba(59,130,246,0.1)',borderRadius:'3px',pointerEvents:'none',zIndex:150}}/>


      {/* ポップアップ */}
      {neo4jJob && (
        <div style={{position:'fixed',bottom:80,left:'50%',transform:'translateX(-50%)',zIndex:300,maxWidth:320,width:'calc(100% - 32px)'}}>
          <div className={`rounded-2xl shadow-2xl border overflow-hidden ${neo4jJob.status==='done'?'bg-teal-50 border-teal-200':neo4jJob.status==='error'?'bg-rose-50 border-rose-200':'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3 px-4 py-3">
              {neo4jJob.status === 'running' && <Loader size={16} className="animate-spin text-blue-500 shrink-0"/>}
              {neo4jJob.status === 'done'    && <span className="text-teal-600 font-bold shrink-0">✓</span>}
              {neo4jJob.status === 'error'   && <span className="text-rose-500 font-bold shrink-0">✕</span>}
              <div className="flex-1 min-w-0">
                {neo4jJob.status === 'running' && <p className="text-sm font-medium text-slate-700">グラフ生成中…</p>}
                {neo4jJob.status === 'done'    && <p className="text-sm font-medium text-teal-700">グラフ生成完了</p>}
                {neo4jJob.status === 'error'   && <p className="text-sm font-medium text-rose-600 truncate">{neo4jJob.error || 'エラーが発生しました'}</p>}
                {neo4jJob.jobId && <p className="text-[10px] text-slate-400 font-mono truncate">{neo4jJob.jobId}</p>}
              </div>
              <button onClick={() => { if(neo4jPollRef.current) clearInterval(neo4jPollRef.current); setNeo4jJob(null) }}
                className="shrink-0 text-slate-400 active:text-slate-600"><X size={14}/></button>
            </div>
            {neo4jJob.status === 'done' && neo4jJob.graphUrl && (
              <div className="px-4 pb-3">
                <button onClick={() => openInChrome(neo4jJob.graphUrl)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-teal-500 text-white text-sm font-semibold active:bg-teal-600">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="5.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.4"/><circle cx="10.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.4"/><line x1="7.5" y1="6.5" x2="8.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><circle cx="5.5" cy="4.5" r="1.2" fill="currentColor"/><circle cx="10.5" cy="11.5" r="1.2" fill="currentColor"/></svg>
                  Graphistry で開く
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {popup && selWord && (
        <div style={{position:'fixed',left:popup.screenX,top:popup.screenY,transform:'translateX(-50%)',zIndex:200}}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" style={{minWidth:240,maxWidth:340}}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <p className="text-sm font-bold text-slate-800 flex-1" style={{wordBreak:'break-all'}}>{selWord.str}</p>
              <button onClick={closePopup} className="ml-2 text-slate-400 active:text-slate-600 shrink-0"><X size={14}/></button>
            </div>
            <div className="flex border-b border-slate-100">
              <button onClick={handleCopy} className="flex-1 flex flex-col items-center gap-1 py-3 text-slate-600 active:bg-slate-50">
                <Copy size={16}/><span className="text-[10px] font-medium">コピー</span>
              </button>
              <button onClick={handleGoogle} className="flex-1 flex flex-col items-center gap-1 py-3 text-blue-600 active:bg-blue-50 border-x border-slate-100">
                <Search size={16}/><span className="text-[10px] font-medium">Google</span>
              </button>
              <button
                onClick={handleYouTube}
                className="flex-1 flex flex-col items-center gap-1 py-3 text-rose-500 active:bg-rose-50 border-x border-slate-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>
                </svg>
                <span className="text-[10px] font-medium">YouTube</span>
              </button>
              <button onClick={handleGemini} className="flex-1 flex flex-col items-center gap-1 py-3 text-neo-600 active:bg-neo-50 border-x border-slate-100">
                <Sparkles size={16}/>
                <span className="text-[10px] font-medium">Gemini</span>
              </button>
              <button onClick={handleNeo4j} className="flex-1 flex flex-col items-center gap-1 py-3 text-[#018BFF] active:bg-blue-50">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="5.5" cy="4.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="10.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                  <line x1="7.5" y1="6.5" x2="8.5" y2="9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  <circle cx="5.5" cy="4.5" r="1.2" fill="currentColor"/>
                  <circle cx="10.5" cy="11.5" r="1.2" fill="currentColor"/>
                </svg>
                <span className="text-[10px] font-medium">Neo4j</span>
              </button>
            </div>
            {crossSearchNoteId && (
              <div className="px-3 py-2 border-t border-slate-100">
                <button
                  onClick={() => { onCrossSearch?.(toHankaku(selWord.str)); closePopup() }}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-teal-500 text-white text-xs font-semibold active:bg-teal-600">
                  <Layers size={12}/>
                  <span className="truncate">
                    {openNotes.find(n => n.id === crossSearchNoteId)?.name ?? '他のPDF'} でジャンプ検索
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}


    </div>
  )
}
