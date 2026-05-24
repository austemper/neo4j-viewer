import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'neo4j_label_settings'
const REL_SETTINGS_KEY = 'neo4j_rel_settings'
const PATH_SETTINGS_KEY = 'neo4j_path_settings'

export const DEFAULT_PATH_SETTINGS = { maxNodeDegree: 20 }
export const PATH_DEGREE_MIN = 3
export const PATH_DEGREE_MAX = 20

export const DEFAULT_REL_SETTINGS = { width: 1.5, showLabel: true }

export const REL_WIDTH_OPTIONS = [
  { label: '細', value: 1 },
  { label: '普通', value: 1.5 },
  { label: '太', value: 2.5 },
  { label: '極太', value: 4 },
]

export const PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#f59e0b', '#f43f5e',
  '#0ea5e9', '#10b981', '#f97316', '#ec4899',
]

// デフォルトカラー（ラベルの出現順に割り当て）
const DEFAULT_COLORS = PRESET_COLORS
let defaultColorIndex = 0
const defaultColorCache = {}

export function getDefaultColor(label) {
  if (!defaultColorCache[label]) {
    defaultColorCache[label] = DEFAULT_COLORS[defaultColorIndex % DEFAULT_COLORS.length]
    defaultColorIndex++
  }
  return defaultColorCache[label]
}

export function resetDefaultColors() {
  Object.keys(defaultColorCache).forEach(k => delete defaultColorCache[k])
  defaultColorIndex = 0
}

// グラフラベルのデフォルト設定
export const DEFAULT_GRAPH_LABEL = { prop: null, size: 9, bold: false, italic: false }

const LabelSettingsContext = createContext(null)

export function LabelSettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })

  const [relSettings, setRelSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(REL_SETTINGS_KEY)
      return saved ? { ...DEFAULT_REL_SETTINGS, ...JSON.parse(saved) } : DEFAULT_REL_SETTINGS
    } catch { return DEFAULT_REL_SETTINGS }
  })

  const [pathSettings, setPathSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(PATH_SETTINGS_KEY)
      return saved ? { ...DEFAULT_PATH_SETTINGS, ...JSON.parse(saved) } : DEFAULT_PATH_SETTINGS
    } catch { return DEFAULT_PATH_SETTINGS }
  })

  const save = useCallback((updated) => {
    setSettings(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }, [])

  const updateRelSettings = useCallback((patch) => {
    setRelSettings(prev => {
      const updated = { ...prev, ...patch }
      localStorage.setItem(REL_SETTINGS_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const updatePathSettings = useCallback((patch) => {
    setPathSettings(prev => {
      const updated = { ...prev, ...patch }
      localStorage.setItem(PATH_SETTINGS_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const setLabelColor = useCallback((label, color) => {
    save({ ...settings, [label]: { ...settings[label], color } })
  }, [settings, save])

  const setLabelPropConfig = useCallback((label, propOrder, hidden) => {
    save({ ...settings, [label]: { ...settings[label], propOrder, hidden } })
  }, [settings, save])

  /** カード見出しプロパティを設定（null = 自動） */
  const setCardTitleProp = useCallback((label, prop) => {
    save({ ...settings, [label]: { ...settings[label], cardTitleProp: prop } })
  }, [settings, save])

  /** グラフ上のラベル表示設定を更新 */
  const setGraphLabel = useCallback((label, config) => {
    save({
      ...settings,
      [label]: {
        ...settings[label],
        graphLabel: { ...DEFAULT_GRAPH_LABEL, ...(settings[label]?.graphLabel ?? {}), ...config },
      },
    })
  }, [settings, save])

  const getColor = useCallback((label) => {
    return settings[label]?.color || getDefaultColor(label)
  }, [settings])

  /** カード見出しプロパティを取得（null = 自動） */
  const getCardTitleProp = useCallback((label) => {
    return settings[label]?.cardTitleProp ?? null
  }, [settings])

  /** グラフラベル設定を取得（未設定ならデフォルト） */
  const getGraphLabel = useCallback((label) => {
    return { ...DEFAULT_GRAPH_LABEL, ...(settings[label]?.graphLabel ?? {}) }
  }, [settings])

  const getDisplayProps = useCallback((label, allProps) => {
    const cfg = settings[label]
    const allKeys = Object.keys(allProps)
    if (!cfg?.propOrder) return Object.entries(allProps)
    const hidden = new Set(cfg.hidden || [])
    const ordered = cfg.propOrder.filter(k => allKeys.includes(k))
    const rest = allKeys.filter(k => !cfg.propOrder.includes(k))
    return [...ordered, ...rest]
      .filter(k => !hidden.has(k))
      .map(k => [k, allProps[k]])
  }, [settings])

  const getPreviewProps = useCallback((label, allProps, titleValue) => {
    return getDisplayProps(label, allProps)
      .filter(([, v]) => String(v) !== titleValue)
      .slice(0, 3)
  }, [getDisplayProps])

  return (
    <LabelSettingsContext.Provider value={{
      settings,
      setLabelColor, setLabelPropConfig, setGraphLabel, setCardTitleProp,
      getColor, getGraphLabel, getDisplayProps, getPreviewProps, getCardTitleProp,
      relSettings, updateRelSettings,
      pathSettings, updatePathSettings,
    }}>
      {children}
    </LabelSettingsContext.Provider>
  )
}

export function useLabelSettings() {
  return useContext(LabelSettingsContext)
}
