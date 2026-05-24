import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FileText, PenLine, Trash2, Upload, Plus, Loader, Pencil, Check, X,
  Folder, FolderPlus, ChevronRight, MoveRight, Search,
} from 'lucide-react'
import {
  getAllNotes, getAllFolders, saveNote, saveFolder, deleteNote, deleteFolder,
  getNote, genNoteId, genFolderId, fmtDate,
} from './useNotesDB'

export default function NotesTab({ onOpenNote, refreshKey }) {
  const [notes,           setNotes]           = useState([])
  const [folders,         setFolders]         = useState([])
  const [loading,         setLoading]         = useState(true)
  const [currentFolderId, setCurrentFolderId] = useState(null)
  const [renamingId,      setRenamingId]      = useState(null)
  const [renamingType,    setRenamingType]    = useState(null)
  const [renameVal,       setRenameVal]       = useState('')
  const [movingNoteId,    setMovingNoteId]    = useState(null)
  const [showSearch,      setShowSearch]      = useState(false)
  const [searchQuery,     setSearchQuery]     = useState('')
  const searchInputRef = useRef(null)

  // ---- ドラッグ状態 ---------------------------------------------------------
  const [dragNote,        setDragNote]        = useState(null)   // dragging note object
  const [dragPos,         setDragPos]         = useState(null)   // {x,y} client
  const [dragOffset,      setDragOffset]      = useState({x:0,y:0}) // pointer offset in card
  const [dragGhostW,      setDragGhostW]      = useState(0)
  const [hoverFolderId,   setHoverFolderId]   = useState(undefined)
  // undefined=なし, null=ルート, string=フォルダID

  const longPressTimer  = useRef(null)
  const folderElsRef    = useRef({})   // folderId → DOM element
  const rootDropElRef   = useRef(null) // ルートドロップゾーン element
  const isDragging      = !!(dragNote && dragPos)

  const fileInputRef = useRef(null)

  // ---- データ読み込み -------------------------------------------------------
  const loadAll = async () => {
    setLoading(true)
    try {
      const [n, f] = await Promise.all([getAllNotes(), getAllFolders()])
      setNotes(n); setFolders(f)
    } finally { setLoading(false) }
  }
  useEffect(() => { loadAll() }, [refreshKey])

  const currentFolder = folders.find(f => f.id === currentFolderId) ?? null
  const viewNotes     = notes.filter(n => (n.folderId ?? null) === currentFolderId)
  const movingNote    = notes.find(n => n.id === movingNoteId)

  // 検索: ノート名 + OCR キャッシュテキスト
  const searchMatches = showSearch && searchQuery.trim()
    ? notes.filter(n => {
        const q = searchQuery.toLowerCase()
        return n.name.toLowerCase().includes(q) ||
               (n.ocrText && n.ocrText.toLowerCase().includes(q))
      })
    : null

  const closeSearch = () => { setShowSearch(false); setSearchQuery('') }

  // ---- ドラッグ中: document level ポインタイベント --------------------------
  const findHoverTarget = useCallback((x, y) => {
    // フォルダ要素を走査
    for (const [fid, el] of Object.entries(folderElsRef.current)) {
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return fid
    }
    // ルートドロップゾーン
    if (rootDropElRef.current) {
      const r = rootDropElRef.current.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return null
    }
    return undefined
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e) => {
      const x = e.clientX, y = e.clientY
      setDragPos({ x, y })
      setHoverFolderId(findHoverTarget(x, y))
    }
    const onUp = async (e) => {
      const target = findHoverTarget(e.clientX, e.clientY)
      // 自分と同じフォルダ / undefined ならドロップ無効
      if (target !== undefined && target !== (dragNote.folderId ?? null)) {
        const full = await getNote(dragNote.id)
        if (full) await saveNote({ ...full, folderId: target })
        loadAll()
      }
      setDragNote(null); setDragPos(null); setHoverFolderId(undefined)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup',   onUp)
    document.addEventListener('pointercancel', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup',   onUp)
      document.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, dragNote, findHoverTarget])

  // ---- ノートの長押しドラッグ開始 ------------------------------------------
  const onNotePointerDown = (e, note) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el   = e.currentTarget
    const rect = el.getBoundingClientRect()
    const ox   = e.clientX - rect.left
    const oy   = e.clientY - rect.top
    const w    = rect.width

    longPressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(40)
      setDragNote(note)
      setDragOffset({ x: ox, y: oy })
      setDragPos({ x: e.clientX, y: e.clientY })
      setDragGhostW(w)
    }, 400)
  }
  const onNotePointerUp    = () => clearTimeout(longPressTimer.current)
  const onNotePointerMove  = (e) => {
    // 指が 8px 以上動いたら長押しキャンセル
    if (!isDragging) clearTimeout(longPressTimer.current)
  }

  // ---- PDF アップロード / 白紙ノート作成 -----------------------------------
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue
      await saveNote({
        id: genNoteId(), type: 'pdf',
        name: file.name.replace(/\.pdf$/i, ''),
        pdfData: await file.arrayBuffer(), pageCount: 0, drawings: {},
        folderId: currentFolderId,
        createdAt: Date.now(), updatedAt: Date.now(),
      })
    }
    loadAll()
  }
  const createBlank = async () => {
    await saveNote({
      id: genNoteId(), type: 'blank',
      name: `ノート ${fmtDate(Date.now())}`,
      drawings: { 1: '' }, pageCount: 1,
      folderId: currentFolderId,
      createdAt: Date.now(), updatedAt: Date.now(),
    })
    loadAll()
  }

  // ---- フォルダ作成 ---------------------------------------------------------
  const createFolderAction = async () => {
    const name = window.prompt('フォルダ名を入力してください')
    if (!name?.trim()) return
    await saveFolder({ id: genFolderId(), name: name.trim(), createdAt: Date.now() })
    loadAll()
  }

  // ---- 削除 ----------------------------------------------------------------
  const handleDeleteNote = async (id) => {
    if (!window.confirm('このノートを削除しますか？')) return
    await deleteNote(id); loadAll()
  }
  const handleDeleteFolder = async (folder) => {
    const count = notes.filter(n => n.folderId === folder.id).length
    const msg   = count > 0
      ? `「${folder.name}」を削除しますか？\n中の ${count} 件はルートに移動します。`
      : `「${folder.name}」を削除しますか？`
    if (!window.confirm(msg)) return
    await deleteFolder(folder.id); loadAll()
  }

  // ---- リネーム ------------------------------------------------------------
  const startRename = (id, name, type) => {
    setRenamingId(id); setRenameVal(name); setRenamingType(type)
  }
  const commitRename = async () => {
    if (!renameVal.trim()) { cancelRename(); return }
    if (renamingType === 'folder') {
      const f = folders.find(f => f.id === renamingId)
      if (f) await saveFolder({ ...f, name: renameVal.trim() })
    } else {
      const full = await getNote(renamingId)
      if (full) await saveNote({ ...full, name: renameVal.trim() })
    }
    loadAll(); cancelRename()
  }
  const cancelRename = () => { setRenamingId(null); setRenameVal(''); setRenamingType(null) }

  // ---- ノートをフォルダへ移動（picker） ------------------------------------
  const moveNoteToFolder = async (noteId, folderId) => {
    const full = await getNote(noteId)
    if (full) await saveNote({ ...full, folderId })
    setMovingNoteId(null); loadAll()
  }

  // ==========================================================================
  return (
    <div className="h-full flex flex-col">

      {/* ヘッダー */}
      {showSearch ? (
        /* 検索モード */
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-slate-800">
          <button onClick={closeSearch}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 active:text-slate-200 shrink-0">
            <X size={16} />
          </button>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="ノート名・PDF内テキストを検索…"
            autoFocus
            className="flex-1 bg-slate-800 text-slate-100 text-sm rounded-xl px-3 py-2 focus:outline-none placeholder-slate-500 border border-slate-700 focus:border-neo-500"
          />
        </div>
      ) : (
        /* 通常モード */
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-slate-800">
          {currentFolderId ? (
            <>
              <button onClick={() => setCurrentFolderId(null)}
                className="flex items-center gap-1 text-sm text-slate-400 active:text-slate-200">
                <ChevronRight size={14} className="rotate-180" />ノート
              </button>
              <ChevronRight size={12} className="text-slate-600 shrink-0" />
              <p className="flex-1 text-sm font-semibold text-slate-200 truncate">{currentFolder?.name}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-200 flex-1">ノート</p>
              <button onClick={createFolderAction}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs active:bg-slate-700 border border-slate-700">
                <FolderPlus size={13} /> フォルダ
              </button>
            </>
          )}
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs active:bg-slate-700 border border-slate-700">
            <Upload size={13} /> PDF
          </button>
          <button onClick={createBlank}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neo-600 text-white text-xs active:bg-neo-700">
            <Plus size={13} /> 白紙
          </button>
          {/* OCR 検索トグル */}
          <button onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700 border border-slate-700 shrink-0">
            <Search size={14} />
          </button>
          <input ref={fileInputRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={handleFileChange} />
        </div>
      )}

      {/* 検索結果リスト */}
      {showSearch && (
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-2">
          {!searchQuery.trim() ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search size={32} className="text-slate-700 mb-3" />
              <p className="text-slate-400 text-sm">ノート名または PDF 内のテキストで検索</p>
              <p className="text-slate-600 text-xs mt-1">PDF を一度開くと内容が検索対象になります</p>
            </div>
          ) : searchMatches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-slate-400 text-sm">「{searchQuery}」に一致するノートがありません</p>
            </div>
          ) : (
            searchMatches.map(note => {
              const folder = folders.find(f => f.id === note.folderId)
              return (
                <div key={note.id} className="card p-3 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                    ${note.type === 'pdf' ? 'bg-rose-900/40 text-rose-400' : 'bg-neo-900/40 text-neo-400'}`}>
                    {note.type === 'pdf' ? <FileText size={18}/> : <PenLine size={18}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{note.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      {folder && <><Folder size={10} className="text-amber-400" />{folder.name} · </>}
                      {note.type === 'pdf' ? 'PDF' : '白紙ノート'} · {fmtDate(note.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => { onOpenNote({ id: note.id, name: note.name, type: note.type }); closeSearch() }}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700 text-slate-300 active:bg-slate-600 text-xs font-medium shrink-0">
                    開く
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* 通常リスト */}
      {!showSearch && <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-2">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader size={24} className="text-neo-400 animate-spin" />
          </div>
        )}

        {!loading && folders.length === 0 && viewNotes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <PenLine size={40} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-medium">ノートがありません</p>
            <p className="text-slate-600 text-sm mt-1">PDF をアップロードするか白紙ノートを作成してください</p>
          </div>
        )}

        {/* フォルダ内: ルートへのドロップゾーン */}
        {isDragging && currentFolderId && (
          <div ref={rootDropElRef}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 border-dashed text-sm transition-colors
              ${hoverFolderId === null
                ? 'border-neo-400 bg-neo-900/30 text-neo-400'
                : 'border-slate-700 text-slate-500'}`}>
            <ChevronRight size={14} className="rotate-180 shrink-0" />
            ここにドロップ → ルートへ移動
          </div>
        )}

        {/* フォルダ一覧（ルートのみ） */}
        {!currentFolderId && folders.map(folder => {
          const isHovered  = isDragging && hoverFolderId === folder.id
          const isRenaming = renamingId === folder.id && renamingType === 'folder'
          const noteCount  = notes.filter(n => n.folderId === folder.id).length
          return (
            <div key={folder.id}
              ref={el => { folderElsRef.current[folder.id] = el }}
              className={`card p-3 flex items-center gap-3 transition-all
                ${isHovered ? 'ring-2 ring-neo-400 bg-neo-900/30 scale-[1.02]' : ''}`}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-900/40 text-amber-400">
                <Folder size={18} />
              </div>
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter') commitRename(); if(e.key==='Escape') cancelRename() }}
                      autoFocus
                      className="flex-1 bg-slate-800 text-slate-100 text-sm rounded-lg px-2 py-1 focus:outline-none border border-neo-500" />
                    <button onClick={commitRename} className="text-neo-400"><Check size={14}/></button>
                    <button onClick={cancelRename} className="text-slate-500"><X size={14}/></button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-100 truncate">{folder.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{noteCount} 件</p>
                  </>
                )}
              </div>
              {!isRenaming && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => setCurrentFolderId(folder.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700 text-slate-300 active:bg-slate-600">
                    <ChevronRight size={16}/>
                  </button>
                  <button onClick={() => startRename(folder.id, folder.name, 'folder')}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
                    <Pencil size={13}/>
                  </button>
                  <button onClick={() => handleDeleteFolder(folder)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-rose-500 active:bg-rose-900/40">
                    <Trash2 size={13}/>
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {/* ノート一覧 */}
        {viewNotes.map(note => {
          const isRenaming = renamingId === note.id && renamingType === 'note'
          const isBeingDragged = isDragging && dragNote?.id === note.id
          return (
            <div key={note.id}
              className={`card p-3 flex items-center gap-3 transition-all select-none
                ${isBeingDragged ? 'opacity-40 scale-95' : ''}`}
              onPointerDown={e => onNotePointerDown(e, note)}
              onPointerUp={onNotePointerUp}
              onPointerMove={onNotePointerMove}
              style={{ touchAction: 'pan-y' }}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
                ${note.type === 'pdf' ? 'bg-rose-900/40 text-rose-400' : 'bg-neo-900/40 text-neo-400'}`}>
                {note.type === 'pdf' ? <FileText size={18}/> : <PenLine size={18}/>}
              </div>
              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1.5">
                    <input value={renameVal} onChange={e => setRenameVal(e.target.value)}
                      onKeyDown={e => { if(e.key==='Enter') commitRename(); if(e.key==='Escape') cancelRename() }}
                      autoFocus
                      className="flex-1 bg-slate-800 text-slate-100 text-sm rounded-lg px-2 py-1 focus:outline-none border border-neo-500" />
                    <button onClick={commitRename} className="text-neo-400"><Check size={14}/></button>
                    <button onClick={cancelRename} className="text-slate-500"><X size={14}/></button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-slate-100 truncate">{note.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {note.type === 'pdf' ? 'PDF' : '白紙ノート'} · {fmtDate(note.updatedAt)}
                    </p>
                  </>
                )}
              </div>
              {!isRenaming && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => onOpenNote({ id: note.id, name: note.name, type: note.type })}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-700 text-slate-300 active:bg-slate-600 text-xs font-medium">
                    開く
                  </button>
                  <button onClick={() => startRename(note.id, note.name, 'note')}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
                    <Pencil size={13}/>
                  </button>
                  <button onClick={() => setMovingNoteId(note.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
                    <MoveRight size={13}/>
                  </button>
                  <button onClick={() => handleDeleteNote(note.id)}
                    className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 text-rose-500 active:bg-rose-900/40">
                    <Trash2 size={13}/>
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>}

      {/* ドラッグゴースト */}
      {isDragging && dragNote && (
        <div style={{
          position:      'fixed',
          left:          dragPos.x - dragOffset.x,
          top:           dragPos.y - dragOffset.y,
          width:         dragGhostW,
          zIndex:        500,
          pointerEvents: 'none',
          transform:     'scale(1.04)',
          opacity:       0.92,
          boxShadow:     '0 12px 32px rgba(0,0,0,0.5)',
          borderRadius:  '16px',
        }}
          className="card p-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0
            ${dragNote.type === 'pdf' ? 'bg-rose-900/40 text-rose-400' : 'bg-neo-900/40 text-neo-400'}`}>
            {dragNote.type === 'pdf' ? <FileText size={18}/> : <PenLine size={18}/>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 truncate">{dragNote.name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {dragNote.type === 'pdf' ? 'PDF' : '白紙ノート'}
            </p>
          </div>
        </div>
      )}

      {/* フォルダ移動 picker */}
      {movingNoteId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70" onClick={() => setMovingNoteId(null)}>
          <div className="absolute inset-x-0 bottom-0 bg-slate-900 rounded-t-2xl border-t border-slate-700 pb-8"
               onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-700"/>
            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <p className="text-sm font-semibold text-slate-100">「{movingNote?.name}」を移動</p>
              <button onClick={() => setMovingNoteId(null)} className="text-slate-500"><X size={16}/></button>
            </div>
            <div className="overflow-y-auto max-h-64 px-3 space-y-0.5">
              <button onClick={() => moveNoteToFolder(movingNoteId, null)}
                disabled={(movingNote?.folderId ?? null) === null}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm
                  ${(movingNote?.folderId ?? null) === null ? 'bg-neo-600/20 text-neo-400 font-semibold' : 'text-slate-300 active:bg-slate-800'}`}>
                <PenLine size={14} className="text-slate-500 shrink-0"/> ルート（フォルダなし）
              </button>
              {folders.map(folder => (
                <button key={folder.id} onClick={() => moveNoteToFolder(movingNoteId, folder.id)}
                  disabled={movingNote?.folderId === folder.id}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm
                    ${movingNote?.folderId === folder.id ? 'bg-neo-600/20 text-neo-400 font-semibold' : 'text-slate-300 active:bg-slate-800'}`}>
                  <Folder size={14} className="text-amber-400 shrink-0"/> {folder.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
