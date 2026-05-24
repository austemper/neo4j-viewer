// IndexedDB wrapper for Notes + Folders
const DB_NAME      = 'neo4j_viewer_notes'
const DB_VER       = 2
const NOTES_STORE  = 'notes'
const FOLDER_STORE = 'folders'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = (e) => {
      const db  = e.target.result
      const old = e.oldVersion

      // ---- Notes store ----
      if (old < 1) {
        const s = db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
        s.createIndex('updatedAt', 'updatedAt', { unique: false })
        s.createIndex('folderId',  'folderId',  { unique: false })
      } else if (old < 2) {
        // v1→v2: folderId インデックスを追加
        const s = e.target.transaction.objectStore(NOTES_STORE)
        if (!s.indexNames.contains('folderId')) {
          s.createIndex('folderId', 'folderId', { unique: false })
        }
      }

      // ---- Folders store（v2 で新規追加）----
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        const fs = db.createObjectStore(FOLDER_STORE, { keyPath: 'id' })
        fs.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror   = () => reject(req.error)
  })
}

// ---- 汎用トランザクションヘルパー ----
function txOp(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const t   = db.transaction(storeName, mode)
    const req = fn(t.objectStore(storeName))
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

// ============================================================
// Notes
// ============================================================

export async function getAllNotes() {
  const db    = await openDB()
  const notes = await txOp(db, NOTES_STORE, 'readonly', s => s.getAll())
  return notes
    .map(n => ({ ...n, pdfData: undefined }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function getNote(id) {
  const db = await openDB()
  return txOp(db, NOTES_STORE, 'readonly', s => s.get(id))
}

export async function saveNote(note) {
  const db = await openDB()
  return txOp(db, NOTES_STORE, 'readwrite', s => s.put({ ...note, updatedAt: Date.now() }))
}

export async function deleteNote(id) {
  const db = await openDB()
  return txOp(db, NOTES_STORE, 'readwrite', s => s.delete(id))
}

export function genNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ============================================================
// Folders
// ============================================================

export async function getAllFolders() {
  const db      = await openDB()
  const folders = await txOp(db, FOLDER_STORE, 'readonly', s => s.getAll())
  return folders.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ja'))
}

export async function saveFolder(folder) {
  const db = await openDB()
  return txOp(db, FOLDER_STORE, 'readwrite', s => s.put({ ...folder, updatedAt: Date.now() }))
}

export async function deleteFolder(id) {
  // フォルダ削除時: 中のノートをルートへ移動
  const notes = await getAllNotes()
  for (const n of notes.filter(n => n.folderId === id)) {
    const full = await getNote(n.id)
    await saveNote({ ...full, folderId: null })
  }
  const db = await openDB()
  return txOp(db, FOLDER_STORE, 'readwrite', s => s.delete(id))
}

export function genFolderId() {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ============================================================
// Utils
// ============================================================

export function fmtDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`
}
