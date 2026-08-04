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
    /// Controlador del módulo CRM — Notas de Empresa.
    /// Bitácora de notas por empresa, cada una con archivo adjunto opcional
    /// (Azure Blob Storage) subido en el mismo envío. Solo el autor puede
    /// eliminar sus propias notas.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/companies/notes")]
    [Authorize(Policy = "crm")]
    public class CompanyNotesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        private static readonly string[] AllowedAttachmentExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"];
        private const long MaxAttachmentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public CompanyNotesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna las notas de una empresa, de la más reciente a la más antigua,
        /// con URL firmada del adjunto (si tiene) para poder mostrarlo/descargarlo.
        /// </summary>
        /// <param name="companyId">Identificador único de la empresa.</param>
        /// <returns>200 con la lista de <see cref="CRM.CompanyNoteResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetByCompany([FromQuery] Guid? companyId)
        {
            if (companyId is null)
                return BadRequest(new { message = "Debes indicar companyId." });

            var p = new DynamicParameters();
            p.Add("@CompanyId", companyId);

            var result = _repo.GetAll<CRM.CompanyNoteResponse>("crm.SP_GetCompanyNotes", p).ToList();
            return Ok(result);
        }

        /// <summary>
        /// Agrega una nota a una empresa, con archivo adjunto opcional en el mismo envío.
        /// Requiere al menos texto o archivo.
        /// </summary>
        /// <param name="companyId">Identificador único de la empresa.</param>
        /// <param name="text">Texto de la nota (opcional si se adjunta un archivo).</param>
        /// <param name="file">Archivo de máximo 10 MB (PDF, Office, imágenes o ZIP), opcional.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyNoteResult"/> o 400 si hay error.</returns>
        [HttpPost("{companyId:guid}")]
        [RequirePermission("crm.companies.note-create", "Agregar notas a empresas")]
        public async Task<IActionResult> Insert(Guid companyId, [FromForm] string? text, IFormFile? file)
        {
            if (string.IsNullOrWhiteSpace(text) && (file is null || file.Length == 0))
                return BadRequest(new { message = "La nota debe tener texto o un archivo adjunto." });

            string? blobPath = null;
            string? fileName = null;
            long? fileSize = null;

            if (file is not null && file.Length > 0)
            {
                if (file.Length > MaxAttachmentSizeBytes)
                    return BadRequest(new { message = "El archivo no puede superar 10 MB." });

                var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!AllowedAttachmentExtensions.Contains(extension))
                    return BadRequest(new { message = "Formato no válido. Se aceptan PDF, Word, Excel, JPG, PNG, WEBP y ZIP." });

                var baseName = Path.GetFileNameWithoutExtension(file.FileName);
                var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
                var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

                blobPath = BlobPaths.CompanyNoteAttachment(companyId, blobName);
                await using (var stream = file.OpenReadStream())
                    await _storage.UploadAsync(blobPath, stream, file.ContentType);

                fileName = file.FileName;
                fileSize = file.Length;
            }

            var p = new DynamicParameters();
            p.Add("@CompanyId", companyId);
            p.Add("@UserId",    CurrentUserId);
            p.Add("@Text",      text?.Trim());
            p.Add("@FileName",  fileName);
            p.Add("@BlobPath",  blobPath);
            p.Add("@FileSize",  fileSize);

            var result = _repo.Get<CRM.SP_CompanyNoteResult>("crm.SP_InsertCompanyNote", p);

            if (result is null || result.Success == 0)
            {
                if (blobPath is not null)
                    await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al agregar la nota." });
            }

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar el adjunto de una nota,
        /// forzando la descarga con el nombre original del archivo.
        /// </summary>
        /// <param name="id">Identificador único de la nota.</param>
        /// <returns>200 con { url } o 404 si la nota o el adjunto no existen.</returns>
        [HttpGet("{id:guid}/url")]
        public async Task<IActionResult> GetAttachmentUrl(Guid id)
        {
            var note = _repo.Get<CRM.CompanyNoteResponse>("crm.SP_GetCompanyNoteById", new DynamicParameters(new { Id = id }));
            if (note is null || string.IsNullOrWhiteSpace(note.BlobPath))
                return NotFound(new { message = "Adjunto no encontrado." });

            if (!await _storage.ExistsAsync(note.BlobPath))
                return NotFound(new { message = "El archivo no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(note.BlobPath, TimeSpan.FromMinutes(15), note.FileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina una nota de empresa (y su adjunto, si tiene). Solo el autor puede eliminarla.
        /// </summary>
        /// <param name="id">Identificador único de la nota.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyNoteResult"/> o 400 si no existe o no es el autor.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.companies.note-delete", "Eliminar notas de empresas")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var note = _repo.Get<CRM.CompanyNoteResponse>("crm.SP_GetCompanyNoteById", new DynamicParameters(new { Id = id }));

            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@UserId", CurrentUserId);

            var result = _repo.Get<CRM.SP_CompanyNoteResult>("crm.SP_DeleteCompanyNote", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la nota." });

            if (note is not null && !string.IsNullOrWhiteSpace(note.BlobPath))
                await _storage.DeleteAsync(note.BlobPath);

            return Ok(result);
        }
    }
}
