using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Services;
using shared.Models;
using shared.Repositories;
using System.Text.RegularExpressions;

namespace server.Controllers
{
    /// <summary>
    /// Autoservicio de Helpdesk: permite a CUALQUIER usuario autenticado reportar
    /// un ticket para sí mismo y ver sus propios tickets, sin necesidad de tener
    /// asignado el módulo Helpdesk (a diferencia de <see cref="TicketsController"/>,
    /// reservado a quienes gestionan tickets). El solicitante siempre es el empleado
    /// vinculado al usuario en sesión — nunca se recibe de la solicitud.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/self")]
    [Authorize]
    public class SelfServiceController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;
        private readonly INotificationService _notifications;

        /// <summary>Extensiones, tamaño (5 MB) y cantidad máxima de adjuntos por ticket en autoservicio.</summary>
        private static readonly string[] AllowedAttachmentExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"];
        private const long MaxAttachmentSizeBytes = 5 * 1024 * 1024;
        private const int MaxAttachmentsPerTicket = 5;

        /// <summary>Inicializa el controlador con el repositorio genérico, el almacenamiento de archivos y las notificaciones inyectados.</summary>
        public SelfServiceController(IGenericRepository repo, IBlobStorageService storage, INotificationService notifications)
        {
            _repo = repo;
            _storage = storage;
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

        /// <summary>Retorna el ticket solo si pertenece al empleado indicado (null en caso contrario).</summary>
        private Helpdesk.TicketResponse? GetOwnTicket(Guid ticketId, Guid employeeId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", ticketId);
            var ticket = _repo.Get<Helpdesk.TicketResponse>("hd.SP_GetTicketById", p);
            return ticket is not null && ticket.RequesterId == employeeId ? ticket : null;
        }

        /// <summary>Catálogo de categorías activas, para el formulario de autoservicio.</summary>
        /// <returns>200 con la lista de <see cref="Helpdesk.CategoryResponse"/>.</returns>
        [HttpGet("categories")]
        public IActionResult GetCategories()
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", true);
            return Ok(_repo.GetAll<Helpdesk.CategoryResponse>("hd.SP_GetTicketCategories", p));
        }

        /// <summary>Catálogo de prioridades activas, para el formulario de autoservicio.</summary>
        /// <returns>200 con la lista de <see cref="Helpdesk.PriorityResponse"/>.</returns>
        [HttpGet("priorities")]
        public IActionResult GetPriorities()
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", true);
            return Ok(_repo.GetAll<Helpdesk.PriorityResponse>("hd.SP_GetPriorities", p));
        }

        /// <summary>Catálogo de estados de ticket activos, para pintar los chips de "mis tickets".</summary>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketStatusResponse"/>.</returns>
        [HttpGet("statuses")]
        public IActionResult GetStatuses()
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", true);
            return Ok(_repo.GetAll<Helpdesk.TicketStatusResponse>("hd.SP_GetTicketStatuses", p));
        }

        /// <summary>
        /// Retorna los tickets reportados por el propio usuario, del más reciente al más antiguo.
        /// </summary>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketResponse"/> (vacía si no tiene empleado vinculado).</returns>
        [HttpGet("tickets")]
        public IActionResult GetMyTickets()
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return Ok(Array.Empty<Helpdesk.TicketResponse>());

            var p = new DynamicParameters();
            p.Add("@RequesterId",  employeeId);
            p.Add("@AssignedToId", null);
            p.Add("@CategoryId",   null);
            p.Add("@PriorityId",   null);
            p.Add("@StatusId",     null);
            p.Add("@IsActive",     true);

            var result = _repo.GetAll<Helpdesk.TicketResponse>("hd.SP_GetTickets", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea un ticket reportado por el propio usuario. El solicitante es siempre el
        /// empleado vinculado a la sesión; queda sin asignar para que el equipo de
        /// soporte lo triage.
        /// </summary>
        /// <param name="request">Asunto, descripción, categoría y prioridad del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/>, o 400 si no hay empleado vinculado o hay error.</returns>
        [HttpPost("tickets")]
        public IActionResult CreateMyTicket([FromBody] Helpdesk.SelfTicketRequest request)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null)
                return BadRequest(new { message = "Tu usuario no está vinculado a un empleado; contacta a un administrador para reportar un ticket." });

            var p = new DynamicParameters();
            p.Add("@Subject",      request.Subject.Trim());
            p.Add("@Description",  request.Description?.Trim());
            p.Add("@RequesterId",  employeeId);
            p.Add("@CategoryId",   request.CategoryId);
            p.Add("@PriorityId",   request.PriorityId);
            p.Add("@AssignedToId", (Guid?)null);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_InsertTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el ticket." });

            // Avisa a todo el equipo de soporte (cualquiera con el módulo Helpdesk) que llegó un ticket nuevo.
            var created = result.Id is not null ? GetOwnTicket(result.Id.Value, employeeId.Value) : null;
            var createdLabel = created is not null ? $"{created.Code} · {created.Subject}" : request.Subject.Trim();
            _notifications.NotifyUsersWithModule(
                "helpdesk", "helpdesk.ticket-created", "Nuevo ticket de soporte",
                createdLabel, "helpdesk-ticket", result.Id);

            return Ok(result);
        }

        /// <summary>
        /// Elimina un ticket propio. Solo se permite mientras no tenga un asesor
        /// asignado, para no interferir con soporte ya en curso.
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/>, o 400/404 si no se puede eliminar o no es propio.</returns>
        [HttpDelete("tickets/{id:guid}")]
        public IActionResult DeleteMyTicket(Guid id)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return NotFound(new { message = "Ticket no encontrado." });

            var ticket = GetOwnTicket(id, employeeId.Value);
            if (ticket is null) return NotFound(new { message = "Ticket no encontrado." });

            if (ticket.AssignedToId is not null)
                return BadRequest(new { message = "No puedes eliminar un ticket que ya tiene un asesor asignado." });

            if (ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se puede eliminar." });

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_DeleteTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el ticket." });

            _notifications.DeleteNotificationsForEntity("helpdesk-ticket", id);

            // Avisa al equipo de soporte que el propio solicitante eliminó el ticket
            // (sin asesor asignado todavía, así que no hay a quién avisar puntualmente).
            _notifications.NotifyUsersWithModule(
                "helpdesk", "helpdesk.ticket-deleted-by-requester", "El solicitante eliminó un ticket",
                $"{ticket.RequesterName} eliminó el ticket {ticket.Code} · {ticket.Subject}.",
                excludeUserId: CurrentUserId);

            return Ok(result);
        }

        // ── Comentarios de mis tickets ────────────────────────────────────────

        /// <summary>Retorna los comentarios de un ticket propio, del más antiguo al más reciente.</summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketCommentResponse"/>, o 404 si el ticket no es propio.</returns>
        [HttpGet("tickets/{id:guid}/comments")]
        public IActionResult GetComments(Guid id)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null || GetOwnTicket(id, employeeId.Value) is null)
                return NotFound(new { message = "Ticket no encontrado." });

            var p = new DynamicParameters();
            p.Add("@TicketId", id);
            return Ok(_repo.GetAll<Helpdesk.TicketCommentResponse>("hd.SP_GetTicketComments", p));
        }

        /// <summary>Agrega un comentario a un ticket propio, con autoría del usuario en sesión.</summary>
        /// <param name="id">Identificador único del ticket comentado.</param>
        /// <param name="request">Texto del comentario.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketCommentResult"/>, o 400/404 si hay error o el ticket no es propio.</returns>
        [HttpPost("tickets/{id:guid}/comments")]
        public IActionResult InsertComment(Guid id, [FromBody] Helpdesk.TicketCommentRequest request)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return NotFound(new { message = "Ticket no encontrado." });
            var ticket = GetOwnTicket(id, employeeId.Value);
            if (ticket is null) return NotFound(new { message = "Ticket no encontrado." });

            if (ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden agregar comentarios." });

            var p = new DynamicParameters();
            p.Add("@TicketId", id);
            p.Add("@UserId",   CurrentUserId);
            p.Add("@Text",     request.Text.Trim());

            var result = _repo.Get<Helpdesk.SP_TicketCommentResult>("hd.SP_InsertTicketComment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al agregar el comentario." });

            // Avisa al asesor asignado; si aún no hay uno, a todo el equipo de soporte.
            var commentLabel = $"{ticket.Code} · {ticket.Subject}";
            if (ticket.AssignedToId is not null)
            {
                var assignedUserId = _notifications.GetUserIdByEmployeeId(ticket.AssignedToId.Value);
                if (assignedUserId is not null)
                    _notifications.NotifyUser(assignedUserId.Value, "helpdesk.ticket-commented", "Nuevo comentario en un ticket",
                        commentLabel, "helpdesk-ticket", id);
            }
            else
            {
                _notifications.NotifyUsersWithModule("helpdesk", "helpdesk.ticket-commented", "Nuevo comentario en un ticket",
                    commentLabel, "helpdesk-ticket", id);
            }

            return Ok(result);
        }

        // ── Adjuntos de mis tickets ───────────────────────────────────────────

        /// <summary>Retorna los adjuntos de un ticket propio, del más reciente al más antiguo.</summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketAttachmentResponse"/>, o 404 si el ticket no es propio.</returns>
        [HttpGet("tickets/{id:guid}/attachments")]
        public IActionResult GetAttachments(Guid id)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null || GetOwnTicket(id, employeeId.Value) is null)
                return NotFound(new { message = "Ticket no encontrado." });

            var p = new DynamicParameters();
            p.Add("@TicketId", id);
            return Ok(_repo.GetAll<Helpdesk.TicketAttachmentResponse>("hd.SP_GetTicketAttachments", p));
        }

        /// <summary>
        /// Sube un archivo adjunto a un ticket propio (máximo 5 por ticket). Se guarda
        /// en el contenedor a3hub bajo la misma convención que usa el equipo de soporte.
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <param name="file">Archivo de máximo 5 MB (PDF, Office, imágenes o ZIP).</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketAttachmentResult"/>, o 400/404 si el archivo no es válido, ya alcanzó el máximo o el ticket no es propio.</returns>
        [HttpPost("tickets/{id:guid}/attachments")]
        public async Task<IActionResult> UploadAttachment(Guid id, IFormFile file)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return NotFound(new { message = "Ticket no encontrado." });
            var ticket = GetOwnTicket(id, employeeId.Value);
            if (ticket is null) return NotFound(new { message = "Ticket no encontrado." });

            if (ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden agregar adjuntos." });

            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo a adjuntar." });

            if (file.Length > MaxAttachmentSizeBytes)
                return BadRequest(new { message = "El archivo no puede superar 5 MB." });

            var countP = new DynamicParameters();
            countP.Add("@TicketId", id);
            var existingCount = _repo.GetAll<Helpdesk.TicketAttachmentResponse>("hd.SP_GetTicketAttachments", countP).Count;
            if (existingCount >= MaxAttachmentsPerTicket)
                return BadRequest(new { message = $"Un ticket admite máximo {MaxAttachmentsPerTicket} adjuntos." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedAttachmentExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, Word, Excel, JPG, PNG, WEBP y ZIP." });

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
            var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

            var blobPath = BlobPaths.TicketAttachment(id, blobName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@TicketId",         id);
            p.Add("@FileName",         file.FileName);
            p.Add("@BlobPath",         blobPath);
            p.Add("@FileSize",         file.Length);
            p.Add("@UploadedByUserId", CurrentUserId);

            var result = _repo.Get<Helpdesk.SP_TicketAttachmentResult>("hd.SP_InsertTicketAttachment", p);

            if (result is null || result.Success == 0)
            {
                await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al adjuntar el archivo." });
            }

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar un adjunto de un ticket propio.
        /// </summary>
        /// <param name="attachmentId">Identificador único del adjunto.</param>
        /// <returns>200 con { url }, o 404 si el adjunto no existe o no es propio.</returns>
        [HttpGet("attachments/{attachmentId:guid}/url")]
        public async Task<IActionResult> GetAttachmentUrl(Guid attachmentId)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return NotFound(new { message = "Adjunto no encontrado." });

            var attachment = GetOwnAttachment(attachmentId, employeeId.Value);
            if (attachment is null)
                return NotFound(new { message = "Adjunto no encontrado." });

            if (!await _storage.ExistsAsync(attachment.BlobPath))
                return NotFound(new { message = "El archivo no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(attachment.BlobPath, TimeSpan.FromMinutes(15), attachment.FileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>Elimina un adjunto de un ticket propio: borra el archivo y el registro.</summary>
        /// <param name="attachmentId">Identificador único del adjunto.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketAttachmentResult"/>, o 404 si no existe o no es propio.</returns>
        [HttpDelete("attachments/{attachmentId:guid}")]
        public async Task<IActionResult> DeleteAttachment(Guid attachmentId)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null) return NotFound(new { message = "Adjunto no encontrado." });

            var attachment = GetOwnAttachment(attachmentId, employeeId.Value);
            if (attachment is null)
                return NotFound(new { message = "Adjunto no encontrado." });

            var ticket = GetOwnTicket(attachment.TicketId, employeeId.Value);
            if (ticket is not null && ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden eliminar sus adjuntos." });

            await _storage.DeleteAsync(attachment.BlobPath);

            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);

            var result = _repo.Get<Helpdesk.SP_TicketAttachmentResult>("hd.SP_DeleteTicketAttachment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el adjunto." });

            return Ok(result);
        }

        /// <summary>Retorna el adjunto solo si su ticket pertenece al empleado indicado.</summary>
        private Helpdesk.TicketAttachmentResponse? GetOwnAttachment(Guid attachmentId, Guid employeeId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);
            var attachment = _repo.Get<Helpdesk.TicketAttachmentResponse>("hd.SP_GetTicketAttachmentById", p);
            if (attachment is null || GetOwnTicket(attachment.TicketId, employeeId) is null)
                return null;
            return attachment;
        }
    }
}
