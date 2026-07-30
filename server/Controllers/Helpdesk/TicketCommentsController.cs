using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Comentarios de ticket.
    /// Expone la consulta y gestión de comentarios de seguimiento por ticket.
    /// La autoría se toma del claim "sub" del JWT (la cuenta autenticada), no
    /// del empleado — igual que <c>pm.TaskCommentsController</c>.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/tickets/comments")]
    [Authorize(Policy = "helpdesk")]
    public class TicketCommentsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly INotificationService _notifications;

        /// <summary>Inicializa el controlador con el repositorio genérico y las notificaciones inyectados.</summary>
        public TicketCommentsController(IGenericRepository repo, INotificationService notifications)
        {
            _repo = repo;
            _notifications = notifications;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>Resuelve el empleado vinculado al usuario en sesión (null si no tiene uno).</summary>
        private Guid? CurrentEmployeeId()
        {
            var p = new DynamicParameters();
            p.Add("@UserId", CurrentUserId);
            return _repo.Get<DBO.EmployeeLookupResult>("dbo.SP_GetEmployeeIdByUserId", p)?.EmployeeId;
        }

        /// <summary>
        /// Retorna los comentarios de un ticket, del más antiguo al más reciente.
        /// </summary>
        /// <param name="ticketId">Identificador del ticket.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketCommentResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetByTicket([FromQuery] Guid? ticketId)
        {
            if (ticketId is null)
                return BadRequest(new { message = "Debes indicar ticketId." });

            var p = new DynamicParameters();
            p.Add("@TicketId", ticketId);

            var result = _repo.GetAll<Helpdesk.TicketCommentResponse>("hd.SP_GetTicketComments", p);
            return Ok(result);
        }

        /// <summary>
        /// Agrega un comentario a un ticket, con autoría del usuario autenticado.
        /// </summary>
        /// <param name="ticketId">Identificador del ticket comentado.</param>
        /// <param name="request">Texto del comentario.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketCommentResult"/> o 400 si hay error.</returns>
        [HttpPost("{ticketId:guid}")]
        [RequirePermission("helpdesk.tickets.comment-create", "Comentar tickets")]
        public IActionResult Insert(Guid ticketId, [FromBody] Helpdesk.TicketCommentRequest request)
        {
            var ticketP = new DynamicParameters();
            ticketP.Add("@Id", ticketId);
            var ticket = _repo.Get<Helpdesk.TicketResponse>("hd.SP_GetTicketById", ticketP);
            if (ticket is null)
                return NotFound(new { message = "Ticket no encontrado." });

            if (ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden agregar comentarios." });

            var p = new DynamicParameters();
            p.Add("@TicketId", ticketId);
            p.Add("@UserId",   CurrentUserId);
            p.Add("@Text",     request.Text.Trim());

            var result = _repo.Get<Helpdesk.SP_TicketCommentResult>("hd.SP_InsertTicketComment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al agregar el comentario." });

            // Primera respuesta de SLA: el primer comentario del agente ASIGNADO cuenta
            // como respuesta (no cualquier comentario — un compañero o el solicitante
            // comentando no detiene el reloj de "tiempo de primera respuesta").
            if (ticket.FirstRespondedAt is null && ticket.AssignedToId is not null && ticket.AssignedToId == CurrentEmployeeId())
            {
                var markP = new DynamicParameters();
                markP.Add("@Id", ticketId);
                _repo.Execute("hd.SP_MarkTicketFirstResponse", markP);
            }

            // Avisa al solicitante del ticket (si su cuenta no es la que está comentando).
            var requesterUserId = _notifications.GetUserIdByEmployeeId(ticket.RequesterId);
            if (requesterUserId is not null && requesterUserId != CurrentUserId)
                _notifications.NotifyUser(requesterUserId.Value, "helpdesk.ticket-commented", "Comentario en tu ticket",
                    $"{ticket.Code} · {ticket.Subject}", "helpdesk-ticket", ticketId);

            // Avisa también al responsable asignado, si quien comenta es otra persona
            // (ej. un compañero de soporte) — hoy solo se enteraba el solicitante.
            if (ticket.AssignedToId is not null)
            {
                var assignedUserId = _notifications.GetUserIdByEmployeeId(ticket.AssignedToId.Value);
                if (assignedUserId is not null && assignedUserId != CurrentUserId)
                    _notifications.NotifyUser(assignedUserId.Value, "helpdesk.ticket-commented", "Comentario en un ticket tuyo",
                        $"{ticket.Code} · {ticket.Subject}", "helpdesk-ticket", ticketId);
            }

            return Ok(result);
        }
    }
}
