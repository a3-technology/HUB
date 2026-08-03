using Dapper;
using shared.Models;
using shared.Repositories;

namespace server.Services
{
    /// <summary>
    /// Servicio en background que revisa periódicamente los tickets de Helpdesk con
    /// SLA vencido o por vencer (hd.SP_ProcessSlaEscalations) y notifica: aviso previo
    /// al agente asignado al 80% del tiempo consumido, y aviso de incumplimiento al
    /// agente asignado más a los supervisores (helpdesk.tickets.manage-all). Es
    /// puramente de notificación — no reasigna ni cambia el estado de ningún ticket.
    /// <see cref="IGenericRepository"/> e <see cref="INotificationService"/> son
    /// Scoped, así que este servicio (Singleton) resuelve un <see cref="IServiceScope"/>
    /// nuevo en cada ciclo — mismo patrón que ya usa Program.cs para PermissionCatalogSync.
    /// </summary>
    public class SlaEscalationService : BackgroundService
    {
        private static readonly TimeSpan Interval = TimeSpan.FromMinutes(5);

        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<SlaEscalationService> _logger;

        public SlaEscalationService(IServiceScopeFactory scopeFactory, ILogger<SlaEscalationService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var timer = new PeriodicTimer(Interval);
            try
            {
                while (await timer.WaitForNextTickAsync(stoppingToken))
                {
                    try
                    {
                        ProcessEscalations();
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error al procesar escalamientos de SLA de Helpdesk.");
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Apagado normal de la aplicación: al cancelarse stoppingToken,
                // WaitForNextTickAsync lanza esta excepción para salir del ciclo.
                // Sin este catch, .NET trata cualquier excepción no manejada de
                // un BackgroundService como fatal y apaga todo el host (no solo
                // este servicio) — ver HostOptions.BackgroundServiceExceptionBehavior.
            }
        }

        private void ProcessEscalations()
        {
            using var scope = _scopeFactory.CreateScope();
            var repo = scope.ServiceProvider.GetRequiredService<IGenericRepository>();
            var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();

            var rows = repo.GetAll<HD.SlaEscalationResult>("hd.SP_ProcessSlaEscalations", new DynamicParameters());

            foreach (var row in rows)
            {
                try
                {
                    NotifyRow(notifications, row);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "No se pudo notificar el escalamiento de SLA del ticket {TicketId}.", row.TicketId);
                }
            }
        }

        private static void NotifyRow(INotificationService notifications, HD.SlaEscalationResult row)
        {
            var label = $"{row.Code} · {row.Subject}";

            if (row.ActionType == "Breach")
            {
                if (row.AssignedToId is not null)
                {
                    var assignedUserId = notifications.GetUserIdByEmployeeId(row.AssignedToId.Value);
                    if (assignedUserId is not null)
                        notifications.NotifyUser(assignedUserId.Value, "helpdesk.ticket-sla-breached", "Se incumplió el SLA de tu ticket", label, "helpdesk-ticket", row.TicketId);
                }
                else
                {
                    notifications.NotifyUsersWithModule("helpdesk", "helpdesk.ticket-sla-breached", "Un ticket sin asignar incumplió su SLA", label, "helpdesk-ticket", row.TicketId);
                }

                notifications.NotifyUsersWithPermission("helpdesk.tickets.manage-all", "helpdesk.ticket-sla-breached", "Un ticket incumplió su SLA", label, "helpdesk-ticket", row.TicketId);
            }
            else // "Warning"
            {
                if (row.AssignedToId is not null)
                {
                    var assignedUserId = notifications.GetUserIdByEmployeeId(row.AssignedToId.Value);
                    if (assignedUserId is not null)
                        notifications.NotifyUser(assignedUserId.Value, "helpdesk.ticket-sla-warning", "Tu ticket está por vencer su SLA", label, "helpdesk-ticket", row.TicketId);
                }
                else
                {
                    notifications.NotifyUsersWithModule("helpdesk", "helpdesk.ticket-sla-warning", "Un ticket sin asignar está por vencer su SLA", label, "helpdesk-ticket", row.TicketId);
                }
            }
        }
    }
}
