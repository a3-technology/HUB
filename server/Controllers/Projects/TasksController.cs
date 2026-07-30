using System.Text.RegularExpressions;
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
    /// Controlador del módulo Gestión de Proyectos — Tareas.
    /// Expone operaciones CRUD, cambio de estado, la consulta de cronograma y los
    /// adjuntos (Azure Blob Storage) de las tareas asociadas a un proyecto.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects/tasks")]
    [Authorize(Policy = "projects")]
    public class TasksController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        private static readonly string[] AllowedAttachmentExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"];
        private const long MaxAttachmentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public TasksController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna la lista de tareas con filtros opcionales por proyecto, estado activo, estado de flujo,
        /// y "solo mis tareas" (asignadas al empleado vinculado al usuario autenticado).
        /// </summary>
        /// <param name="projectId">Filtra las tareas de un proyecto específico.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <param name="status">Filtra por estado de flujo (Pending, InProgress, Blocked, Completed).</param>
        /// <param name="mine">true = solo las tareas asignadas al usuario autenticado.</param>
        /// <returns>200 con la lista de <see cref="Projects.TaskResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? projectId = null, [FromQuery] bool? active = null, [FromQuery] string? status = null, [FromQuery] bool mine = false)
        {
            var p = new DynamicParameters();
            p.Add("@ProjectId", projectId);
            p.Add("@IsActive",  active.HasValue ? (object)active.Value : null);
            p.Add("@Status",    status);
            p.Add("@ForUserId", mine ? CurrentUserId : (object?)null);

            var result = _repo.GetAll<Projects.TaskResponse>("pm.SP_GetTasks", p).ToList();

            foreach (var t in result)
                t.AssignedToPhotoUrl = await SignPhotoUrl(t.AssignedToPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna las tareas con fechas definidas para pintar el Gantt del Cronograma.
        /// </summary>
        /// <param name="projectId">Filtra el cronograma de un proyecto específico (opcional).</param>
        /// <returns>200 con la lista de <see cref="Projects.ScheduleItemResponse"/>.</returns>
        [HttpGet("schedule")]
        public IActionResult GetSchedule([FromQuery] Guid? projectId = null)
        {
            var p = new DynamicParameters();
            p.Add("@ProjectId", projectId);

            var result = _repo.GetAll<Projects.ScheduleItemResponse>("pm.SP_GetProjectSchedule", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una tarea por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la tarea.</param>
        /// <returns>200 con <see cref="Projects.TaskResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.TaskResponse>("pm.SP_GetTaskById", p);
            if (result is null)
                return NotFound(new { message = "Tarea no encontrada." });

            result.AssignedToPhotoUrl = await SignPhotoUrl(result.AssignedToPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva tarea asociada a un proyecto.
        /// </summary>
        /// <param name="request">Datos de la tarea.</param>
        /// <returns>200 con <see cref="Projects.SP_TaskResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("projects.tasks.create", "Crear tareas")]
        public IActionResult Insert([FromBody] Projects.TaskRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ProjectId",       request.ProjectId);
            p.Add("@Name",            request.Name.Trim());
            p.Add("@Description",     request.Description?.Trim());
            p.Add("@AssignedToId",    request.AssignedToId);
            p.Add("@StartDate",       request.StartDate);
            p.Add("@DueDate",         request.DueDate);
            p.Add("@Status",          request.Status);
            p.Add("@Priority",        request.Priority);
            p.Add("@ProgressPercent", request.ProgressPercent);

            var result = _repo.Get<Projects.SP_TaskResult>("pm.SP_InsertTask", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la tarea." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una tarea existente (incluye mover fechas desde el Gantt de Cronograma).
        /// </summary>
        /// <param name="id">Identificador único de la tarea a actualizar.</param>
        /// <param name="request">Nuevos datos de la tarea.</param>
        /// <returns>200 con <see cref="Projects.SP_TaskResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("projects.tasks.update", "Editar tareas")]
        public IActionResult Update(Guid id, [FromBody] Projects.TaskRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",              id);
            p.Add("@ProjectId",       request.ProjectId);
            p.Add("@Name",            request.Name.Trim());
            p.Add("@Description",     request.Description?.Trim());
            p.Add("@AssignedToId",    request.AssignedToId);
            p.Add("@StartDate",       request.StartDate);
            p.Add("@DueDate",         request.DueDate);
            p.Add("@Status",          request.Status);
            p.Add("@Priority",        request.Priority);
            p.Add("@ProgressPercent", request.ProgressPercent);

            var result = _repo.Get<Projects.SP_TaskResult>("pm.SP_UpdateTask", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la tarea." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una tarea (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la tarea.</param>
        /// <returns>200 con <see cref="Projects.SP_TaskResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("projects.tasks.toggle", "Activar/desactivar tareas")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.SP_TaskResult>("pm.SP_ToggleTaskStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la tarea." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una tarea.
        /// </summary>
        /// <param name="id">Identificador único de la tarea.</param>
        /// <returns>200 con <see cref="Projects.SP_TaskResult"/> o 400 si no existe.</returns>
        /// <returns>200 con <see cref="Projects.SP_TaskResult"/> o 400 si hay error.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.tasks.delete", "Eliminar tareas")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var attachmentsParams = new DynamicParameters();
            attachmentsParams.Add("@TaskId", id);
            var attachments = _repo.GetAll<Projects.AttachmentResponse>("pm.SP_GetTaskAttachments", attachmentsParams);

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.SP_TaskResult>("pm.SP_DeleteTask", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la tarea." });

            // El SP ya limpió las filas de adjuntos; solo falta borrar los archivos del contenedor.
            foreach (var att in attachments)
                await _storage.DeleteAsync(att.BlobPath);

            return Ok(result);
        }

        // ── Adjuntos (Azure Blob Storage) ────────────────────────────────────────

        /// <summary>
        /// Retorna los adjuntos de una tarea, del más reciente al más antiguo.
        /// </summary>
        /// <param name="id">Identificador único de la tarea.</param>
        /// <returns>200 con la lista de <see cref="Projects.AttachmentResponse"/>.</returns>
        [HttpGet("{id:guid}/attachments")]
        public IActionResult GetAttachments(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@TaskId", id);

            var result = _repo.GetAll<Projects.AttachmentResponse>("pm.SP_GetTaskAttachments", p);
            return Ok(result);
        }

        /// <summary>
        /// Sube un archivo adjunto a una tarea. Se guarda en el contenedor a3hub bajo
        /// la convención pm/tasks/{id}/attachments/{archivo} y se registra en pm.TaskAttachments.
        /// </summary>
        /// <param name="id">Identificador único de la tarea.</param>
        /// <param name="file">Archivo de máximo 10 MB (PDF, Office, imágenes o ZIP).</param>
        /// <returns>200 con <see cref="Projects.SP_AttachmentResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/attachments")]
        [RequirePermission("projects.tasks.attachment-upload", "Adjuntar archivos a tareas")]
        public async Task<IActionResult> UploadAttachment(Guid id, IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo a adjuntar." });

            if (file.Length > MaxAttachmentSizeBytes)
                return BadRequest(new { message = "El archivo no puede superar 10 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedAttachmentExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, Word, Excel, JPG, PNG, WEBP y ZIP." });

            var task = _repo.Get<Projects.TaskResponse>("pm.SP_GetTaskById", new DynamicParameters(new { Id = id }));
            if (task is null)
                return NotFound(new { message = "Tarea no encontrada." });

            // Nombre saneado + prefijo único para permitir varios adjuntos con el mismo nombre de archivo
            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
            var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

            var blobPath = BlobPaths.TaskAttachment(id, blobName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@TaskId",           id);
            p.Add("@FileName",         file.FileName);
            p.Add("@BlobPath",         blobPath);
            p.Add("@FileSize",         file.Length);
            p.Add("@UploadedByUserId", CurrentUserId);

            var result = _repo.Get<Projects.SP_AttachmentResult>("pm.SP_InsertTaskAttachment", p);

            if (result is null || result.Success == 0)
            {
                // Si el registro falla, el blob se elimina para no dejar huérfanos
                await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al adjuntar el archivo." });
            }

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar un adjunto de tarea,
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
        /// Elimina un adjunto de tarea: borra el archivo del contenedor y el registro en la base de datos.
        /// </summary>
        /// <param name="attachmentId">Identificador único del adjunto.</param>
        /// <returns>200 con <see cref="Projects.SP_AttachmentResult"/> o 404 si no existe.</returns>
        [HttpDelete("attachments/{attachmentId:guid}")]
        [RequirePermission("projects.tasks.attachment-delete", "Eliminar adjuntos de tareas")]
        public async Task<IActionResult> DeleteAttachment(Guid attachmentId)
        {
            var attachment = GetAttachment(attachmentId);
            if (attachment is null)
                return NotFound(new { message = "Adjunto no encontrado." });

            await _storage.DeleteAsync(attachment.BlobPath);

            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);

            var result = _repo.Get<Projects.SP_AttachmentResult>("pm.SP_DeleteTaskAttachment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el adjunto." });

            return Ok(result);
        }

        /// <summary>Consulta un adjunto de tarea por Id (null si no existe).</summary>
        private Projects.AttachmentResponse? GetAttachment(Guid attachmentId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", attachmentId);
            return _repo.Get<Projects.AttachmentResponse>("pm.SP_GetTaskAttachmentById", p);
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto del empleado asignado en una URL firmada
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
