import { useState, useCallback, useMemo } from 'react'

// Neo4j JSON の各種エクスポート形式をパース
function parseNeo4jJson(raw) {
  let nodes = []
  let relationships = []

  // 1. 標準形式: { nodes: [...], relationships: [...] }
  if (raw && Array.isArray(raw.nodes)) {
    nodes = raw.nodes
    relationships = raw.relationships || []
    return { nodes, relationships }
  }

  // 2. 混在配列形式: [ {type:"node",...}, {type:"relationship",...} ]
  if (Array.isArray(raw)) {
    raw.forEach(item => {
      if (item.type === 'node' || item.labels) nodes.push(item)
      else if (item.type === 'relationship' || item.relationshipType) relationships.push(item)
    })
    return { nodes, relationships }
  }

  // 3. results 形式 (Neo4j HTTP API): { results: [{ data: [{ row, meta }] }] }
  if (raw?.results) {
    const rows = raw.results.flatMap(r => r.data || [])
    rows.forEach(d => {
      const item = Array.isArray(d.row) ? d.row[0] : d.row
      if (item) nodes.push({ id: nodes.length, labels: ['Result'], properties: item })
    })
    return { nodes, relationships }
  }

  throw new Error('サポートされていない JSON 形式です')
}

// JSONL (1行1オブジェクト) をパース
function parseJsonLines(text) {
  const nodes = []
  const relationships = []
  const lines = text.split('\n').filter(l => l.trim())
  lines.forEach(line => {
    try {
      const obj = JSON.parse(line)
      if (obj.type === 'node' || obj.labels) nodes.push(obj)
      else if (obj.type === 'relationship' || obj.relationshipType || obj.startNode) relationships.push(obj)
    } catch { /* skip invalid lines */ }
  })
  return { nodes, relationships }
}

// ノードの表示名を決定
export function getNodeTitle(node) {
  const props = node.properties || node
  // よく使われるプロパティ名を優先
  const titleKeys = ['name', 'title', 'label', 'id', 'key', 'value', 'text', 'description']
  for (const key of titleKeys) {
    if (props[key]) return String(props[key])
  }
  // 最初の文字列プロパティ
  const firstStr = Object.values(props).find(v => typeof v === 'string' && v.length < 80)
  if (firstStr) return firstStr
  return `Node #${node.id || ''}`
}

// ラベルの色を一貫して割り当て
const LABEL_COLORS = [
  'bg-neo-600 text-neo-50',
  'bg-violet-600 text-violet-50',
  'bg-amber-600 text-amber-50',
  'bg-rose-600 text-rose-50',
  'bg-sky-600 text-sky-50',
  'bg-emerald-600 text-emerald-50',
  'bg-orange-600 text-orange-50',
  'bg-pink-600 text-pink-50',
]
const labelColorCache = {}
let labelColorIdx = 0

export function getLabelColor(label) {
  if (!labelColorCache[label]) {
    labelColorCache[label] = LABEL_COLORS[labelColorIdx % LABEL_COLORS.length]
    labelColorIdx++
  }
  return labelColorCache[label]
}

export function useNeo4jData() {
  const [nodes, setNodes] = useState([])
  const [relationships, setRelationships] = useState([])
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [isLoading, setIsLoading] = useState(false)

  const loadFile = useCallback((file) => {
    setIsLoading(true)
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result

        let parsed
        // まず通常のJSONとしてパースを試みる。失敗したらJSONLとして処理
        try {
          parsed = parseNeo4jJson(JSON.parse(text))
        } catch {
          parsed = parseJsonLines(text)
        }

        if (parsed.nodes.length === 0) {
          throw new Error('ノードが見つかりませんでした。JSONの形式を確認してください')
        }

        // プロパティを正規化
        const normalizedNodes = parsed.nodes.map((n, i) => ({
          ...n,
          id: String(n.id ?? n.identity ?? i),
          labels: n.labels || (n.label ? [n.label] : ['Node']),
          properties: n.properties || Object.fromEntries(
            Object.entries(n).filter(([k]) => !['id', 'identity', 'labels', 'label', 'type'].includes(k))
          ),
        }))

        const normalizedRels = parsed.relationships.map((r, i) => ({
          ...r,
          id: String(r.id ?? r.identity ?? i),
          type: r.type || r.relationshipType || 'RELATED_TO',
          startNode: String(r.startNode ?? r.start ?? r.from ?? ''),
          endNode: String(r.endNode ?? r.end ?? r.to ?? ''),
          properties: r.properties || {},
        }))

        setNodes(normalizedNodes)
        setRelationships(normalizedRels)
        setIsLoading(false)
      } catch (err) {
        setError(err.message)
        setIsLoading(false)
      }
    }
    reader.onerror = () => {
      setError('ファイルの読み込みに失敗しました')
      setIsLoading(false)
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const reset = useCallback(() => {
    setNodes([])
    setRelationships([])
    setError(null)
    setFileName(null)
    // ラベルカラーキャッシュをリセット
    Object.keys(labelColorCache).forEach(k => delete labelColorCache[k])
    labelColorIdx = 0
  }, [])

  const allLabels = useMemo(() => {
    const s = new Set()
    nodes.forEach(n => (n.labels || []).forEach(l => s.add(l)))
    return ['すべて', ...Array.from(s)]
  }, [nodes])

  const getRelatedNodes = useCallback((nodeId) => {
    const rels = relationships.filter(
      r => r.startNode === nodeId || r.endNode === nodeId
    )
    return rels.map(r => {
      const isOutgoing = r.startNode === nodeId
      const otherId = isOutgoing ? r.endNode : r.startNode
      const other = nodes.find(n => n.id === otherId)
      return { rel: r, node: other, direction: isOutgoing ? 'out' : 'in' }
    })
  }, [nodes, relationships])

  return {
    nodes,
    relationships,
    allLabels,
    error,
    fileName,
    isLoading,
    loadFile,
    reset,
    getRelatedNodes,
  }
}
