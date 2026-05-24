import { useEffect, useRef, useCallback, useState } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { getNodeTitle } from './useNeo4jData'
import { useLabelSettings } from './LabelSettingsContext'
import BottomSheet from './BottomSheet'

// ---- 力学シミュレーション ------------------------------------------------

const NODE_R = 20
const LINK_LEN = 90
const REPULSION = 4000
const SPRING_K = 0.04
const CENTER_K = 0.008
const DAMPING = 0.82
const ALPHA_DECAY = 0.025
const MIN_ALPHA = 0.001

function initNodes(nodes) {
  return nodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1)
    const r = Math.max(60, nodes.length * 8)
    return { ...n, x: r * Math.cos(angle), y: r * Math.sin(angle), vx: 0, vy: 0 }
  })
}

function buildLinks(simNodes, relationships) {
  const byId = new Map(simNodes.map(n => [n.id, n]))
  return relationships
    .map(r => ({ ...r, source: byId.get(r.startNode), target: byId.get(r.endNode) }))
    .filter(r => r.source && r.target)
}

function tick(simNodes, simLinks, alpha) {
  for (let i = 0; i < simNodes.length; i++) {
    for (let j = i + 1; j < simNodes.length; j++) {
      const a = simNodes[i], b = simNodes[j]
      const dx = b.x - a.x || 0.01, dy = b.y - a.y || 0.01
      const r2 = Math.max(dx * dx + dy * dy, 4)
      const r = Math.sqrt(r2)
      const f = REPULSION / r2
      a.vx -= f * dx / r; a.vy -= f * dy / r
      b.vx += f * dx / r; b.vy += f * dy / r
    }
  }
  for (const lk of simLinks) {
    const dx = lk.target.x - lk.source.x, dy = lk.target.y - lk.source.y
    const r = Math.sqrt(dx * dx + dy * dy) || 1
    const f = (r - LINK_LEN) * SPRING_K * alpha
    lk.source.vx += f * dx / r; lk.source.vy += f * dy / r
    lk.target.vx -= f * dx / r; lk.target.vy -= f * dy / r
  }
  for (const n of simNodes) {
    n.vx -= n.x * CENTER_K * alpha; n.vy -= n.y * CENTER_K * alpha
  }
  for (const n of simNodes) {
    n.vx *= DAMPING; n.vy *= DAMPING
    n.x += n.vx; n.y += n.vy
  }
  return alpha * (1 - ALPHA_DECAY)
}

// ---- 描画 ----------------------------------------------------------------

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function draw(ctx, W, H, simNodes, simLinks, transform, selectedId, getColor, getGraphLabel, relSettings) {
  ctx.clearRect(0, 0, W, H)
  ctx.save()
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)

  // エッジ
  for (const lk of simLinks) {
    const { source: s, target: t } = lk
    const dx = t.x - s.x, dy = t.y - s.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const ex = t.x - dx / len * NODE_R, ey = t.y - dy / len * NODE_R

    const lw = relSettings.width
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(ex, ey)
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = lw
    ctx.stroke()

    // 矢印ヘッド（太さに比例）
    const headSize = 4 + lw * 1.5
    const ax = ex - (dx / len) * headSize * 2, ay = ey - (dy / len) * headSize * 2
    const nx = -dy / len, ny = dx / len
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ax + nx * headSize, ay + ny * headSize)
    ctx.lineTo(ax - nx * headSize, ay - ny * headSize)
    ctx.closePath()
    ctx.fillStyle = '#334155'
    ctx.fill()

    if (relSettings.showLabel && lk.type && transform.k > 0.6) {
      ctx.font = '8px monospace'
      ctx.fillStyle = '#475569'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(lk.type, (s.x + t.x) / 2, (s.y + t.y) / 2 - 6)
    }
  }

  // ノード
  for (const n of simNodes) {
    const primaryLabel = (n.labels || ['?'])[0]
    const color = getColor(primaryLabel)
    const selected = n.id === selectedId
    const rgb = hexToRgb(color)
    const gl = getGraphLabel(primaryLabel)

    if (selected) {
      const grd = ctx.createRadialGradient(n.x, n.y, NODE_R, n.x, n.y, NODE_R + 10)
      grd.addColorStop(0, `rgba(${rgb},0.5)`)
      grd.addColorStop(1, `rgba(${rgb},0)`)
      ctx.beginPath()
      ctx.arc(n.x, n.y, NODE_R + 10, 0, 2 * Math.PI)
      ctx.fillStyle = grd
      ctx.fill()
    }

    ctx.beginPath()
    ctx.arc(n.x, n.y, NODE_R, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
    if (selected) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2.5
      ctx.stroke()
    }

    // 頭文字
    ctx.font = 'bold 11px sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(primaryLabel[0]?.toUpperCase() ?? '?', n.x, n.y)

    // ノードラベルテキスト
    if (transform.k > 0.35) {
      const labelText = gl.prop
        ? String(n.properties?.[gl.prop] ?? '')
        : getNodeTitle(n)
      const short = labelText.length > 14 ? labelText.slice(0, 14) + '…' : labelText
      const style = gl.italic ? 'italic ' : ''
      const weight = gl.bold ? 'bold ' : ''
      ctx.font = `${style}${weight}${gl.size}px sans-serif`
      ctx.fillStyle = '#94a3b8'
      ctx.textBaseline = 'top'
      ctx.fillText(short, n.x, n.y + NODE_R + 3)
    }
  }

  ctx.restore()
}

// ---- コンポーネント -------------------------------------------------------

export default function GraphView({ nodes, relationships, onClose }) {
  const canvasRef = useRef(null)
  const simRef = useRef({ simNodes: [], simLinks: [], alpha: 1 })
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const animRef = useRef(null)
  const touchRef = useRef({})
  const drawStateRef = useRef({ selectedId: null, getColor: null, getGraphLabel: null })
  const [selectedNode, setSelectedNode] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { getColor, getGraphLabel, getDisplayProps, relSettings } = useLabelSettings()

  // stale closure 回避
  drawStateRef.current.getColor = getColor
  drawStateRef.current.getGraphLabel = getGraphLabel
  drawStateRef.current.selectedId = selectedNode?.id ?? null
  drawStateRef.current.relSettings = relSettings

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { simNodes, simLinks } = simRef.current
    const { selectedId, getColor: gc, getGraphLabel: ggl, relSettings: rs } = drawStateRef.current
    draw(ctx, canvas.width, canvas.height, simNodes, simLinks,
      transformRef.current, selectedId, gc, ggl, rs ?? { width: 1.5, showLabel: true })
  }, [])

  const startLoop = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const loop = () => {
      const s = simRef.current
      if (s.alpha > MIN_ALPHA) {
        s.alpha = tick(s.simNodes, s.simLinks, s.alpha)
        renderFrame()
        animRef.current = requestAnimationFrame(loop)
      } else {
        renderFrame()
      }
    }
    animRef.current = requestAnimationFrame(loop)
  }, [renderFrame])

  useEffect(() => {
    const simNodes = initNodes(nodes)
    const simLinks = buildLinks(simNodes, relationships)
    simRef.current = { simNodes, simLinks, alpha: 1 }
    const canvas = canvasRef.current
    if (canvas) {
      transformRef.current = { x: canvas.width / 2, y: canvas.height / 2, k: 1 }
    }
    setSelectedNode(null)
    startLoop()
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [nodes, relationships, startLoop])

  // キャンバスリサイズ
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.offsetWidth, h = canvas.offsetHeight
      canvas.width = w * dpr; canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      if (transformRef.current.x === 0 && transformRef.current.y === 0) {
        transformRef.current = { x: w / 2, y: h / 2, k: 1 }
      }
      renderFrame()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [renderFrame])

  // 選択変化でリドロー
  useEffect(() => { renderFrame() }, [selectedNode, renderFrame])

  // 設定変化でリドロー（getColor/getGraphLabel が変わったとき）
  useEffect(() => { renderFrame() })

  // ---- ヒットテスト ----
  const hitTest = useCallback((cx, cy) => {
    const { x, y, k } = transformRef.current
    const wx = (cx - x) / k, wy = (cy - y) / k
    return simRef.current.simNodes.find(n => {
      const dx = n.x - wx, dy = n.y - wy
      return Math.sqrt(dx * dx + dy * dy) <= NODE_R + 6
    }) ?? null
  }, [])

  // ---- タッチ / マウスハンドラ ----
  const onTouchStart = useCallback((e) => {
    e.preventDefault()
    const ts = e.touches
    if (ts.length === 1) {
      touchRef.current = {
        mode: 'pan',
        sx: ts[0].clientX, sy: ts[0].clientY,
        lx: ts[0].clientX, ly: ts[0].clientY,
        t0: Date.now(), moved: false,
      }
    } else if (ts.length === 2) {
      const dx = ts[1].clientX - ts[0].clientX, dy = ts[1].clientY - ts[0].clientY
      touchRef.current = {
        mode: 'pinch',
        dist0: Math.sqrt(dx * dx + dy * dy),
        k0: transformRef.current.k,
        tx0: transformRef.current.x, ty0: transformRef.current.y,
        mx: (ts[0].clientX + ts[1].clientX) / 2,
        my: (ts[0].clientY + ts[1].clientY) / 2,
      }
    }
  }, [])

  const onTouchMove = useCallback((e) => {
    e.preventDefault()
    const ts = e.touches
    const tr = touchRef.current
    if (tr.mode === 'pan' && ts.length === 1) {
      const dx = ts[0].clientX - tr.lx, dy = ts[0].clientY - tr.ly
      if (Math.hypot(ts[0].clientX - tr.sx, ts[0].clientY - tr.sy) > 6) tr.moved = true
      transformRef.current.x += dx; transformRef.current.y += dy
      tr.lx = ts[0].clientX; tr.ly = ts[0].clientY
      renderFrame()
    } else if (tr.mode === 'pinch' && ts.length === 2) {
      const dx = ts[1].clientX - ts[0].clientX, dy = ts[1].clientY - ts[0].clientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const newK = Math.min(Math.max(tr.k0 * (dist / tr.dist0), 0.1), 8)
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const cx = tr.mx - rect.left, cy = tr.my - rect.top
      transformRef.current.x = cx - (cx - tr.tx0) * (newK / tr.k0)
      transformRef.current.y = cy - (cy - tr.ty0) * (newK / tr.k0)
      transformRef.current.k = newK
      renderFrame()
    }
  }, [renderFrame])

  const onTouchEnd = useCallback((e) => {
    const tr = touchRef.current
    if (tr.mode === 'pan' && !tr.moved && Date.now() - tr.t0 < 300) {
      const canvas = canvasRef.current
      const rect = canvas.getBoundingClientRect()
      const cx = tr.sx - rect.left, cy = tr.sy - rect.top
      const hit = hitTest(cx, cy)
      setSelectedNode(prev => prev?.id === hit?.id ? null : hit)
    }
    touchRef.current = {}
  }, [hitTest])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newK = Math.min(Math.max(transformRef.current.k * factor, 0.1), 8)
    transformRef.current.x = cx - (cx - transformRef.current.x) * (newK / transformRef.current.k)
    transformRef.current.y = cy - (cy - transformRef.current.y) * (newK / transformRef.current.k)
    transformRef.current.k = newK
    renderFrame()
  }, [renderFrame])

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-[100] flex flex-col bg-slate-950'
    : 'relative w-full h-full flex flex-col bg-slate-950'

  // 表示プロパティ（設定の順序・表示に従う）
  const displayProps = selectedNode
    ? getDisplayProps((selectedNode.labels || ['?'])[0], selectedNode.properties || {})
    : []

  return (
    <div className={containerClass}>
      {/* ツールバー */}
      <div className="absolute top-2 right-2 z-10 flex gap-1.5">
        <button
          onClick={() => setIsFullscreen(v => !v)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/80 backdrop-blur text-slate-400 active:bg-slate-700"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/80 backdrop-blur text-slate-400 active:bg-slate-700"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* ノード数 */}
      <div className="absolute top-3 left-3 z-10">
        <span className="text-xs text-slate-600 font-mono">
          {nodes.length}n · {relationships.length}e
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full touch-none block"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        style={{ cursor: 'grab' }}
      />

      {/* BottomSheet プロパティパネル */}
      {selectedNode && (
        <BottomSheet
          onClose={() => setSelectedNode(null)}
          peekHeight={200}
          maxHeightRatio={0.75}
        >
          {/* ラベルバッジ + 閉じる */}
          <div className="px-4 pt-1 pb-2 flex items-start justify-between">
            <div className="flex gap-1.5 flex-wrap flex-1">
              {(selectedNode.labels || []).map(l => (
                <span key={l} className="badge text-white text-xs"
                  style={{ backgroundColor: getColor(l) }}>
                  {l}
                </span>
              ))}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="ml-3 text-slate-500 active:text-slate-300 shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>

          {/* プロパティ一覧（設定の順序・表示に従う） */}
          <div className="px-4 pb-6 space-y-1.5">
            {displayProps.length === 0 ? (
              <p className="text-slate-600 text-sm py-2">プロパティなし</p>
            ) : (
              displayProps.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="text-slate-500 font-mono w-24 shrink-0 pt-0.5">{k}</span>
                  <span className="text-slate-200 break-all leading-relaxed">{String(v)}</span>
                </div>
              ))
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  )
}
