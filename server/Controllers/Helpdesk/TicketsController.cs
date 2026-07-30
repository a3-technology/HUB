using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;
using System.Text.RegularExpressions;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Tickets.
    /// Expone operaciones CRUD, cambio de estado, eliminación lógica y los
    /// adjuntos del ticket (Azure Blob Storage). Todas las operaciones de
    /// base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/tickets")]
    [Authorize(Policy = "helpdesk")]
    public class TicketsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;
        private readonly INotificationService _notifications;

        /// <summary>Extensiones aceptadas para los adjuntos y tamaño máximo (10 MB).</summary>
        private static readonly string[] AllowedAttachmentExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"];
        private const long MaxAttachmentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio genérico, el almacenamiento de archivos y las notificaciones inyectados.</summary>
        public TicketsController(IGenericRepository repo, IBlobStorageService storage, INotificationService notifications)
        {
            _repo = repo;
            _storage = storage;
            _notifications = notifications;
        }

        /// <summary>Notifica al solicitante del ticket, si su cuenta no es la del agente que hace el cambio.</summary>
        private void NotifyRequester(Helpdesk.TicketResponse ticket, string type, string title, string message)
        {
            var requesterUserId = _notifications.GetUserIdByEmployeeId(ticket.RequesterId);
            if (requesterUserId is not null && requesterUserId != CurrentUserId)
                _notifications.NotifyUser(requesterUserId.Value, type, title, message, "helpdesk-ticket", ticket.Id);
        }

        /// <summary>Notifica a un responsable (actual, nuevo o anterior) de un ticket, si su cuenta no es la del agente que hace el cambio.</summary>
        private void NotifyAssignee(Guid assignedToEmployeeId, Guid ticketId, string type, string title, string message)
        {
            var assignedUserId = _notifications.GetUserIdByEmployeeId(assignedToEmployeeId);
            if (assignedUserId is not null && assignedUserId != CurrentUserId)
                _notifications.NotifyUser(assignedUserId.Value, type, title, message, "helpdesk-ticket", ticketId);
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
        /// true si el usuario en sesión puede ver y reasignar todos los tickets
        /// (rol de supervisor). Sin este permiso, un agente solo ve lo asignado a
        /// él y lo sin asignar, y solo puede tomar/soltar tickets para sí mismo.
        /// </summary>
        private bool HasManageAll =>
            (User.FindFirst("permissions")?.Value ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Contains("helpdesk.tickets.manage-all");

        /// <summary>
        /// Retorna la lista de tickets con filtros opcionales.
        /// </summary>
        /// <param name="requesterId">Filtra por empleado solicitante.</param>
        /// <param name="assignedToId">Filtra por empleado responsable.</param>
        /// <param name="categoryId">Filtra por categoría.</param>
        /// <param name="priorityId">Filtra por prioridad.</param>
        /// <param name="statusId">Filtra por estado.</param>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll(
            [FromQuery] Guid? requesterId = null, [FromQuery] Guid? assignedToId = null,
            [FromQuery] Guid? categoryId = null, [FromQuery] Guid? priorityId = null,
            [FromQuery] Guid? statusId = null, [FromQuery] bool? active = null)
        {
            var hasManageAll = HasManageAll;

            var p = new DynamicParameters();
            p.Add("@RequesterId",      requesterId);
            p.Add("@AssignedToId",     assignedToId);
            p.Add("@CategoryId",       categoryId);
            p.Add("@PriorityId",       priorityId);
            p.Add("@StatusId",         statusId);
            p.Add("@IsActive",         active.HasValue ? (object)active.Value : null);
            p.Add("@ViewerEmployeeId", hasManageAll ? null : CurrentEmployeeId());
            p.Add("@RestrictToOwn",    !hasManageAll);

            var result = _repo.GetAll<Helpdesk.TicketResponse>("hd.SP_GetTickets", p).ToList();

            foreach (var t in result)
            {
                t.RequesterPhotoUrl = await SignPhotoUrl(t.RequesterPhotoUrl);
                t.AssignedToPhotoUrl = await SignPhotoUrl(t.AssignedToPhotoUrl);
            }

            return Ok(result);
        }

        /// <summary>
        /// Retorna un ticket por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.TicketResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = GetTicket(id);
            if (result is null)
                return NotFound(new { message = "Ticket no encontrado." });

            result.RequesterPhotoUrl = await SignPhotoUrl(result.RequesterPhotoUrl);
            result.AssignedToPhotoUrl = await SignPhotoUrl(result.AssignedToPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo ticket en estado Abierto.
        /// </summary>
        /// <param name="request">Datos del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("helpdesk.tickets.create", "Crear tickets")]
        public IActionResult Insert([FromBody] Helpdesk.TicketRequest request)
        {
            // Asignar directamente a otro agente al crear el ticket es una acción de
            // supervisor (helpdesk.tickets.manage-all); cualquier otro agente solo
            // puede dejarlo sin asignar o asignárselo a sí mismo.
            if (request.AssignedToId is not null && request.AssignedToId != CurrentEmployeeId() && !HasManageAll)
                return BadRequest(new { message = "No tienes permiso para asignar este ticket a otro responsable." });

            var p = new DynamicParameters();
            p.Add("@Subject",      request.Subject.Trim());
            p.Add("@Description",  request.Description?.Trim());
            p.Add("@RequesterId",  request.RequesterId);
            p.Add("@CategoryId",   request.CategoryId);
            p.Add("@PriorityId",   request.PriorityId);
            p.Add("@AssignedToId", request.AssignedToId);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_InsertTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el ticket." });

            if (result.Id is not null)
            {
                var created = GetTicket(result.Id.Value);
                if (created is not null)
                {
                    // Avisa al solicitante si un agente/administrador le creó el ticket en su nombre.
                    NotifyRequester(created, "helpdesk.ticket-created-for-you", "Se creó un ticket a tu nombre",
                        $"{created.Code} · {created.Subject}");

                    // Si quedó asignado desde la creación, avisa también al responsable.
                    if (request.AssignedToId is not null)
                        NotifyAssignee(request.AssignedToId.Value, result.Id.Value, "helpdesk.ticket-assigned-to-you", "Se te asignó un ticket nuevo",
                            $"{created.Code} · {created.Subject}");
                }
            }

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un ticket existente (no cambia el solicitante, el estado
        /// ni el responsable asignado — ver <see cref="Assign"/> y <see cref="Claim"/>).
        /// </summary>
        /// <param name="id">Identificador único del ticket a actualizar.</param>
        /// <param name="request">Nuevos datos del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("helpdesk.tickets.update", "Editar tickets")]
        public IActionResult Update(Guid id, [FromBody] Helpdesk.TicketUpdateRequest request)
        {
            var before = GetTicket(id);
            if (before is null)
                return NotFound(new { message = "Ticket no encontrado." });

            if (before.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se puede editar." });

            // El contenido del ticket (asunto/descripción/categoría/prioridad) solo lo puede
            // tocar el solicitante — el responsable asignado NO alcanza (a pedido explícito
            // del usuario: un agente asignado puede trabajar el ticket pero no editarlo).
            var contentChanged =
                request.Subject.Trim() != before.Subject ||
                (request.Description?.Trim() ?? "") != (before.Description ?? "") ||
                request.CategoryId != before.CategoryId ||
                request.PriorityId != before.PriorityId;

            if (contentChanged)
            {
                var employeeId = CurrentEmployeeId();
                if (employeeId is null || before.RequesterId != employeeId)
                    return BadRequest(new { message = "Solo el solicitante de este ticket puede editar el asunto, la descripción, la categoría o la prioridad." });
            }

            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Subject",     request.Subject.Trim());
            p.Add("@Description", request.Description?.Trim());
            p.Add("@CategoryId",  request.CategoryId);
            p.Add("@PriorityId",  request.PriorityId);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_UpdateTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el ticket." });

            return Ok(result);
        }

        /// <summary>
        /// Reasigna un ticket a otro agente de soporte. Reservado a quien tenga
        /// helpdesk.tickets.manage-all — para que un agente tome un ticket sin
        /// asignar para sí mismo ver <see cref="Claim"/>. Un ticket nunca queda
        /// sin responsable por esta vía: no existe "desasignar", solo reasignar.
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <param name="request">Nuevo responsable (obligatorio).</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400/404 si hay error.</returns>
        [HttpPatch("{id:guid}/assign")]
        [RequirePermission("helpdesk.tickets.manage-all", "Ver y gestionar todos los tickets (supervisor)")]
        public IActionResult Assign(Guid id, [FromBody] Helpdesk.TicketAssignRequest request)
        {
            if (request.AssignedToId is null)
                return BadRequest(new { message = "Debes elegir un responsable; un ticket no puede quedar sin asignar desde acá." });

            var before = GetTicket(id);
            if (before is null)
                return NotFound(new { message = "Ticket no encontrado." });

            if (before.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se puede reasignar." });

            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@AssignedToId", request.AssignedToId);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_AssignTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al asignar el ticket." });

            if (request.AssignedToId != before.AssignedToId)
            {
                var after = GetTicket(id);
                if (after is not null)
                {
                    // Avisa al solicitante: "asignó" si el ticket no tenía responsable
                    // todavía, "reasignó" si le está cambiando el que ya tenía.
                    var assignTitle = before.AssignedToId is null ? "Se te asignó un asesor" : "Se te reasignó un asesor";
                    NotifyRequester(after, "helpdesk.ticket-assigned", assignTitle,
                        $"{after.AssignedToName} atenderá tu ticket {after.Code}.");

                    // Avisa al nuevo agente que le transfirieron un ticket.
                    NotifyAssignee(request.AssignedToId.Value, id, "helpdesk.ticket-assigned-to-you", "Se te ha transferido un ticket",
                        $"{after.Code} · {after.Subject}");

                    // Avisa al agente anterior que le revocaron el ticket. Al hacer clic no verá el
                    // detalle (hd.SP_GetTickets ya no lo incluye en su lista sin manage-all, al no
                    // ser el nuevo responsable), pero sí dispara el refresco de su tabla.
                    if (before.AssignedToId is not null)
                        NotifyAssignee(before.AssignedToId.Value, id, "helpdesk.ticket-unassigned", "Se te revocó un ticket",
                            $"{after.Code} · {after.Subject} ahora lo atiende {after.AssignedToName}.");
                }
            }

            return Ok(result);
        }

        /// <summary>
        /// Permite que un agente tome para sí mismo un ticket sin asignar — no
        /// requiere helpdesk.tickets.manage-all. Una vez tomado, el propio agente
        /// no puede soltarlo: si hay que cambiar de responsable lo hace un
        /// supervisor con <see cref="Assign"/>, nunca queda sin nadie.
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400/404 si hay error.</returns>
        [HttpPatch("{id:guid}/claim")]
        [RequirePermission("helpdesk.tickets.update", "Editar tickets")]
        public IActionResult Claim(Guid id)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null)
                return BadRequest(new { message = "Tu usuario no está vinculado a un empleado." });

            var before = GetTicket(id);
            if (before is null)
                return NotFound(new { message = "Ticket no encontrado." });

            if (before.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se puede tomar." });

            var p = new DynamicParameters();
            p.Add("@Id",         id);
            p.Add("@EmployeeId", employeeId);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_ClaimTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al tomar el ticket." });

            var after = GetTicket(id);
            if (after is not null)
                NotifyRequester(after, "helpdesk.ticket-assigned", "Se te asignó un asesor",
                    $"{after.AssignedToName} atenderá tu ticket {after.Code}.");

            return Ok(result);
        }

        /// <summary>
        /// Retorna los empleados que pueden ser responsables de un ticket (cualquier
        /// usuario activo con el módulo Helpdesk), para el combo de asignación.
        /// </summary>
        /// <returns>200 con la lista de <see cref="Helpdesk.AgentResponse"/>.</returns>
        [HttpGet("agents")]
        public IActionResult GetAgents()
        {
            return Ok(_repo.GetAll<Helpdesk.AgentResponse>("hd.SP_GetHelpdeskAgents", new DynamicParameters()));
        }

        /// <summary>
        /// Cambia el estado de un ticket (Open, InProgress, Resolved, Closed).
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <param name="request">Nuevo estado.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/status")]
        [RequirePermission("helpdesk.tickets.change-status", "Cambiar estado de tickets")]
        public IActionResult ChangeStatus(Guid id, [FromBody] Helpdesk.TicketStatusChangeRequest request)
        {
            var before = GetTicket(id);
            if (before is null)
                return NotFound(new { message = "Ticket no encontrado." });

            // El permiso helpdesk.tickets.change-status no alcanza: sin manage-all, solo
            // el responsable ASIGNADO ACTUAL puede cambiar el estado — evita que un agente
            // al que le acaban de revocar el ticket (con la tabla todavía sin refrescar en
            // su pantalla) siga operando sobre un ticket que ya no es suyo.
            if (!HasManageAll && before.AssignedToId != CurrentEmployeeId())
                return BadRequest(new { message = "Ya no sos el responsable de este ticket; no podés cambiar su estado." });

            var p = new DynamicParameters();
            p.Add("@Id",         id);
            p.Add("@StatusId",   request.StatusId);
            p.Add("@Resolution", request.Resolution?.Trim());

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_ChangeTicketStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del ticket." });

            // Primera respuesta de SLA: si el agente asignado actúa sobre el ticket (ej. lo
            // pasa a "En progreso") sin haber comentado antes, eso también cuenta como
            // primera respuesta — no solo un comentario.
            if (before.FirstRespondedAt is null && before.AssignedToId is not null && before.AssignedToId == CurrentEmployeeId())
            {
                var markP = new DynamicParameters();
                markP.Add("@Id", id);
                _repo.Execute("hd.SP_MarkTicketFirstResponse", markP);
            }

            var ticket = GetTicket(id);
            if (ticket is not null)
            {
                NotifyRequester(ticket, "helpdesk.ticket-status-changed", "Actualización de tu ticket",
                    $"Tu ticket {ticket.Code} cambió a {ticket.Status}.");
            }

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un ticket (sus comentarios y adjuntos se eliminan en cascada).
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("helpdesk.tickets.delete", "Eliminar tickets")]
        public IActionResult Delete(Guid id)
        {
            var before = GetTicket(id);
            if (before is not null && before.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se puede eliminar." });

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_TicketResult>("hd.SP_DeleteTicket", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el ticket." });

            _notifications.DeleteNotificationsForEntity("helpdesk-ticket", id);

            return Ok(result);
        }

        // ── Adjuntos de ticket ────────────────────────────────────────────────

        /// <summary>Retorna los adjuntos de un ticket, del más reciente al más antiguo.</summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketAttachmentResponse"/>.</returns>
        [HttpGet("{id:guid}/attachments")]
        public IActionResult GetAttachments(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@TicketId", id);

            var result = _repo.GetAll<Helpdesk.TicketAttachmentResponse>("hd.SP_GetTicketAttachments", p);
            return Ok(result);
        }

        /// <summary>
        /// Sube un archivo adjunto a un ticket. Se guarda en el contenedor a3hub bajo
        /// la convención hd/tickets/{id}/attachments/{archivo} y se registra en hd.TicketAttachments.
        /// </summary>
        /// <param name="id">Identificador único del ticket.</param>
        /// <param name="file">Archivo de máximo 10 MB (PDF, Office, imágenes o ZIP).</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketAttachmentResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/attachments")]
        [RequirePermission("helpdesk.tickets.attachment-upload", "Subir adjuntos de tickets")]
        public async Task<IActionResult> UploadAttachment(Guid id, IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo a adjuntar." });

            if (file.Length > MaxAttachmentSizeBytes)
                return BadRequest(new { message = "El archivo no puede superar 10 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedAttachmentExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, Word, Excel, JPG, PNG, WEBP y ZIP." });

            var ticket = GetTicket(id);
            if (ticket is null)
                return NotFound(new { message = "Ticket no encontrado." });

            if (ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden agregar adjuntos." });

            var employeeId = CurrentEmployeeId();
            if (employeeId is null || ticket.RequesterId != employeeId)
                return BadRequest(new { message = "Solo el solicitante de este ticket puede agregarle adjuntos." });

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
        /// Retorna una URL temporal (15 minutos) para descargar un adjunto de ticket,
        /// forzando la descarga con el nombre original del archivo.
        /// </summary>
        /// <param name="attachmentId">Identificador único del adjunto.</param>
        /// <returns>200 con { url } o 404 si el adjunto no existe.</returns>
        [HttpGet("attachments/{attachmentId:guid}/url")]
        public async Task<IActionResult> GetAttachmentUrl(Guid attachmentId)
        {
            var attachment = GetAttachment(attachmentId);
            if (attachment is null)
                return NotFound(new { message = "Adjunto no encontrado." });

            if (!await _storage.ExistsAsync(attachment.BlobPath))
                return NotFound(new { message = "El archivo no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(attachment.BlobPath, TimeSpan.FromMinutes(15), attachment.FileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina un adjunto de ticket: borra el archivo del contenedor y el registro en la base de datos.
        /// </summary>
        /// <param name="attachmentId">Identificador único del adjunto.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketAttachmentResult"/> o 404 si no existe.</returns>
        [HttpDelete("attachments/{attachmentId:guid}")]
        [RequirePermission("helpdesk.tickets.attachment-delete", "Eliminar adjuntos de tickets")]
        public async Task<IActionResult> DeleteAttachment(Guid attachmentId)
        {
            var attachment = GetAttachment(attachmentId);
            if (attachment is null)
                return NotFound(new { message = "Adjunto no encontrado." });

            var ticket = GetTicket(attachment.TicketId);
            if (ticket is not null && ticket.StatusIsFinal)
                return BadRequest(new { message = "El ticket ya está cerrado; no se pueden eliminar sus adjuntos." });

            // El permiso helpdesk.tickets.attachment-delete no alcanza: la UI ya solo
            // muestra el botón a quien subió el archivo (ver TicketAttachments.tsx), pero
            // eso no protegía el endpoint — sin este chequeo, cualquiera con el permiso
            // podía borrar el adjunto de OTRO usuario en cualquier ticket llamando la API
            // directamente.
            if (attachment.UploadedByUserId != CurrentUserId)
                return BadRequest(new { message = "Solo quien subió este adjunto puede eliminarlo." });

            await _storage.DeleteAsync(attachment.BlobPath);

            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);

            var result = _repo.Get<Helpdesk.SP_TicketAttachmentResult>("hd.SP_DeleteTicketAttachment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el adjunto." });

            return Ok(result);
        }

        /// <summary>Consulta un ticket por Id (null si no existe).</summary>
        private Helpdesk.TicketResponse? GetTicket(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);
            return _repo.Get<Helpdesk.TicketResponse>("hd.SP_GetTicketById", p);
        }

        /// <summary>Consulta un adjunto de ticket por Id (null si no existe).</summary>
        private Helpdesk.TicketAttachmentResponse? GetAttachment(Guid attachmentId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);
            return _repo.Get<Helpdesk.TicketAttachmentResponse>("hd.SP_GetTicketAttachmentById", p);
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto de un empleado en una URL firmada
        /// temporal (60 minutos). Retorna null si no tiene foto.
        /// </summary>
        private async Task<string?> SignPhotoUrl(string? photoPath)
        {
            if (string.IsNullOrWhiteSpace(photoPath))
                return null;

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return url.ToString();
        }
    }
}
