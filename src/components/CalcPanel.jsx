import { useState } from 'react'

const HANDLE_W   = 22
const HANDLE_H   = 68
const HANDLE_TOP = 205
const PANEL_W    = 232

function compute(a, op, b) {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  if (op === '÷') return b !== 0 ? a / b : Infinity
  return b
}

function fmt(n) {
  if (!isFinite(n)) return 'Error'
  const r = parseFloat(n.toPrecision(9))
  const s = String(r)
  return s.length > 11 ? n.toExponential(3) : s
}

const ROWS = [
  ['C', '⌫', '±', '÷'],
  ['7', '8',  '9', '×'],
  ['4', '5',  '6', '−'],
  ['1', '2',  '3', '+'],
  ['0', '.',  '='],
]

function CalcIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" stroke="#64748b" strokeWidth="1.5"/>
      <rect x="4.5" y="4.5" width="11" height="3.5" rx="1" fill="#64748b" opacity="0.75"/>
      {[0,1,2].map(col => [0,1,2].map(row => (
        <rect key={`${col}${row}`}
          x={4.5 + col * 4} y={10.5 + row * 2.8}
          width="2.5" height="1.8" rx="0.5" fill="#64748b" opacity="0.6"
        />
      )))}
    </svg>
  )
}

export default function CalcPanel({ open, onOpenChange: setOpen }) {
  const [disp,  setDisp]  = useState('0')
  const [prev,  setPrev]  = useState(null)
  const [op,    setOp]    = useState(null)
  const [fresh, setFresh] = useState(false)

  const press = (btn) => {
    if (disp === 'Error') {
      setDisp('0'); setPrev(null); setOp(null); setFresh(false)
      if (btn === 'C') return
    }
    if (btn >= '0' && btn <= '9') {
      if (fresh) { setDisp(btn); setFresh(false) }
      else setDisp(s => s === '0' ? btn : s.length < 10 ? s + btn : s)
    } else if (btn === '.') {
      if (fresh) { setDisp('0.'); setFresh(false) }
      else setDisp(s => s.includes('.') ? s : s + '.')
    } else if (btn === 'C') {
      setDisp('0'); setPrev(null); setOp(null); setFresh(false)
    } else if (btn === '⌫') {
      if (!fresh) setDisp(s => s.length > 1 ? s.slice(0, -1) : '0')
    } else if (btn === '±') {
      setDisp(s => { const n = parseFloat(s); return isNaN(n) ? s : fmt(-n) })
    } else if (['+', '−', '×', '÷'].includes(btn)) {
      if (prev !== null && op !== null && !fresh) {
        const r = compute(prev, op, parseFloat(disp))
        setPrev(r); setDisp(fmt(r))
      } else { setPrev(parseFloat(disp)) }
      setOp(btn); setFresh(true)
    } else if (btn === '=') {
      if (op == null) return
      const r = compute(prev ?? parseFloat(disp), op, parseFloat(disp))
      setDisp(fmt(r)); setPrev(null); setOp(null); setFresh(true)
    }
  }

  return (
    <>
      {/* 画面外タップで閉じる */}
      {open && (
        <div onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }} />
      )}

      {/* タブ（常時表示） */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          position: 'fixed',
          top: HANDLE_TOP,
          left: 0,
          zIndex: 9999,
          width: HANDLE_W,
          height: HANDLE_H,
          background: open ? '#f59e0b' : '#1e293b',
          borderTopRightRadius: 10,
          borderBottomRightRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          cursor: 'pointer',
          boxShadow: '3px 0 12px rgba(0,0,0,0.5)',
          touchAction: 'manipulation',
        }}
      >
        <CalcIcon />
        <svg width="7" height="14" viewBox="0 0 7 14" fill="none">
          <path
            d={open ? 'M5.5 1.5 L2 7 L5.5 12.5' : 'M2 1.5 L5.5 7 L2 12.5'}
            stroke={open ? '#0f172a' : '#475569'} strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* ポップアップ（タブの右隣に表示） */}
      {open && (
        <div style={{
          position: 'fixed',
          top: HANDLE_TOP,
          left: HANDLE_W + 6,
          zIndex: 9999,
          width: PANEL_W,
          background: '#0f172a',
          borderRadius: 14,
          boxShadow: '4px 4px 24px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}>
          {/* ディスプレイ */}
          <div style={{
            padding: '10px 14px 8px',
            background: '#020617',
            textAlign: 'right',
            minHeight: 64,
            display: 'flex', flexDirection: 'column',
            justifyContent: 'flex-end', alignItems: 'flex-end',
          }}>
            {op != null && (
              <span style={{ fontSize: 11, color: '#475569', marginBottom: 2, fontFamily: 'monospace' }}>
                {prev != null ? fmt(prev) : ''} {op}
              </span>
            )}
            <span style={{
              fontSize: disp.length > 8 ? 18 : 28,
              color: disp === 'Error' ? '#ef4444' : '#f1f5f9',
              fontFamily: 'monospace',
              fontWeight: 600,
            }}>
              {disp}
            </span>
          </div>

          {/* ボタン */}
          {ROWS.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {row.map((btn, bi) => {
                const isOp = ['+', '−', '×', '÷'].includes(btn)
                const isFn = ['C', '⌫', '±'].includes(btn)
                const isEq = btn === '='
                return (
                  <button key={bi} onClick={() => press(btn)}
                    style={{
                      flex: btn === '0' ? 2 : 1,
                      height: 50,
                      fontSize: 19,
                      fontWeight: isOp || isEq ? 600 : 400,
                      color: isEq ? '#0f172a' : isOp ? '#f59e0b' : isFn ? '#94a3b8' : '#e2e8f0',
                      background: isEq ? '#f59e0b' : 'transparent',
                      border: 'none',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'rgba(255,255,255,0.1)',
                    }}
                  >
                    {btn}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
