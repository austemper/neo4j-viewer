import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Eye, EyeOff, ArrowUp, ArrowDown, Bold, Italic } from 'lucide-react'
import { useLabelSettings, PRESET_COLORS, DEFAULT_GRAPH_LABEL, REL_WIDTH_OPTIONS, PATH_DEGREE_MIN, PATH_DEGREE_MAX } from './LabelSettingsContext'

function RelationshipSettingsSection() {
  const { relSettings, updateRelSettings } = useLabelSettings()
  return (
    <div className="card p-4 space-y-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">リレーション（グラフ表示）</p>
      {/* 線の太さ */}
      <div>
        <p className="text-xs text-slate-500 mb-2">矢印の太さ</p>
        <div className="flex bg-slate-800 rounded-lg overflow-hidden">
          {REL_WIDTH_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateRelSettings({ width: opt.value })}
              className={`flex-1 py-2 text-xs font-medium transition-colors
                ${relSettings.width === opt.value ? 'bg-neo-600 text-white' : 'text-slate-400 active:bg-slate-700'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* プレビュー */}
        <div className="mt-2 flex items-center gap-3 px-1">
          <div className="flex-1 flex items-center gap-1">
            <div className="flex-1 rounded-full bg-slate-500" style={{ height: relSettings.width }} />
            <div className="w-0 h-0 border-l-[6px] border-l-slate-500 border-y-[4px] border-y-transparent" />
          </div>
          {relSettings.showLabel && (
            <span className="text-xs text-slate-500 font-mono">RELATION</span>
          )}
        </div>
      </div>
      {/* タイプラベル */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">リレーションタイプ名を表示</span>
        <button
          onClick={() => updateRelSettings({ showLabel: !relSettings.showLabel })}
          className={`w-12 h-6 rounded-full transition-colors relative
            ${relSettings.showLabel ? 'bg-neo-600' : 'bg-slate-700'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
            ${relSettings.showLabel ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  )
}

function PathSettingsSection() {
  const { pathSettings, updatePathSettings } = useLabelSettings()
  const deg = pathSettings.maxNodeDegree
  const isMax = deg >= PATH_DEGREE_MAX

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
          経路探索 ノードフィルター
        </p>
        {isMax && (
          <span className="text-[10px] text-slate-600 bg-slate-800 px-2 py-0.5 rounded-full">
            フィルターなし
          </span>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-slate-400">接続数の上限</p>
          <span className="text-sm font-bold tabular-nums" style={{ color: isMax ? '#475569' : '#3b82f6' }}>
            {isMax ? '無制限' : `${deg} 以上を除外`}
          </span>
        </div>

        {/* スライダー */}
        <div className="relative">
          <input
            type="range"
            min={PATH_DEGREE_MIN}
            max={PATH_DEGREE_MAX}
            value={deg}
            onChange={e => updatePathSettings({ maxNodeDegree: Number(e.target.value) })}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((deg - PATH_DEGREE_MIN) / (PATH_DEGREE_MAX - PATH_DEGREE_MIN)) * 100}%, #1e293b ${((deg - PATH_DEGREE_MIN) / (PATH_DEGREE_MAX - PATH_DEGREE_MIN)) * 100}%, #1e293b 100%)`,
            }}
          />
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-slate-600">{PATH_DEGREE_MIN}（厳しく）</span>
            <span className="text-[10px] text-slate-600">{PATH_DEGREE_MAX}（緩く）</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-600 mt-2 leading-relaxed">
          経路上の中間ノードのうち、接続数がこの値以上のノードを通る経路を非表示にします。
          ハブノードを除いた有意な経路のみを表示できます。
        </p>
      </div>
    </div>
  )
}

const FONT_SIZES = [8, 9, 10, 11, 12, 13, 14]

function ColorSwatch({ color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-8 h-8 rounded-full border-2 transition-transform active:scale-90"
      style={{
        backgroundColor: color,
        borderColor: active ? '#fff' : 'transparent',
        boxShadow: active ? `0 0 0 2px ${color}` : 'none',
      }}
    />
  )
}

function PropRow({ propKey, visible, onToggle, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-700/40 last:border-0">
      <button onClick={onToggle} className="shrink-0 text-slate-400 active:text-slate-200">
        {visible ? <Eye size={16} className="text-neo-400" /> : <EyeOff size={16} className="text-slate-600" />}
      </button>
      <span className={`flex-1 text-sm font-mono truncate ${visible ? 'text-slate-200' : 'text-slate-600'}`}>
        {propKey}
      </span>
      <div className="flex gap-1 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700 text-slate-400 active:bg-slate-600 disabled:opacity-20">
          <ArrowUp size={12} />
        </button>
        <button onClick={onMoveDown} disabled={isLast}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700 text-slate-400 active:bg-slate-600 disabled:opacity-20">
          <ArrowDown size={12} />
        </button>
      </div>
    </div>
  )
}

function GraphLabelSection({ label, propKeys }) {
  const { getGraphLabel, setGraphLabel } = useLabelSettings()
  const gl = getGraphLabel(label)

  const set = (patch) => setGraphLabel(label, patch)

  return (
    <div className="pt-3 border-t border-slate-700/50">
      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">グラフ上のラベル</p>

      {/* 表示プロパティ選択 */}
      <div className="mb-3">
        <p className="text-xs text-slate-600 mb-1.5">表示するプロパティ</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => set({ prop: null })}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors
              ${gl.prop === null ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
          >
            自動
          </button>
          {propKeys.map(k => (
            <button
              key={k}
              onClick={() => set({ prop: k })}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors
                ${gl.prop === k ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* フォントスタイル */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* サイズ */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">サイズ</span>
          <div className="flex bg-slate-800 rounded-lg overflow-hidden">
            {FONT_SIZES.map(s => (
              <button
                key={s}
                onClick={() => set({ size: s })}
                className={`w-8 h-7 text-xs transition-colors
                  ${gl.size === s ? 'bg-neo-600 text-white' : 'text-slate-400 active:bg-slate-700'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* 太字 */}
        <button
          onClick={() => set({ bold: !gl.bold })}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors
            ${gl.bold ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
        >
          <Bold size={14} />
        </button>

        {/* イタリック */}
        <button
          onClick={() => set({ italic: !gl.italic })}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors
            ${gl.italic ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
        >
          <Italic size={14} />
        </button>

        {/* プレビュー */}
        <span
          className="text-slate-300 ml-1"
          style={{
            fontSize: gl.size,
            fontWeight: gl.bold ? 'bold' : 'normal',
            fontStyle: gl.italic ? 'italic' : 'normal',
          }}
        >
          {gl.prop ?? '自動'} preview
        </span>
      </div>
    </div>
  )
}

function CardTitleSection({ label, propKeys }) {
  const { getCardTitleProp, setCardTitleProp } = useLabelSettings()
  const current = getCardTitleProp(label)
  return (
    <div className="pt-3 border-t border-slate-700/50">
      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">カード見出し</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCardTitleProp(label, null)}
          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors
            ${current === null ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
        >
          自動
        </button>
        {propKeys.map(k => (
          <button
            key={k}
            onClick={() => setCardTitleProp(label, k)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-colors
              ${current === k ? 'bg-neo-600 text-white' : 'bg-slate-800 text-slate-400 active:bg-slate-700'}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}

function LabelSection({ label, propKeys }) {
  const [open, setOpen] = useState(false)
  const { settings, getColor, setLabelColor, setLabelPropConfig } = useLabelSettings()

  const cfg = settings[label]
  const currentColor = getColor(label)

  const orderedKeys = useMemo(() => {
    const order = cfg?.propOrder || []
    const hidden = new Set(cfg?.hidden || [])
    const ordered = order.filter(k => propKeys.includes(k))
    const rest = propKeys.filter(k => !order.includes(k))
    return { keys: [...ordered, ...rest], hidden }
  }, [cfg, propKeys])

  const move = (index, dir) => {
    const keys = [...orderedKeys.keys]
    const swapIdx = index + dir
    if (swapIdx < 0 || swapIdx >= keys.length) return
    ;[keys[index], keys[swapIdx]] = [keys[swapIdx], keys[index]]
    setLabelPropConfig(label, keys, [...orderedKeys.hidden])
  }

  const toggleHide = (key) => {
    const hidden = new Set(orderedKeys.hidden)
    hidden.has(key) ? hidden.delete(key) : hidden.add(key)
    setLabelPropConfig(label, orderedKeys.keys, [...hidden])
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 active:bg-slate-700"
      >
        <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: currentColor }} />
        <span className="flex-1 text-left font-semibold text-slate-100 text-sm">{label}</span>
        <span className="text-xs text-slate-500">{propKeys.length} props</span>
        {open ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-slate-700/50">
          {/* カラーピッカー */}
          <div className="py-3">
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">カラー</p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(color => (
                <ColorSwatch key={color} color={color} active={currentColor === color}
                  onClick={() => setLabelColor(label, color)} />
              ))}
            </div>
          </div>

          {/* プロパティ表示設定 */}
          {propKeys.length > 0 && (
            <div className="border-t border-slate-700/50 pt-3">
              <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wide">
                プロパティ（順序 / 表示）
              </p>
              <div>
                {orderedKeys.keys.map((key, i) => (
                  <PropRow
                    key={key} propKey={key}
                    visible={!orderedKeys.hidden.has(key)}
                    onToggle={() => toggleHide(key)}
                    onMoveUp={() => move(i, -1)}
                    onMoveDown={() => move(i, 1)}
                    isFirst={i === 0}
                    isLast={i === orderedKeys.keys.length - 1}
                  />
                ))}
              </div>
            </div>
          )}

          {/* カード見出し設定 */}
          <CardTitleSection label={label} propKeys={propKeys} />
          {/* グラフラベル設定 */}
          <GraphLabelSection label={label} propKeys={propKeys} />
        </div>
      )}
    </div>
  )
}

export default function LabelSettingsPanel({ nodes }) {
  const labelProps = useMemo(() => {
    const map = {}
    nodes.forEach(n => {
      (n.labels || []).forEach(l => {
        if (!map[l]) map[l] = new Set()
        Object.keys(n.properties || {}).forEach(k => map[l].add(k))
      })
    })
    return Object.fromEntries(Object.entries(map).map(([l, s]) => [l, Array.from(s)]))
  }, [nodes])

  const labels = Object.keys(labelProps)

  if (labels.length === 0) {
    return (
      <div className="px-4 py-4 space-y-3">
        <RelationshipSettingsSection />
        <PathSettingsSection />
        <div className="py-6 text-center text-slate-600 text-sm">
          閲覧タブでノードを読み込むと<br />ラベル設定が表示されます
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3">
      {/* リレーション設定（グローバル） */}
      <RelationshipSettingsSection />

      {/* 経路探索フィルター */}
      <PathSettingsSection />

      <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mt-4">
        ラベル設定 ({labels.length})
      </p>
      {labels.map(label => (
        <LabelSection key={label} label={label} propKeys={labelProps[label]} />
      ))}
    </div>
  )
}
