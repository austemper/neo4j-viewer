import { useState } from 'react'
import { Eye, EyeOff, Plus, Trash2, Check, Pencil, Sparkles } from 'lucide-react'
import { loadGeminiSettings, saveGeminiSettings } from './useGemini'

function genId() { return `p${Date.now()}` }

export default function GeminiSettings() {
  const [s, setS] = useState(loadGeminiSettings)
  const [showKey, setShowKey] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')

  const save = (updated) => { setS(updated); saveGeminiSettings(updated) }
  const startEdit = (p) => { setEditId(p.id); setEditName(p.name); setEditPrompt(p.prompt) }
  const startNew = () => { setEditId('new'); setEditName(''); setEditPrompt('') }
  const cancelEdit = () => setEditId(null)

  const commitEdit = () => {
    if (!editName.trim() || !editPrompt.trim()) return
    if (editId === 'new') {
      save({ ...s, prompts: [...s.prompts, { id: genId(), name: editName.trim(), prompt: editPrompt.trim() }] })
    } else {
      save({ ...s, prompts: s.prompts.map(p => p.id === editId ? { ...p, name: editName.trim(), prompt: editPrompt.trim() } : p) })
    }
    setEditId(null)
  }

  const del = (id) => save({ ...s, prompts: s.prompts.filter(p => p.id !== id) })

  return (
    <div className="card p-4 space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-violet-400 shrink-0" />
        <h2 className="text-sm font-semibold text-slate-200">Gemini AI 解析設定</h2>
      </div>

      {/* API キー */}
      <div>
        <label className="block text-xs text-slate-500 mb-1.5 font-medium">API キー</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={s.apiKey}
            onChange={e => save({ ...s, apiKey: e.target.value })}
            placeholder="AIzaSy..."
            className="input-field pr-11 text-xs font-mono"
            autoCapitalize="none" autoCorrect="off" spellCheck="false"
          />
          <button onClick={() => setShowKey(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 active:text-slate-300">
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">localStorage に保存されます（共有端末では注意）</p>
      </div>

      {/* モデル ID */}
      <div>
        <label className="block text-xs text-slate-500 mb-1.5 font-medium">モデル ID</label>
        <input
          type="text"
          value={s.modelId}
          onChange={e => save({ ...s, modelId: e.target.value })}
          className="input-field text-xs font-mono"
          autoCapitalize="none" autoCorrect="off" spellCheck="false"
        />
        <p className="text-[10px] text-slate-600 mt-1">例: gemini-2.5-flash / gemini-2.5-flash-preview-05-20</p>
      </div>

      {/* PDF文字選択 → Geminiプロンプトテンプレート */}
      <div>
        <label className="block text-xs text-slate-500 mb-1.5 font-medium">
          PDF 文字選択 → Gemini プロンプト
        </label>
        <textarea
          value={s.pdfPrompt ?? ''}
          onChange={e => save({ ...s, pdfPrompt: e.target.value })}
          placeholder="選択したテキストの前に付けるプロンプトを入力…"
          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs
            text-slate-100 placeholder-slate-600 resize-none focus:outline-none
            focus:border-neo-500 min-h-[72px] leading-relaxed"
          spellCheck="false" autoCapitalize="none" autoCorrect="off"
        />
        <p className="text-[10px] text-slate-600 mt-1 leading-relaxed">
          PDF でテキスト選択後に「Gemini」を押すと、このプロンプト＋選択テキストをクリップボードにコピーして Gemini を開きます。
        </p>
      </div>

      {/* プロンプト一覧 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-500 font-medium">プロンプト</label>
          <button onClick={startNew}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-neo-400 bg-neo-900/30 active:bg-neo-900/50">
            <Plus size={11} /> 追加
          </button>
        </div>

        <div className="space-y-2">
          {s.prompts.map(p => (
            <div key={p.id}>
              {editId === p.id ? (
                <EditForm
                  name={editName} prompt={editPrompt}
                  onName={setEditName} onPrompt={setEditPrompt}
                  onSave={commitEdit} onCancel={cancelEdit}
                />
              ) : (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-800/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200">{p.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{p.prompt}</p>
                  </div>
                  <button onClick={() => startEdit(p)} className="text-slate-600 active:text-slate-400 shrink-0 mt-0.5">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => del(p.id)} className="text-rose-800 active:text-rose-500 shrink-0 mt-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}

          {editId === 'new' && (
            <EditForm
              name={editName} prompt={editPrompt}
              onName={setEditName} onPrompt={setEditPrompt}
              onSave={commitEdit} onCancel={cancelEdit}
            />
          )}
        </div>
      </div>

      {/* 料金目安 */}
      <div className="bg-slate-800/30 rounded-xl p-3">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <span className="text-slate-400 font-semibold">Gemini 2.5 Flash 料金目安:</span><br />
          入力 $0.15/1M tokens · 出力 $0.60/1M tokens<br />
          1クエリあたり通常 ¥0.001〜¥0.02 程度<br />
          ※ 正確な料金は Google AI Studio でご確認ください
        </p>
      </div>
    </div>
  )
}

function EditForm({ name, prompt, onName, onPrompt, onSave, onCancel }) {
  return (
    <div className="space-y-2 bg-slate-800/50 rounded-xl p-3">
      <input value={name} onChange={e => onName(e.target.value)} placeholder="プロンプト名"
        className="input-field text-xs py-2" autoCapitalize="none" />
      <textarea
        value={prompt} onChange={e => onPrompt(e.target.value)}
        placeholder="プロンプト（ノード／経路情報は自動で付加されます）"
        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs
          text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-neo-500 min-h-[80px]"
        spellCheck="false" autoCapitalize="none" autoCorrect="off"
      />
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
