export type SlaTone = 'met' | 'onTrack' | 'warning' | 'breach'

interface SlaInfo {
  label: string
  tone: SlaTone
}

/** Ticket con los campos mínimos necesarios para calcular su estado de SLA. */
export interface SlaAwareTicket {
  resolutionDueAt?: string
  statusIsFinal: boolean
  resolvedAt?: string
  createdAt: string
}

/** Formatea una duración en milisegundos como "Xmin" / "Xhrs Ymin" / "Xd Yhrs". */
export function fmtDurationMs(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000))
  if (totalMinutes < 60) return `${totalMinutes}min`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) {
    const m = totalMinutes % 60
    return m === 0 ? `${totalHours}hrs` : `${totalHours}hrs ${m}min`
  }
  const days = Math.floor(totalHours / 24)
  const h = totalHours % 24
  return h === 0 ? `${days}d` : `${days}d ${h}hrs`
}

/**
 * Estado de SLA de resolución de un ticket, o null si su prioridad no tiene
 * objetivo configurado. "warning" = ya pasó el 80% del tiempo asignado (mismo
 * umbral que usa el escalamiento automático en el backend, hd.SP_ProcessSlaEscalations).
 */
export function getSlaInfo(t: SlaAwareTicket): SlaInfo | null {
  if (!t.resolutionDueAt) return null
  const due = new Date(t.resolutionDueAt).getTime()

  if (t.statusIsFinal) {
    if (!t.resolvedAt) return null
    const resolved = new Date(t.resolvedAt).getTime()
    return resolved <= due
      ? { label: 'Cumplido', tone: 'met' }
      : { label: 'Incumplido', tone: 'breach' }
  }

  const now = Date.now()
  if (now >= due) return { label: `Vencido ${fmtDurationMs(now - due)}`, tone: 'breach' }

  const created = new Date(t.createdAt).getTime()
  const totalMs = due - created
  const elapsedRatio = totalMs > 0 ? (now - created) / totalMs : 1
  return {
    label: `Vence ${fmtDurationMs(due - now)}`,
    tone: elapsedRatio >= 0.8 ? 'warning' : 'onTrack',
  }
}
