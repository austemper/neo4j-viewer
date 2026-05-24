import { useState } from 'react'
import { Database, Eye, EyeOff, Wifi, WifiOff, Loader } from 'lucide-react'
import { guessDatabase } from './useNeo4jApi'

export default function ConnectionForm({ connection, onConnect, isLoading, error }) {
  const [form, setForm] = useState({
    uri: connection.uri || '',
    username: connection.username || 'neo4j',
    password: connection.password || '',
    database: connection.database || '',
  })
  const [showPassword, setShowPassword] = useState(false)

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))

  // URI 入力時にデータベース名を自動補完
  const onUriChange = (e) => {
    const uri = e.target.value
    setForm(f => ({
      ...f,
      uri,
      database: f.database || guessDatabase(uri),
    }))
  }

  const canSubmit = form.uri.trim() && form.username.trim() && form.password.trim()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10">
      {/* ロゴ */}
      <div className="mb-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-neo-600/20 border border-neo-500/30 flex items-center justify-center mx-auto mb-4">
          <Database size={28} className="text-neo-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Neo4j Aura</h1>
        <p className="text-sm text-slate-500 mt-1">データベースに接続</p>
      </div>

      {/* フォーム */}
      <div className="w-full max-w-sm space-y-3">
        {/* URI */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">接続 URI</label>
          <input
            type="text"
            value={form.uri}
            onChange={onUriChange}
            placeholder="neo4j+s://xxxxxxxx.databases.neo4j.io"
            className="input-field"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
          />
        </div>

        {/* ユーザー名 */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">ユーザー名</label>
          <input
            type="text"
            value={form.username}
            onChange={set('username')}
            placeholder="neo4j"
            className="input-field"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        {/* パスワード */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">パスワード</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder="••••••••"
              className="input-field pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 active:text-slate-300"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* データベース名 */}
        <div>
          <label className="block text-xs text-slate-400 mb-1.5 font-medium">データベース</label>
          <input
            type="text"
            value={form.database}
            onChange={set('database')}
            placeholder="neo4j または URI の先頭部分"
            className="input-field"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="flex items-start gap-2 bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3">
            <WifiOff size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-rose-300 break-all">{error}</p>
          </div>
        )}

        {/* 接続ボタン */}
        <button
          onClick={() => onConnect(form)}
          disabled={!canSubmit || isLoading}
          className="w-full py-3.5 rounded-2xl bg-neo-600 text-white font-semibold text-base
            active:bg-neo-700 disabled:opacity-40 disabled:pointer-events-none
            flex items-center justify-center gap-2 mt-2"
        >
          {isLoading ? (
            <>
              <Loader size={18} className="animate-spin" />
              接続中...
            </>
          ) : (
            <>
              <Wifi size={18} />
              接続
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-600 mt-3">
          パスワードはセッション中のみ保持されます
        </p>
      </div>
    </div>
  )
}
