import { useRef, useState, useCallback } from 'react'

/**
 * スワイプで開閉できるボトムシート。
 * 状態: peek（一部表示）↔ expanded（最大表示）
 * シートは position:absolute で親コンテナ内に収まる。
 */
export default function BottomSheet({
  children,
  onClose,
  peekHeight = 220,
  maxHeightRatio = 0.78, // 親コンテナ高さに対する最大割合
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [dragDelta, setDragDelta] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchRef = useRef(null)
  const sheetRef = useRef(null)

  /** コンテナ高さを取得 */
  const getContainerH = () =>
    sheetRef.current?.parentElement?.offsetHeight ?? window.innerHeight

  // ---- タッチハンドラ（ハンドルのみ） ----
  const onHandleTouchStart = useCallback((e) => {
    e.stopPropagation()
    touchRef.current = { startY: e.touches[0].clientY }
    setIsDragging(true)
    setDragDelta(0)
  }, [])

  const onHandleTouchMove = useCallback((e) => {
    if (!touchRef.current) return
    e.stopPropagation()
    const dy = e.touches[0].clientY - touchRef.current.startY
    setDragDelta(dy)
  }, [])

  const onHandleTouchEnd = useCallback(() => {
    if (!touchRef.current) return
    const dy = dragDelta
    setIsDragging(false)
    setDragDelta(0)
    touchRef.current = null

    if (isExpanded) {
      if (dy > 60) setIsExpanded(false)
      // さらに大きくスワイプ下で閉じる
      if (dy > getContainerH() * 0.4) onClose?.()
    } else {
      if (dy < -60) setIsExpanded(true)
      if (dy > 80) onClose?.()
    }
  }, [isExpanded, dragDelta, onClose])

  // ---- 高さ計算 ----
  const containerH = getContainerH()
  const fullH = Math.floor(containerH * maxHeightRatio)

  let currentH
  if (isDragging) {
    const base = isExpanded ? fullH : peekHeight
    // ドラッグ上（負）でシート拡大、下（正）で縮小
    currentH = Math.min(fullH, Math.max(peekHeight * 0.4, base - dragDelta))
  } else {
    currentH = isExpanded ? fullH : peekHeight
  }

  // シーク進捗（0=peek, 1=full）
  const progress = Math.min(1, Math.max(0, (currentH - peekHeight) / (fullH - peekHeight)))

  return (
    <div
      ref={sheetRef}
      className="absolute bottom-0 left-0 right-0 z-20 flex flex-col
        bg-slate-900/95 backdrop-blur rounded-t-2xl border-t border-slate-700/60
        shadow-2xl"
      style={{
        height: currentH,
        transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* ドラッグハンドル + シークバー */}
      <div
        className="shrink-0 flex flex-col items-center pt-2.5 pb-2 touch-none cursor-grab select-none"
        onTouchStart={onHandleTouchStart}
        onTouchMove={onHandleTouchMove}
        onTouchEnd={onHandleTouchEnd}
      >
        {/* ピル */}
        <div className="w-10 h-1 rounded-full bg-slate-600 mb-2" />

        {/* シークバー */}
        <div className="w-28 h-0.5 rounded-full bg-slate-700 relative overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-neo-500 rounded-full"
            style={{
              width: `${progress * 100}%`,
              transition: isDragging ? 'none' : 'width 0.3s ease',
            }}
          />
          {/* サム（シークヘッド） */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-neo-400 -translate-x-1/2"
            style={{
              left: `${progress * 100}%`,
              transition: isDragging ? 'none' : 'left 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* スクロール可能なコンテンツ */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
