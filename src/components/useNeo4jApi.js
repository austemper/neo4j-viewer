import { useState, useCallback, useEffect, useRef } from 'react'

const STORAGE_KEY = 'neo4j_aura_connection'

// bolt/neo4j URI → HTTP ベース URL
function toHttpUrl(uri) {
  return uri
    .replace(/^neo4j\+ssc:\/\//, 'https://')
    .replace(/^neo4j\+s:\/\//, 'https://')
    .replace(/^neo4j:\/\//, 'http://')
    .replace(/^bolt\+ssc:\/\//, 'https://')
    .replace(/^bolt\+s:\/\//, 'https://')
    .replace(/^bolt:\/\//, 'http://')
    .replace(/\/$/, '')
}

// Aura URI からデータベース名を推定（例: neo4j+ssc://cb753f8e.databases.neo4j.io → cb753f8e）
export function guessDatabase(uri) {
  try {
    const host = toHttpUrl(uri).replace(/^https?:\/\//, '').split('/')[0]
    const sub = host.split('.')[0]
    // Aura のホスト名パターン: xxxxxxxx.databases.neo4j.io
    if (host.includes('.databases.neo4j.io')) return sub
  } catch { /* ignore */ }
  return 'neo4j'
}

const DEFAULT_CONN = { uri: '', username: 'neo4j', password: '', database: '' }

export function useNeo4jApi() {
  const [connection, setConnection] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? { ...DEFAULT_CONN, ...JSON.parse(saved) } : DEFAULT_CONN
    } catch {
      return DEFAULT_CONN
    }
  })

  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)

  const saveConnection = useCallback((conn) => {
    setConnection(conn)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conn))
  }, [])

  const runQuery = useCallback(async (cypher, params = {}, conn = null) => {
    const c = conn || connection
    const db = c.database || guessDatabase(c.uri)
    const baseUrl = toHttpUrl(c.uri)
    const url = `${baseUrl}/db/${db}/query/v2`
    const auth = btoa(`${c.username}:${c.password}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ statement: cypher, parameters: params }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let msg = `HTTP ${res.status}`
      try { msg = JSON.parse(text).errors?.[0]?.message || msg } catch { /* ignore */ }
      throw new Error(msg)
    }

    const data = await res.json()
    if (data.errors?.length) throw new Error(data.errors[0].message)
    return data
  }, [connection])

  const connect = useCallback(async (conn) => {
    setIsLoading(true)
    setError(null)
    try {
      await runQuery('RETURN 1', {}, conn)
      if (conn) saveConnection(conn)
      setIsConnected(true)
    } catch (err) {
      setError(err.message)
      setIsConnected(false)
    } finally {
      setIsLoading(false)
    }
  }, [runQuery, saveConnection])

  const disconnect = useCallback(() => {
    setIsConnected(false)
    setError(null)
  }, [])

  // ── 起動時の自動再接続（保存済み認証情報があれば即接続） ──────────────
  const didAutoConnect = useRef(false)
  useEffect(() => {
    if (didAutoConnect.current) return
    didAutoConnect.current = true
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const conn = { ...DEFAULT_CONN, ...JSON.parse(saved) }
      if (conn.uri && conn.password) connect(conn)
    } catch { /* ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keep-alive：4分ごとに RETURN 1 で接続を維持 ───────────────────────
  const isConnectedRef = useRef(isConnected)
  isConnectedRef.current = isConnected
  useEffect(() => {
    const id = setInterval(async () => {
      if (!isConnectedRef.current) return
      try {
        await runQuery('RETURN 1')
      } catch {
        // 接続が切れていたら自動再接続
        try {
          const saved = localStorage.getItem(STORAGE_KEY)
          if (!saved) return
          const conn = { ...DEFAULT_CONN, ...JSON.parse(saved) }
          if (conn.uri && conn.password) connect(conn)
        } catch { /* ignore */ }
      }
    }, 4 * 60 * 1000) // 4分
    return () => clearInterval(id)
  }, [runQuery, connect])

  return { connection, saveConnection, isConnected, isLoading, error, runQuery, connect, disconnect }
}

// query/v2 レスポンスからノード・リレーションを抽出
function isNode(v) { return v && typeof v === 'object' && Array.isArray(v.labels) && v.elementId }
function isRel(v) { return v && typeof v === 'object' && v.type && v.startNodeElementId }

export function parseGraphResults(apiData) {
  const nodeMap = new Map()
  const relMap = new Map()

  const values = apiData?.data?.values || []
  values.forEach(row => {
    row.forEach(cell => {
      if (isNode(cell)) {
        nodeMap.set(cell.elementId, {
          id: cell.elementId,
          labels: cell.labels,
          properties: cell.properties || {},
        })
      } else if (isRel(cell)) {
        relMap.set(cell.elementId, {
          id: cell.elementId,
          type: cell.type,
          startNode: cell.startNodeElementId,
          endNode: cell.endNodeElementId,
          properties: cell.properties || {},
        })
      }
    })
  })

  return {
    nodes: Array.from(nodeMap.values()),
    relationships: Array.from(relMap.values()),
  }
}

// ノード/リレーションを内部形式に正規化（配列セル対応）
function normalizeCell(cell) {
  if (isNode(cell)) return { kind: 'node', data: { id: String(cell.elementId), labels: cell.labels, properties: cell.properties || {} } }
  if (isRel(cell)) return { kind: 'rel', data: { id: String(cell.elementId), type: cell.type, startNode: String(cell.startNodeElementId), endNode: String(cell.endNodeElementId), properties: cell.properties || {} } }
  return null
}

// 経路クエリ用: pathNodes / pathRels フィールドを持つレスポンスを解析
export function parsePathResults(apiData) {
  const fields = apiData?.data?.fields || []
  const values = apiData?.data?.values || []
  const nodesIdx = fields.indexOf('pathNodes')
  const relsIdx = fields.indexOf('pathRels')
  if (nodesIdx === -1) return []

  const seenKey = new Set()
  const paths = []

  values.forEach(row => {
    const rawNodes = Array.isArray(row[nodesIdx]) ? row[nodesIdx] : []
    const rawRels = relsIdx >= 0 && Array.isArray(row[relsIdx]) ? row[relsIdx] : []
    const nodes = rawNodes.map(n => normalizeCell(n)).filter(c => c?.kind === 'node').map(c => c.data)
    const rels = rawRels.map(r => normalizeCell(r)).filter(c => c?.kind === 'rel').map(c => c.data)
    if (nodes.length === 0) return
    const key = nodes.map(n => n.id).join('→')
    if (seenKey.has(key)) return
    seenKey.add(key)
    paths.push({ nodes, relationships: rels })
  })
  return paths
}

// テーブル表示用
export function parseRowResults(apiData) {
  const fields = apiData?.data?.fields || []
  const values = apiData?.data?.values || []
  // ノード/リレーション以外の値のみテーブル化
  const rows = values.map(row =>
    row.map(cell => {
      if (isNode(cell)) return `(${cell.labels.join(':')} ${JSON.stringify(cell.properties)})`
      if (isRel(cell)) return `-[${cell.type}]->`
      return cell
    })
  )
  return { columns: fields, rows }
}
