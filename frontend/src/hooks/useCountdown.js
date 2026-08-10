import { useState, useEffect } from 'react'
import dayjs from 'dayjs'

/* ── Countdown timer hook ──────────────────────────────
   Машин болон шүршүүрийн өрөөний үлдэгдэл хугацааг тооцно. */
export default function useCountdown(startedAt, durationMin) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!startedAt || !durationMin) return { remaining: 0, total: 0, progress: 0, isOverdue: false, label: '--:--' }

  const start = dayjs(startedAt.endsWith('Z') || startedAt.includes('+') ? startedAt : startedAt + 'Z')
  const endTime = start.add(durationMin, 'minute')
  const remainSec = Math.max(0, endTime.diff(now, 'second'))
  const totalSec = durationMin * 60
  const elapsed = totalSec - remainSec
  const progress = Math.min(100, (elapsed / totalSec) * 100)
  const isOverdue = remainSec <= 0

  const mins = Math.floor(remainSec / 60)
  const secs = remainSec % 60
  const label = isOverdue ? '00:00' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  return { remaining: remainSec, total: totalSec, progress, isOverdue, label }
}


/* ── Өнгөрсөн хугацаа (хүлээсэн хугацаа г.м.) ──────────── */
export function useElapsed(since) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!since) return { minutes: 0, label: '--' }

  const start = dayjs(since.endsWith('Z') || since.includes('+') ? since : since + 'Z')
  const sec = Math.max(0, dayjs(now).diff(start, 'second'))
  const mins = Math.floor(sec / 60)
  const label = mins < 60 ? `${mins} мин` : `${Math.floor(mins / 60)}ц ${mins % 60}м`
  return { minutes: mins, label }
}
