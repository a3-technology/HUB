using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Notificaciones del usuario autenticado. Genérico para cualquier módulo (hoy
    /// solo Helpdesk las emite, ver <see cref="server.Services.INotificationService"/>) —
    /// cualquier usuario autenticado consulta y gestiona únicamente las suyas, sin
    /// depender de módulos ni permisos.
    /// </summary>
    [ApiController]
    [Route("api/notifications")]
    [Authorize]
    public class NotificationsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public NotificationsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>Retorna las notificaciones más recientes del usuario autenticado.</summary>
        /// <param name="top">Cantidad máxima a retornar (por defecto 20).</param>
        /// <returns>200 con la lista de <see cref="DBO.NotificationResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] int top = 20)
        {
            var p = new DynamicParameters();
            p.Add("@UserId", CurrentUserId);
            p.Add("@Top",    top);
            return Ok(_repo.GetAll<DBO.NotificationResponse>("dbo.SP_GetNotifications", p));
        }

        /// <summary>Retorna la cantidad de notificaciones no leídas del usuario autenticado.</summary>
        /// <returns>200 con { unreadCount }.</returns>
        [HttpGet("unread-count")]
        public IActionResult GetUnreadCount()
        {
            var p = new DynamicParameters();
            p.Add("@UserId", CurrentUserId);
            var result = _repo.Get<DBO.UnreadNotificationCountResponse>("dbo.SP_GetUnreadNotificationCount", p);
            return Ok(new { unreadCount = result?.UnreadCount ?? 0 });
        }

        /// <summary>Marca una notificación propia como leída.</summary>
        /// <param name="id">Identificador único de la notificación.</param>
        /// <returns>204 sin contenido.</returns>
        [HttpPatch("{id:guid}/read")]
        public IActionResult MarkRead(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@UserId", CurrentUserId);
            _repo.Execute("dbo.SP_MarkNotificationRead", p);
            return NoContent();
        }

        /// <summary>Marca todas las notificaciones propias como leídas.</summary>
        /// <returns>204 sin contenido.</returns>
        [HttpPost("read-all")]
        public IActionResult MarkAllRead()
        {
            var p = new DynamicParameters();
            p.Add("@UserId", CurrentUserId);
            _repo.Execute("dbo.SP_MarkAllNotificationsRead", p);
            return NoContent();
        }

        /// <summary>Descarta (elimina) una notificación propia.</summary>
        /// <param name="id">Identificador único de la notificación.</param>
        /// <returns>204 sin contenido.</returns>
        [HttpDelete("{id:guid}")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@UserId", CurrentUserId);
            _repo.Execute("dbo.SP_DeleteNotification", p);
            return NoContent();
        }
    }
}
