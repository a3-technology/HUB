import { createContext, useContext, useState, type ReactNode } from 'react'

interface SupportPanelContextValue {
  /** Id del ticket propio que se debe abrir en el panel de soporte (autoservicio), si hay una solicitud pendiente. */
  pendingTicketId: string | null
  /** Pide abrir el panel de soporte directamente en el detalle de un ticket propio. */
  requestOpenTicket: (ticketId: string) => void
  /** Limpia la solicitud una vez atendida. */
  clearPendingTicket: () => void
}

const SupportPanelContext = createContext<SupportPanelContextValue | null>(null)

/**
 * Puente entre el ícono de notificaciones del Topbar y el panel de soporte
 * (autoservicio de Helpdesk): permite que al hacer clic en "ver" sobre una
 * notificación de un ticket propio, el panel se abra directamente en su detalle,
 * sin acoplar ambos componentes entre sí.
 */
export function SupportPanelProvider({ children }: { children: ReactNode }) {
  const [pendingTicketId, setPendingTicketId] = useState<string | null>(null)

  return (
    <SupportPanelContext.Provider
      value={{
        pendingTicketId,
        requestOpenTicket: (ticketId) => setPendingTicketId(ticketId),
        clearPendingTicket: () => setPendingTicketId(null),
      }}
    >
      {children}
    </SupportPanelContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSupportPanel() {
  const ctx = useContext(SupportPanelContext)
  if (!ctx) throw new Error('useSupportPanel debe usarse dentro de SupportPanelProvider')
  return ctx
}
