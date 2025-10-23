import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import "./App.css"
import bed from "./assets/bed.svg"
import clock from "./assets/clock.svg"

const RADIUS = 150
const CENTER_X = 150
const CENTER_Y = 150
const ARC_RADIUS = RADIUS - 30
const TOTAL_MINUTES = 1440 // 24 * 60
const MIN_DURATION = 60    // 1 小时
const MAX_DURATION = 1200  // 20 小时

const TICK_INTERVAL = 15        // 每15分钟一个刻度
const MARGIN_MINUTES = 30       // 两端各留30分钟空白

type DragType = 'bedtime' | 'wakeup' | 'path'

interface TickLine {
  x1: number
  y1: number
  x2: number
  y2: number
  key: string
}

// 归一化时间到 [0, 1439]
const normalizeTime = (mins: number): number => {
  return ((mins % TOTAL_MINUTES) + TOTAL_MINUTES) % TOTAL_MINUTES
}

// 屏幕坐标 → 分钟（0~1439）
const clientToMinutes = (clientX: number, clientY: number, rect: DOMRect): number => {
  const dx = clientX - (rect.left + CENTER_X)
  const dy = clientY - (rect.top + CENTER_Y)
  let angle = Math.atan2(dy, dx)
  if (angle < -Math.PI / 2) angle += 2 * Math.PI
  return Math.round(normalizeTime(((angle + Math.PI / 2) / (2 * Math.PI)) * TOTAL_MINUTES))
}

// 分钟 → 弧度（-π/2 起始，顺时针）
const minutesToAngle = (mins: number): number => {
  return (normalizeTime(mins) / TOTAL_MINUTES) * 2 * Math.PI - Math.PI / 2
}

// 格式化时间
const formatTime = (mins: number): string => {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// 计算从 bedtime 到 wakeup 的顺时针分钟数
const computeSleepDuration = (bed: number, wake: number): number => {
  const diff = wake - bed
  return diff > 0 ? diff : diff + TOTAL_MINUTES
}

// 根据拖动类型调整时间，确保时长在 [MIN_DURATION, MAX_DURATION] 内
const adjustTimesWithClamp = (bed: number, wake: number, dragType: DragType): { bedtime: number; wakeup: number } => {
  let duration = computeSleepDuration(bed, wake)
  if (duration < MIN_DURATION) {
    if (dragType === 'wakeup') {
      return { bedtime: normalizeTime(wake - MIN_DURATION), wakeup: wake }
    } else {
      return { bedtime: bed, wakeup: normalizeTime(bed + MIN_DURATION) }
    }
  } else if (duration > MAX_DURATION) {
    if (dragType === 'wakeup') {
      return { bedtime: normalizeTime(wake - MAX_DURATION), wakeup: wake }
    } else {
      return { bedtime: bed, wakeup: normalizeTime(bed + MAX_DURATION) }
    }
  }
  return { bedtime: bed, wakeup: wake }
}

const App = () => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [bedtime, setBedtime] = useState(23 * 60) // 23:00
  const [wakeup, setWakeup] = useState(8 * 60)   // 08:00
  const [dragging, setDragging] = useState<DragType | null>(null)
  const [dragState, setDragState] = useState<{
    initialTouchAngle: number
    initialBedtime: number
    targetDuration: number
  } | null>(null)

  // 缓存所有坐标和路径信息
  const coords = useMemo(() => {
    const bAngle = minutesToAngle(bedtime)
    const wAngle = minutesToAngle(wakeup)
    const angleDiff = ((wAngle - bAngle + 2 * Math.PI) % (2 * Math.PI))
    const largeArcFlag = angleDiff > Math.PI ? 1 : 0
    const sleepDuration = computeSleepDuration(bedtime, wakeup)

    return {
      bedtimeX: CENTER_X + ARC_RADIUS * Math.cos(bAngle),
      bedtimeY: CENTER_Y + ARC_RADIUS * Math.sin(bAngle),
      wakeupX: CENTER_X + ARC_RADIUS * Math.cos(wAngle),
      wakeupY: CENTER_Y + ARC_RADIUS * Math.sin(wAngle),
      largeArcFlag,
      sleepDuration,
    }
  }, [bedtime, wakeup])

  // 全局触摸移动处理
  const handleGlobalTouchMove = useCallback((e: TouchEvent) => {
    if (!dragging || e.touches.length === 0 || !svgRef.current) return

    const touch = e.touches[0]
    const rect = svgRef.current.getBoundingClientRect()

    if (dragging === 'bedtime' || dragging === 'wakeup') {
      const newTime = clientToMinutes(touch.clientX, touch.clientY, rect)
      const { bedtime: clampedBed, wakeup: clampedWake } = adjustTimesWithClamp(
        dragging === 'bedtime' ? newTime : bedtime,
        dragging === 'wakeup' ? newTime : wakeup,
        dragging
      )
      setBedtime(clampedBed)
      setWakeup(clampedWake)
    } else if (dragging === 'path' && dragState) {
      const currentAngle = Math.atan2(
        touch.clientY - (rect.top + CENTER_Y),
        touch.clientX - (rect.left + CENTER_X)
      )

      let delta = currentAngle - dragState.initialTouchAngle
      if (delta > Math.PI) delta -= 2 * Math.PI
      if (delta < -Math.PI) delta += 2 * Math.PI

      const newBedAngle = minutesToAngle(dragState.initialBedtime) + delta
      const newBed = normalizeTime(
        Math.round(((newBedAngle + Math.PI / 2) / (2 * Math.PI)) * TOTAL_MINUTES)
      )
      const newWake = normalizeTime(newBed + dragState.targetDuration)

      setBedtime(newBed)
      setWakeup(newWake)
    }
  }, [dragging, dragState, bedtime, wakeup])

  const handleGlobalTouchEnd = useCallback(() => {
    setDragging(null)
    setDragState(null)
  }, [])

  // 绑定全局事件（注意 passive: false 是必须的，否则 preventDefault 无效）
  useEffect(() => {
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false })
    window.addEventListener('touchend', handleGlobalTouchEnd)
    return () => {
      window.removeEventListener('touchmove', handleGlobalTouchMove)
      window.removeEventListener('touchend', handleGlobalTouchEnd)
    }
  }, [handleGlobalTouchMove, handleGlobalTouchEnd])

  // 局部触摸开始：bedtime / wakeup / path
  const handleTouchStart = useCallback((e: React.TouchEvent, type: DragType) => {
    e.stopPropagation()
    // e.preventDefault() // 防止滚动等默认行为

    const touch = e.touches[0]
    if (!svgRef.current) return

    const rect = svgRef.current.getBoundingClientRect()

    if (type === 'bedtime' || type === 'wakeup') {
      const newTime = clientToMinutes(touch.clientX, touch.clientY, rect)
      const { bedtime: clampedBed, wakeup: clampedWake } = adjustTimesWithClamp(
        type === 'bedtime' ? newTime : bedtime,
        type === 'wakeup' ? newTime : wakeup,
        type
      )
      setBedtime(clampedBed)
      setWakeup(clampedWake)
      setDragging(type)
    } else if (type === 'path') {
      const touchAngle = Math.atan2(
        touch.clientY - (rect.top + CENTER_Y),
        touch.clientX - (rect.left + CENTER_X)
      )
      const duration = computeSleepDuration(bedtime, wakeup)
      setDragging('path')
      setDragState({
        initialTouchAngle: touchAngle,
        initialBedtime: bedtime,
        targetDuration: Math.max(MIN_DURATION, Math.min(MAX_DURATION, duration)),
      })
    }
  }, [bedtime, wakeup])

  const tickLines = useMemo(() => {
    const ticks: TickLine[] = []
    const totalDuration = computeSleepDuration(bedtime, wakeup)
    // 如果有效区间太小，不绘制刻度
    if (totalDuration <= 2 * MARGIN_MINUTES) {
      return ticks
    }
    const start = normalizeTime(bedtime + MARGIN_MINUTES)
    const end = normalizeTime(wakeup - MARGIN_MINUTES)
    // 计算有效结束点相对于 bedtime 的偏移（用于比较）
    const endOffset = computeSleepDuration(bedtime, end) // 安全：end 在 bedtime 之后（顺时针）
    let current = start
    let currentOffset = computeSleepDuration(bedtime, current)
    // 安全上限：防止无限循环（最多画一圈）
    const maxTicks = Math.ceil(TOTAL_MINUTES / TICK_INTERVAL)
    let count = 0
    while (currentOffset <= endOffset && count < maxTicks) {
      const angle = minutesToAngle(current)
      const innerRadius = ARC_RADIUS - 8
      const outerRadius = ARC_RADIUS + 8
      ticks.push({
        x1: CENTER_X + innerRadius * Math.cos(angle),
        y1: CENTER_Y + innerRadius * Math.sin(angle),
        x2: CENTER_X + outerRadius * Math.cos(angle),
        y2: CENTER_Y + outerRadius * Math.sin(angle),
        key: `tick-${current}`,
      })
      // 推进到下一个刻度
      current = normalizeTime(current + TICK_INTERVAL)
      currentOffset = computeSleepDuration(bedtime, current)
      count++
    }
    return ticks
  }, [bedtime, wakeup])

  return (
    <div className="wrap">
      <img src="./assets/bed.svg" alt="" />
      <h2>就寝: {formatTime(bedtime)} | 起床: {formatTime(wakeup)}</h2>
      <h4>
        睡眠时长: {Math.floor(coords.sleepDuration / 60)}h {coords.sleepDuration % 60}m
      </h4>
      <svg width="300" height="300" ref={svgRef} style={{ touchAction: 'none' }} onContextMenu={(e) => e.preventDefault()}>
        <circle cx={CENTER_X} cy={CENTER_Y} r={RADIUS} fill="#DCDBE1" />
        <path
          d={`M ${coords.bedtimeX} ${coords.bedtimeY} A ${ARC_RADIUS} ${ARC_RADIUS} 0 ${coords.largeArcFlag} 1 ${coords.wakeupX} ${coords.wakeupY}`}
          fill="none" stroke="#ffffff" strokeLinecap="round" strokeWidth="30"
          onTouchStart={(e) => handleTouchStart(e, 'path')} />
        {tickLines.map((tick) => (
          <line key={tick.key} x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2} stroke="#F5F4FA"
            strokeWidth="3" strokeLinecap="round" />
        ))}
        <image href={bed} x={coords.bedtimeX - 10} y={coords.bedtimeY - 10} width="20" height="20"
          onTouchStart={(e) => handleTouchStart(e, 'bedtime')}
        />
        <image href={clock} x={coords.wakeupX - 10} y={coords.wakeupY - 10} width="20" height="20"
          onTouchStart={(e) => handleTouchStart(e, 'wakeup')}
        />
      </svg>
    </div>
  )
}

export default App