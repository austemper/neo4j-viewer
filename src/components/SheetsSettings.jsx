import { useState, useRef } from 'react'
import { Eye, EyeOff, Plus, Trash2, Check, Pencil, FileSpreadsheet,
         CheckCircle, AlertCircle, Upload, Loader } from 'lucide-react'
import { loadSheetsSettings, saveSheetsSettings, extractSheetId, parseCredentialsJson,
         fetchSpreadsheetMeta } from './useGoogleSheets'

function genId() { return `s${Date.now()}` }

const INTERVAL_OPTIONS = [
  { label: '10秒', value: 10 },
  { label: '30秒', value: 30 },
  { label: '1分', value: 60 },
  { label: '5分', value: 300 },
  { label: '手動', value: 0 },
]

export default function SheetsSettings() {
  const [s, setS] = useState(loadSheetsSettings)
  const [credError, setCredError] = useState(null)
  const [showKey, setShowKey] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', url: '', range: 'Sheet1', interval: 30 })
  const fileRef = useRef(null)

  const save = (updated) => { setS(updated); saveSheetsSettings(updated) }

  // ---- credentials.json の読み込み ----
  const handleCredFile = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseCredentialsJson(e.target.result)
        if (parsed.type !== 'service_account') {
          setCredError('service_account タイプのみ対応しています')
          return
        }
        setCredError(null)
        save({ ...s, credentialsJson: parsed.data, apiKey: '' })
      } catch (err) {
        setCredError(err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleCredPaste = (text) => {
    try {
      const parsed = parseCredentialsJson(text)
      if (parsed.type !== 'service_account') {
        setCredError('service_account タイプのみ対応しています')
        return
      }
      setCredError(null)
      save({ ...s, credentialsJson: parsed.data, apiKey: '' })
    } catch (err) {
      setCredError(err.message)
    }
  }

  const clearCred = () => save({ ...s, credentialsJson: null })

  // ---- シートの CRUD ----
  const startNew = () => { setEditId('new'); setForm({ name: '', url: '', range: 'Sheet1', interval: 30 }) }
  const startEdit = (sh) => { setEditId(sh.id); setForm({ name: sh.name, url: sh.spreadsheetId, range: sh.range, interval: sh.interval }) }

  const commit = () => {
    if (!form.name.trim() || !form.url.trim()) return
    const item = { id: editId === 'new' ? genId() : editId, name: form.name.trim(), spreadsheetId: extractSheetId(form.url), range: form.range || 'Sheet1', interval: form.interval }
    save({ ...s, sheets: editId === 'new' ? [...s.sheets, item] : s.sheets.map(sh => sh.id === editId ? item : sh) })
    setEditId(null)
  }

  const del = (id) => save({ ...s, sheets: s.sheets.filter(sh => sh.id !== id) })

  const hasCred = !!s.credentialsJson
  const credEmail = s.credentialsJson?.client_email

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet size={15} className="text-emerald-400 shrink-0" />
        <h2 className="text-sm font-semibold text-slate-200">Google Sheets 連携</h2>
      </div>

      {/* credentials.json セクション */}
      <div>
        <label className="block text-xs text-slate-500 mb-2 font-medium">
          認証（credentials.json）
        </label>

        {hasCred ? (
          /* 認証済み表示 */
          <div className="flex items-start gap-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl px-3 py-2.5">
            <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-emerald-300 font-medium">サービスアカウント認証済み</p>
              <p className="text-[10px] text-emerald-600 mt-0.5 truncate font-mono">{credEmail}</p>
              <p className="text-[10px] text-slate-600 mt-1">
                スプレッドシートを上記アドレスに「閲覧者」で共有してください
              </p>
            </div>
            <button onClick={clearCred}
              className="text-slate-600 active:text-rose-400 shrink-0 text-xs mt-0.5">
              解除
            </button>
          </div>
        ) : (
          /* credentials.json 読み込み UI */
          <div className="space-y-2">
            {/* ファイル選択 */}
            <input
              type="file"
              accept=".json,application/json"
              ref={fileRef}
              className="hidden"
              onChange={e => e.target.files[0] && handleCredFile(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                border-2 border-dashed border-slate-700 text-slate-400 text-sm
                active:border-emerald-600 active:text-emerald-400 transition-colors"
            >
              <Upload size={16} />
              credentials.json を選択
            </button>

            {/* または貼り付け */}
            <details className="group">
              <summary className="text-[10px] text-slate-600 cursor-pointer select-none">
                または JSON を貼り付け ▸
              </summary>
              <CredPasteArea onPaste={handleCredPaste} />
            </details>

            {credError && (
              <div className="flex items-start gap-1.5 text-rose-400">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <p className="text-[11px]">{credError}</p>
              </div>
            )}

            {/* フォールバック: API キー */}
            <details>
              <summary className="text-[10px] text-slate-600 cursor-pointer select-none">
                代わりに API キー（公開シートのみ）を使う ▸
              </summary>
              <div className="mt-2 relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={s.apiKey}
                  onChange={e => save({ ...s, apiKey: e.target.value, credentialsJson: null })}
                  placeholder="AIzaSy..."
                  className="input-field pr-11 text-xs font-mono"
                  autoCapitalize="none" autoCorrect="off" spellCheck="false"
                />
                <button onClick={() => setShowKey(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">
                スプレッドシートを「リンクを知っている全員が閲覧可能」に設定してください
              </p>
            </details>
          </div>
        )}
      </div>

      {/* シート一覧 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 font-medium">シート一覧</label>
          <button onClick={startNew}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-neo-400 bg-neo-900/30 active:bg-neo-900/50">
            <Plus size={11} /> 追加
          </button>
        </div>

        <div className="space-y-2">
          {s.sheets.map(sh => (
            <div key={sh.id}>
              {editId === sh.id ? (
                <SheetEditForm form={form} setForm={setForm} onSave={commit} onCancel={() => setEditId(null)} />
              ) : (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-800/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200">{sh.name}</p>
                    <p className="text-[10px] text-slate-500 truncate font-mono mt-0.5">{sh.spreadsheetId}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      範囲: {sh.range} · {sh.interval === 0 ? '手動更新' : `${sh.interval}秒ごと`}
                    </p>
                  </div>
                  <button onClick={() => startEdit(sh)} className="text-slate-600 active:text-slate-400 shrink-0 mt-0.5">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => del(sh.id)} className="text-rose-800 active:text-rose-500 shrink-0 mt-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {editId === 'new' && (
            <SheetEditForm form={form} setForm={setForm} onSave={commit} onCancel={() => setEditId(null)} />
          )}
        </div>
      </div>

      {/* セキュリティ注記 */}
      <p className="text-[10px] text-slate-700 leading-relaxed">
        ※ 認証情報はブラウザの localStorage に保存されます。共有端末ではご注意ください。
      </p>
    </div>
  )
}

// ---- 貼り付けエリア -----------------------------------------------------------

function CredPasteArea({ onPaste }) {
  const [text, setText] = useState('')
  return (
    <div className="mt-2 space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'{\n  "type": "service_account",\n  ...\n}'}
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs
          font-mono text-slate-300 placeholder-slate-700 resize-none h-24
          focus:outline-none focus:border-emerald-600"
        spellCheck="false" autoCapitalize="none" autoCorrect="off"
      />
      <button
        onClick={() => { if (text.trim()) onPaste(text) }}
        disabled={!text.trim()}
        className="w-full py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium
          active:bg-emerald-700 disabled:opacity-40 flex items-center justify-center gap-1"
      >
        <Check size={11} /> 読み込む
      </button>
    </div>
  )
}

// ---- シート編集フォーム -------------------------------------------------------

function SheetEditForm({ form, setForm, onSave, onCancel }) {
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const [sheetNames, setSheetNames] = useState([])
  const [fetchingNames, setFetchingNames] = useState(false)
  const [namesError, setNamesError] = useState(null)

  const fetchNames = async () => {
    const sid = extractSheetId(form.url)
    if (!sid) return
    setFetchingNames(true)
    setNamesError(null)
    try {
      const settings = loadSheetsSettings()
      const names = await fetchSpreadsheetMeta(settings, sid)
      setSheetNames(names)
      if (names.length === 1) setForm(f => ({ ...f, range: names[0] }))
    } catch (e) {
      setNamesError(e.message)
    } finally {
      setFetchingNames(false)
    }
  }

  return (
    <div className="space-y-2 bg-slate-800/50 rounded-xl p-3">
      <input value={form.name} onChange={set('name')} placeholder="シート名（表示名）"
        className="input-field text-xs py-2" autoCapitalize="none" />
      <input value={form.url} onChange={set('url')} placeholder="スプレッドシートのURL または ID"
        className="input-field text-xs py-2 font-mono" autoCapitalize="none" autoCorrect="off" spellCheck="false" />

      {/* 範囲 + シート名取得ボタン */}
      <div className="flex gap-1.5">
        <input value={form.range} onChange={set('range')} placeholder="シート名 または Sheet1!A1:Z"
          className="input-field text-xs py-2 font-mono flex-1" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
        <button
          onClick={fetchNames}
          disabled={!form.url.trim() || fetchingNames}
          title="スプレッドシートのシート名一覧を取得"
          className="px-2.5 py-1.5 rounded-xl bg-slate-700 text-slate-400 text-xs
            active:bg-slate-600 disabled:opacity-40 shrink-0 flex items-center gap-1"
        >
          {fetchingNames ? <Loader size={11} className="animate-spin" /> : '取得'}
        </button>
      </div>

      {/* シート名候補 */}
      {sheetNames.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {sheetNames.map(name => (
            <button key={name} onClick={() => setForm(f => ({ ...f, range: name }))}
              className={`px-2 py-1 rounded-lg text-xs transition-colors
                ${form.range === name ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 active:bg-slate-600'}`}>
              {name}
            </button>
          ))}
        </div>
      )}
      {namesError && <p className="text-[10px] text-rose-400">{namesError}</p>}

      <div>
        <p className="text-[10px] text-slate-500 mb-1.5">自動更新間隔</p>
        <div className="flex gap-1 flex-wrap">
          {INTERVAL_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setForm(f => ({ ...f, interval: opt.value }))}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors
                ${form.interval === opt.value ? 'bg-neo-600 text-white' : 'bg-slate-700 text-slate-400 active:bg-slate-600'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onSave}
          className="flex-1 py-1.5 rounded-lg bg-neo-600 text-white text-xs font-medium flex items-center justify-center gap-1 active:bg-neo-700">
          <Check size={11} /> 保存
        </button>
        <button onClick={onCancel}
          className="flex-1 py-1.5 rounded-lg bg-slate-700 text-slate-400 text-xs font-medium active:bg-slate-600">
          キャンセル
        </button>
      </div>
    </div>
  )
}
