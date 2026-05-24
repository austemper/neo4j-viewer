import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Loader, WifiOff, ExternalLink, FileSpreadsheet, Clock } from 'lucide-react'
import { loadSheetsSettings, fetchSheetData } from './useGoogleSheets'

function timeAgo(date) {
  if (!date) return null
  const sec = Math.floor((Date.now() - date) / 1000)
  if (sec < 5) return 'たった今'
  if (sec < 60) return `${sec}秒前`
  if (sec < 3600) return `${Math.floor(sec / 60)}分前`
  return `${Math.floor(sec / 3600)}時間前`
}

// ---- データテーブル ----------------------------------------------------------

function SheetTable({ headers, rows }) {
  if (!headers.length) return (
    <p className="text-sm text-slate-500 text-center py-10">データなし</p>
  )

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full" style={{ tableLayout: 'auto' }}>
        <thead className="sticky top-0 z-10 bg-slate-950">
          <tr className="border-b border-slate-700">
            {/* 行番号 */}
            <th className="px-3 py-2 text-[10px] text-slate-600 font-medium text-right w-8 shrink-0">#</th>
            {headers.map((h, i) => (
              <th key={i}
                className="px-3 py-2 text-left text-xs text-slate-300 font-semibold whitespace-nowrap">
                {h || <span className="text-slate-700">{String.fromCharCode(65 + i)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
              <td className="px-3 py-2 text-[10px] text-slate-700 text-right tabular-nums">{ri + 2}</td>
              {headers.map((_, ci) => (
                <td key={ci} className="px-3 py-2 text-xs text-slate-300 whitespace-nowrap max-w-[200px]">
                  <span className="block truncate" title={row[ci] ?? ''}>
                    {row[ci] ?? ''}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- カウントダウン表示 -------------------------------------------------------

function SyncCountdown({ interval, nextSyncAt }) {
  const [remaining, setRemaining] = useState(null)

  useEffect(() => {
    if (!interval || !nextSyncAt) { setRemaining(null); return }
    const tick = () => setRemaining(Math.max(0, Math.ceil((nextSyncAt - Date.now()) / 1000)))
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [interval, nextSyncAt])

  if (remaining === null) return null
  return (
    <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
      <Clock size={9} />
      {remaining}s
    </span>
  )
}

// ---- メインコンポーネント ---------------------------------------------------

export default function SheetsViewer() {
  const settings = loadSheetsSettings()
  const sheets = settings.sheets

  const [selectedId, setSelectedId] = useState(sheets[0]?.id ?? '')
  const [data, setData] = useState(null)   // { headers, rows, range }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [nextSyncAt, setNextSyncAt] = useState(null)
  const intervalRef = useRef(null)

  const currentSheet = sheets.find(sh => sh.id === selectedId)

  const hasAuth = !!(settings.credentialsJson || settings.apiKey)

  const fetchData = useCallback(async (sheet = currentSheet) => {
    if (!sheet || !hasAuth) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchSheetData(settings, sheet.spreadsheetId, sheet.range)
      setData(result)
      setLastSync(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentSheet, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  // シート切り替え or マウント時: 必ず初回取得 + インターバルをセット
  useEffect(() => {
    clearInterval(intervalRef.current)
    setData(null); setError(null); setLastSync(null); setNextSyncAt(null)
    if (!currentSheet || !hasAuth) return

    // 常に初回読み込みを実行
    fetchData(currentSheet)

    // 自動更新設定がある場合はループ開始
    if (currentSheet.interval > 0) {
      const next = Date.now() + currentSheet.interval * 1000
      setNextSyncAt(next)
      intervalRef.current = setInterval(() => {
        fetchData(currentSheet)
        setNextSyncAt(Date.now() + currentSheet.interval * 1000)
      }, currentSheet.interval * 1000)
    }

    return () => clearInterval(intervalRef.current)
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasAuth) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
        <FileSpreadsheet size={40} className="text-slate-700 mb-4" />
        <p className="text-slate-400 font-medium">Google Sheets 未設定</p>
        <p className="text-slate-600 text-sm mt-1">設定タブで API キーとシートを登録してください</p>
      </div>
    )
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
        <FileSpreadsheet size={40} className="text-slate-700 mb-4" />
        <p className="text-slate-400 font-medium">シート未登録</p>
        <p className="text-slate-600 text-sm mt-1">設定タブでスプレッドシートを追加してください</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* ツールバー */}
      <div className="shrink-0 bg-slate-900/60 border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {/* シート選択 */}
          {sheets.length > 1 ? (
            <select
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 text-xs
                rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500"
            >
              {sheets.map(sh => (
                <option key={sh.id} value={sh.id}>{sh.name}</option>
              ))}
            </select>
          ) : (
            <div className="flex-1 flex items-center gap-1.5">
              <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm font-medium text-slate-200 truncate">
                {currentSheet?.name}
              </span>
            </div>
          )}

          {/* 最終更新 */}
          {lastSync && (
            <span className="text-[10px] text-slate-600 shrink-0">
              {timeAgo(lastSync)}
            </span>
          )}

          {/* カウントダウン */}
          <SyncCountdown
            interval={currentSheet?.interval}
            nextSyncAt={nextSyncAt}
          />

          {/* 手動更新 */}
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded-xl
              bg-slate-800 text-slate-400 active:bg-slate-700 disabled:opacity-40 shrink-0"
          >
            {loading
              ? <Loader size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
          </button>

          {/* Sheets で開く */}
          {currentSheet && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${currentSheet.spreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-xl
                bg-slate-800 text-slate-400 active:bg-slate-700 shrink-0"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        {/* 行数・列数 */}
        {data && (
          <p className="text-[10px] text-slate-600 mt-1">
            {data.rows.length} 行 · {data.headers.length} 列
            {currentSheet?.interval > 0 && ` · ${currentSheet.interval}秒ごとに自動更新`}
          </p>
        )}
      </div>

      {/* エラー */}
      {error && (
        <div className="shrink-0 mx-4 mt-3 flex items-start gap-2
          bg-rose-950/50 border border-rose-800 rounded-xl px-4 py-3">
          <WifiOff size={15} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-rose-300 break-all">{error}</p>
            {/range/i.test(error) && (
              <p className="text-[10px] text-amber-400 mt-1">
                シート名が違います。設定タブでシートを編集し「取得」ボタンで正しいシート名を確認してください
              </p>
            )}
          </div>
        </div>
      )}

      {/* ローディング（初回のみ中央表示） */}
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader size={24} className="text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400">読み込み中...</p>
          </div>
        </div>
      )}

      {/* テーブル（ローディング中でもデータがあれば表示） */}
      {data && (
        <div className="flex-1 overflow-auto scrollbar-thin pb-24 relative">
          <SheetTable headers={data.headers} rows={data.rows} />
        </div>
      )}
    </div>
  )
}
