import { useState, useRef, useEffect, useCallback } from 'react'
import { FileText, Trash2, X } from 'lucide-react'

const HANDLE_W   = 22
const HANDLE_H   = 68
const HANDLE_TOP = 195
const PANEL_W    = 272
const STORAGE_KEY = 'calc_note_drawing_v1'

export default function NoteDrawer({ open, onOpenChange: setOpen }) {

  const canvasRef = useRef(null)
  const wrapRef   = useRef(null)
  const drawing   = useRef(false)
  const lastPt    = useRef(null)

  // ── キャンバス初期化 ────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const w = wrap.offsetWidth
    const h = wrap.offsetHeight

    if (!w || !h) {
      // レイアウト未確定 → 次フレームでリトライ（0サイズのまま初期化すると保存データが復元できない）
      requestAnimationFrame(() => initCanvas())
      return
    }

    canvas.width  = w * dpr
    canvas.height = h * dpr
    canvas.style.width  = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      // JPEG形式（透過なし・黒背景）は無効化して削除
      if (saved.startsWith('data:image/jpeg')) {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        const img = new Image()
        img.onload = () => { ctx.clearRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h) }
        img.onerror = () => {}
        img.src = saved
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return
    // open になるたび（初回マウント含む）キャンバスを初期化して保存データを復元
    const t = setTimeout(() => initCanvas(), 50)
    return () => clearTimeout(t)
  }, [open, initCanvas])

  // タブ切替でコンポーネントが再マウントされた際も復元
  useEffect(() => {
    if (open) initCanvas()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 描画 ──────────────────────────────────────────────────
  const getPoint = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    const t = e.touches[0]
    return { x: t.clientX - r.left, y: t.clientY - r.top }
  }

  const onTouchStart = (e) => {
    if (e.touches.length !== 1 || e.touches[0].touchType !== 'stylus') return
    e.preventDefault()
    drawing.current = true
    const p = getPoint(e)
    lastPt.current = p
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  }

  const onTouchMove = (e) => {
    if (!drawing.current || e.touches.length !== 1 || e.touches[0].touchType !== 'stylus') return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const p = getPoint(e)
    const force = e.touches[0].force > 0 ? e.touches[0].force : 0.5
    ctx.strokeStyle = '#f97316'
    ctx.shadowColor = 'rgba(0,0,0,0.3)'
    ctx.shadowBlur  = 2
    ctx.lineWidth   = 1.5 + force * 3
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    lastPt.current = p
  }

  const onTouchEnd = (e) => {
    if (e.changedTouches[0]?.touchType !== 'stylus') return
    drawing.current = false
    try {
      const canvas = canvasRef.current
      // JPEG は透過チャンネルを持たないため背景が黒くなる → PNG で保存
      if (canvas) localStorage.setItem(STORAGE_KEY, canvas.toDataURL('image/png'))
    } catch {}
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const wrap   = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, wrap.offsetWidth, wrap.offsetHeight)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <>
      {/* 画面外タップで閉じる */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }} />
      )}

      {/* タブ（右端・常時表示） */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          top: HANDLE_TOP,
          right: 0,
          zIndex: 9999,
          width: HANDLE_W,
          height: HANDLE_H,
          background: open ? '#f59e0b' : '#1e293b',
          borderTopLeftRadius: 10,
          borderBottomLeftRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          cursor: 'pointer',
          boxShadow: '-3px 0 12px rgba(0,0,0,0.4)',
          touchAction: 'manipulation',
        }}
      >
        <FileText size={12} color={open ? '#0f172a' : '#64748b'} />
        <svg width="7" height="14" viewBox="0 0 7 14" fill="none">
          <path
            d={open ? 'M2 1.5 L5.5 7 L2 12.5' : 'M5.5 1.5 L2 7 L5.5 12.5'}
            stroke={open ? '#0f172a' : '#475569'} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* 縦長ポップアップ（タブ左隣） */}
      {open && (
        <div style={{
          position: 'fixed',
          top: 90,
          bottom: 75,
          right: HANDLE_W + 6,
          width: PANEL_W,
          zIndex: 9999,
          background: 'rgba(10, 18, 35, 0.08)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          borderRadius: 16,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-4px 4px 24px rgba(0,0,0,0.35)',
        }}>
          {/* ヘッダー */}
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px 8px',
            borderBottom: '1px solid rgba(0,0,0,0.1)',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} color="#000" />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#000000' }}>計算ノート</span>
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              <button onClick={clearCanvas}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#666' }}>
                <Trash2 size={14} />
              </button>
              <button onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: '#666' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* 手書きキャンバス */}
          <div ref={wrapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 200 }}>
            <canvas
              ref={canvasRef}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'crosshair' }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              color: 'rgba(0,0,0,0.12)',
              fontSize: 12, textAlign: 'center', lineHeight: 1.8,
            }}>
              ここに手書きで<br />計算メモを書けます
            </div>
          </div>
        </div>
      )}
    </>
  )
}
