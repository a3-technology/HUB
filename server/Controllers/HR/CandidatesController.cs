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
    /// Controlador del módulo Recursos Humanos — Reclutamiento: Candidatos.
    /// Expone operaciones CRUD, cambio de estado y gestión del currículum
    /// (almacenado en Azure Blob Storage, contenedor a3hub).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/candidates")]
    [Authorize(Policy = "hr")]
    public class CandidatesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Extensiones de CV aceptadas y tamaño máximo (10 MB).</summary>
        private static readonly string[] AllowedResumeExtensions = [".pdf", ".doc", ".docx"];
        private const long MaxResumeSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public CandidatesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de candidatos con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.CandidateResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.CandidateResponse>("hr.SP_GetCandidates", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un candidato por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del candidato.</param>
        /// <returns>200 con <see cref="HR.CandidateResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.CandidateResponse>("hr.SP_GetCandidateById", p);
            if (result is null)
                return NotFound(new { message = "Candidato no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo candidato validando unicidad del correo.
        /// </summary>
        /// <param name="request">Datos del candidato.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.candidates.create", "Crear candidatos")]
        public IActionResult Insert([FromBody] HR.CandidateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@FirstName", request.FirstName.Trim());
            p.Add("@LastName",  request.LastName.Trim());
            p.Add("@Email",     request.Email.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@ResumeUrl", request.ResumeUrl?.Trim());
            p.Add("@Source",    request.Source?.Trim());
            p.Add("@Notes",     request.Notes?.Trim());

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_InsertCandidate", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el candidato." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un candidato existente.
        /// Valida unicidad del correo excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del candidato a actualizar.</param>
        /// <param name="request">Nuevos datos del candidato.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.candidates.update", "Editar candidatos")]
        public IActionResult Update(Guid id, [FromBody] HR.CandidateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",        id);
            p.Add("@FirstName", request.FirstName.Trim());
            p.Add("@LastName",  request.LastName.Trim());
            p.Add("@Email",     request.Email.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@ResumeUrl", request.ResumeUrl?.Trim());
            p.Add("@Source",    request.Source?.Trim());
            p.Add("@Notes",     request.Notes?.Trim());

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_UpdateCandidate", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el candidato." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un candidato (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del candidato.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.candidates.toggle", "Activar/desactivar candidatos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_ToggleCandidateStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del candidato." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un candidato.
        /// No se permite si tiene postulaciones asociadas.
        /// </summary>
        /// <param name="id">Identificador único del candidato.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 400 si no existe o tiene postulaciones.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.candidates.delete", "Eliminar candidatos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_DeleteCandidate", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el candidato." });

            return Ok(result);
        }

        // ── Currículum (Azure Blob Storage) ──────────────────────────────────

        /// <summary>
        /// Sube o reemplaza el currículum de un candidato.
        /// El archivo se guarda en el contenedor a3hub bajo la convención
        /// hr/candidates/{id}/cv/{archivo} y la ruta queda registrada en ResumeUrl.
        /// </summary>
        /// <param name="id">Identificador único del candidato.</param>
        /// <param name="file">Archivo PDF, DOC o DOCX de máximo 10 MB.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/resume")]
        [RequirePermission("hr.candidates.resume-upload", "Subir currículum de candidatos")]
        public async Task<IActionResult> UploadResume(Guid id, IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo del currículum." });

            if (file.Length > MaxResumeSizeBytes)
                return BadRequest(new { message = "El currículum no puede superar 10 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedResumeExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, DOC y DOCX." });

            var candidate = GetCandidate(id);
            if (candidate is null)
                return NotFound(new { message = "Candidato no encontrado." });

            // Si ya tenía un CV en el contenedor, se elimina para no dejar huérfanos
            if (IsBlobPath(candidate.ResumeUrl))
                await _storage.DeleteAsync(candidate.ResumeUrl!);

            // Nombre saneado: solo letras, números, punto, guion y guion bajo
            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;

            var blobPath = BlobPaths.CandidateResume(id, safeName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@Id", id);
            p.Add("@ResumeUrl", blobPath);

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_UpdateCandidateResume", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar el currículum." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar el currículum del
        /// candidato; la URL fuerza la descarga con el nombre del archivo.
        /// Si el campo contiene una URL externa (registro manual), se retorna tal cual.
        /// </summary>
        /// <param name="id">Identificador único del candidato.</param>
        /// <returns>200 con { url } o 404 si el candidato no tiene currículum.</returns>
        [HttpGet("{id:guid}/resume-url")]
        public async Task<IActionResult> GetResumeUrl(Guid id)
        {
            var candidate = GetCandidate(id);
            if (candidate is null)
                return NotFound(new { message = "Candidato no encontrado." });

            if (string.IsNullOrWhiteSpace(candidate.ResumeUrl))
                return NotFound(new { message = "El candidato no tiene currículum registrado." });

            // URL externa registrada manualmente: se usa directo
            if (!IsBlobPath(candidate.ResumeUrl))
                return Ok(new { url = candidate.ResumeUrl });

            if (!await _storage.ExistsAsync(candidate.ResumeUrl!))
                return NotFound(new { message = "El archivo del currículum no se encontró en el almacenamiento." });

            var fileName = Path.GetFileName(candidate.ResumeUrl!);
            var url = await _storage.GetReadUrlAsync(candidate.ResumeUrl!, TimeSpan.FromMinutes(15), fileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina el currículum de un candidato: borra el archivo del contenedor
        /// (si aplica) y limpia la referencia en la base de datos.
        /// </summary>
        /// <param name="id">Identificador único del candidato.</param>
        /// <returns>200 con <see cref="HR.SP_CandidateResult"/> o 404 si no existe.</returns>
        [HttpDelete("{id:guid}/resume")]
        [RequirePermission("hr.candidates.resume-delete", "Eliminar currículum de candidatos")]
        public async Task<IActionResult> DeleteResume(Guid id)
        {
            var candidate = GetCandidate(id);
            if (candidate is null)
                return NotFound(new { message = "Candidato no encontrado." });

            if (IsBlobPath(candidate.ResumeUrl))
                await _storage.DeleteAsync(candidate.ResumeUrl!);

            var p = new DynamicParameters();
            p.Add("@Id", id);
            p.Add("@ResumeUrl", null);

            var result = _repo.Get<HR.SP_CandidateResult>("hr.SP_UpdateCandidateResume", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el currículum." });

            return Ok(result);
        }

        /// <summary>Consulta un candidato por Id (null si no existe).</summary>
        private HR.CandidateResponse? GetCandidate(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);
            return _repo.Get<HR.CandidateResponse>("hr.SP_GetCandidateById", p);
        }

        /// <summary>
        /// Distingue una ruta de blob del contenedor (hr/…) de una URL externa (http…).
        /// </summary>
        private static bool IsBlobPath(string? resumeUrl) =>
            !string.IsNullOrWhiteSpace(resumeUrl) &&
            !resumeUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase);
    }
}
