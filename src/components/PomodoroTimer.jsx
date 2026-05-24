import { useState, useEffect, useRef, useCallback } from 'react'
import { Timer, Play, Pause, RotateCcw, SkipForward, X } from 'lucide-react'

const PHASES = {
  work:  { label: '集中',   color: '#ef4444', duration: 25 * 60 },
  short: { label: '小休憩', color: '#22c55e', duration:  5 * 60 },
  long:  { label: '長休憩', color: '#3b82f6', duration: 15 * 60 },
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[880, 1100, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq; gain.gain.value = 0.18
      const t = ctx.currentTime + i * 0.25
      osc.start(t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25)
      osc.stop(t + 0.25)
    })
  } catch { /* ignore */ }
}

function fmt(sec) {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

// SVG 円形プログレス
function Ring({ timeLeft, total, color, size = 100 }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - timeLeft / total)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono font-bold text-slate-100" style={{ fontSize: size * 0.19 }}>
          {fmt(timeLeft)}
        </span>
      </div>
    </div>
  )
}

export default function PomodoroTimer() {
  const [isOpen, setIsOpen] = useState(false)
  const [phase, setPhase] = useState('work')
  const [timeLeft, setTimeLeft] = useState(PHASES.work.duration)
  const [isRunning, setIsRunning] = useState(false)
  const [doneCount, setDoneCount] = useState(0)  // 完了ポモドーロ数

  const intervalRef = useRef(null)
  // stale closure 回避
  const stateRef = useRef({ phase: 'work', doneCount: 0 })
  stateRef.current.phase = phase
  stateRef.current.doneCount = doneCount

  const advance = useCallback(() => {
    playBeep()
    const { phase: p, doneCount: cnt } = stateRef.current
    setIsRunning(false)
    if (p === 'work') {
      const newCnt = cnt + 1
      setDoneCount(newCnt)
      const next = newCnt % 4 === 0 ? 'long' : 'short'
      setPhase(next)
      setTimeLeft(PHASES[next].duration)
    } else {
      setPhase('work')
      setTimeLeft(PHASES.work.duration)
    }
  }, [])

  useEffect(() => {
    if (!isRunning) { clearInterval(intervalRef.current); return }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(intervalRef.current); advance(); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [isRunning, advance])

  const toggle = () => setIsRunning(r => !r)

  const reset = () => {
    setIsRunning(false)
    setTimeLeft(PHASES[phase].duration)
  }

  const switchPhase = (key) => {
    setIsRunning(false)
    setPhase(key)
    setTimeLeft(PHASES[key].duration)
  }

  const p = PHASES[phase]
  const isLight = document.documentElement.classList.contains('light')

  return (
    <>
      {/* フローティングボタン */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full shadow-xl
          flex items-center justify-center transition-all duration-200"
        style={isRunning ? {
          backgroundColor: p.color,
          border: `2px solid ${p.color}`,
          boxShadow: `0 0 0 4px ${p.color}30, 0 4px 16px ${p.color}40`,
        } : isLight ? {
          backgroundColor: '#ffffff',
          border: '1.5px solid #cbd5e1',
        } : {
          backgroundColor: '#1e293b',
          border: '2px solid #334155',
        }}
      >
        {isRunning
          ? <span className="text-[10px] font-mono font-bold text-white leading-none">{fmt(timeLeft)}</span>
          : <Timer size={20} style={{ color: isLight ? '#475569' : '#94a3b8' }} />}
      </button>

      {/* 展開パネル */}
      {isOpen && (
        <div className="fixed bottom-36 right-4 z-50 w-64 bg-slate-900 rounded-2xl border border-slate-700
          shadow-2xl overflow-hidden">

          {/* ヘッダー */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base">🍅</span>
              <span className="text-sm font-semibold text-slate-200">ポモドーロ</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-500 active:text-slate-300">
              <X size={14} />
            </button>
          </div>

          {/* フェーズ切り替え */}
          <div className="flex gap-1 mx-4 mb-4 bg-slate-800 rounded-xl p-0.5">
            {Object.entries(PHASES).map(([key, ph]) => (
              <button key={key} onClick={() => switchPhase(key)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${phase === key ? 'text-white' : 'text-slate-500 active:text-slate-300'}`}
                style={phase === key ? { backgroundColor: ph.color + 'cc' } : {}}
              >
                {ph.label}
              </button>
            ))}
          </div>

          {/* 円形タイマー */}
          <div className="flex justify-center mb-1">
            <Ring timeLeft={timeLeft} total={p.duration} color={p.color} size={110} />
          </div>

          {/* フェーズラベル */}
          <p className="text-center text-xs font-semibold mb-4" style={{ color: p.color }}>
            {p.label}
          </p>

          {/* コントロール */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button onClick={reset}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
              <RotateCcw size={16} />
            </button>
            <button onClick={toggle}
              className="w-14 h-14 flex items-center justify-center rounded-2xl text-white shadow-lg active:scale-95 transition-transform"
              style={{ backgroundColor: p.color }}>
              {isRunning ? <Pause size={22} /> : <Play size={22} />}
            </button>
            <button onClick={advance}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800 text-slate-400 active:bg-slate-700">
              <SkipForward size={16} />
            </button>
          </div>

          {/* ポモドーロドット */}
          <div className="flex items-center justify-center gap-1.5 pb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="w-2 h-2 rounded-full transition-colors"
                style={{ backgroundColor: i < (doneCount % 4) ? '#ef4444' : '#1e293b', border: '1px solid #334155' }} />
            ))}
            {doneCount > 0 && (
              <span className="text-[10px] text-slate-500 ml-1">{doneCount} 完了</span>
            )}
          </div>
        </div>
      )}
    </>
  )
}
