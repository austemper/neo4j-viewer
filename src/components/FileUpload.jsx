import { useCallback, useRef, useState } from 'react'
import { Upload, FileJson, AlertCircle } from 'lucide-react'

export default function FileUpload({ onFileLoad, error }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!file.name.match(/\.(json|jsonl|ndjson)$/i)) {
      alert('JSON または JSONL ファイルを選択してください')
      return
    }
    onFileLoad(file)
  }, [onFileLoad])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 pb-12">
      {/* ロゴ */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-neo-600/20 border border-neo-500/30 mb-4">
          <span className="text-4xl">🔮</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Neo4j Viewer</h1>
        <p className="text-sm text-slate-400 mt-1">グラフデータをスマホで閲覧</p>
      </div>

      {/* アップロードエリア */}
      <div
        className={`w-full max-w-sm rounded-3xl border-2 border-dashed p-8 text-center transition-all duration-200 cursor-pointer
          ${dragging
            ? 'border-neo-400 bg-neo-900/40 scale-[1.02]'
            : 'border-slate-600 bg-slate-800/50 active:scale-[0.98]'
          }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-700 flex items-center justify-center">
            <FileJson size={32} className="text-neo-400" />
          </div>
          <div>
            <p className="text-slate-200 font-semibold text-lg">JSONファイルを選択</p>
            <p className="text-slate-400 text-sm mt-1">タップしてファイルを開く</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {['.json', '.jsonl', '.ndjson'].map(ext => (
              <span key={ext} className="badge bg-slate-700 text-slate-300 font-mono text-xs">{ext}</span>
            ))}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.jsonl,.ndjson"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mt-4 w-full max-w-sm flex items-start gap-3 p-4 rounded-2xl bg-red-900/30 border border-red-700/50">
          <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-300 font-medium text-sm">読み込みエラー</p>
            <p className="text-red-400 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* 対応形式の説明 */}
      <div className="mt-8 w-full max-w-sm">
        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">対応フォーマット</p>
        <div className="space-y-2">
          {[
            { name: 'APOC Export JSON', desc: '{ "nodes": [...], "relationships": [...] }' },
            { name: 'APOC Export JSONL', desc: '1行1ノード/リレーションシップ形式' },
            { name: 'Neo4j HTTP API', desc: '{ "results": [...] } 形式' },
          ].map(f => (
            <div key={f.name} className="flex items-start gap-2 p-3 rounded-xl bg-slate-800/50">
              <div className="w-1.5 h-1.5 rounded-full bg-neo-500 mt-1.5 shrink-0" />
              <div>
                <p className="text-slate-300 text-sm font-medium">{f.name}</p>
                <p className="text-slate-500 text-xs font-mono mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
