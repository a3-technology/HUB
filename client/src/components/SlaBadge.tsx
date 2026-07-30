import { getSlaInfo, type SlaAwareTicket, type SlaTone } from '../lib/sla'

const SLA_TONE_STYLES: Record<SlaTone, string> = {
  met:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  onTrack: 'bg-slate-50 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-600',
  warning: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  breach:  'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20',
}

/** Chip de estado de SLA (Vence/Vencido/Cumplido/Incumplido), o "—" si el ticket no tiene objetivo configurado. */
export function SlaBadge({ ticket }: { ticket: SlaAwareTicket }) {
  const info = getSlaInfo(ticket)
  if (!info) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${SLA_TONE_STYLES[info.tone]}`}>
      {info.label}
    </span>
  )
}
