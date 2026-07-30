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
    /// Controlador del módulo Recursos Humanos — Reclutamiento: Postulaciones.
    /// Expone operaciones para registrar postulaciones de candidatos a vacantes
    /// y gestionar la etapa del proceso de selección (pipeline).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/applications")]
    [Authorize(Policy = "hr")]
    public class ApplicationsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public ApplicationsController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de postulaciones con filtros opcionales por vacante y etapa.
        /// </summary>
        /// <param name="vacancyId">Filtro opcional por vacante.</param>
        /// <param name="stage">Applied | Screening | Interview | Offer | Hired | Rejected | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="HR.ApplicationResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] Guid? vacancyId = null, [FromQuery] string? stage = null)
        {
            var p = new DynamicParameters();
            p.Add("@VacancyId", vacancyId);
            p.Add("@Stage",     string.IsNullOrWhiteSpace(stage) ? null : stage.Trim());

            var result = _repo.GetAll<HR.ApplicationResponse>("hr.SP_GetApplications", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una postulación por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la postulación.</param>
        /// <returns>200 con <see cref="HR.ApplicationResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.ApplicationResponse>("hr.SP_GetApplicationById", p);
            if (result is null)
                return NotFound(new { message = "Postulación no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna la línea de tiempo de etapas de una postulación,
        /// en orden cronológico ascendente.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la postulación.</param>
        /// <returns>200 con la lista de <see cref="HR.ApplicationStageHistoryResponse"/>.</returns>
        [HttpGet("{id:guid}/history")]
        public IActionResult GetHistory(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@ApplicationId", id);

            var result = _repo.GetAll<HR.ApplicationStageHistoryResponse>("hr.SP_GetApplicationStageHistory", p);
            return Ok(result);
        }

        /// <summary>
        /// Registra la postulación de un candidato a una vacante.
        /// Valida que la vacante esté abierta, que el candidato esté activo
        /// y que no exista una postulación previa a la misma vacante.
        /// </summary>
        /// <param name="request">Vacante, candidato y notas opcionales.</param>
        /// <returns>200 con <see cref="HR.SP_ApplicationResult"/> o 400 si hay error de validación.</returns>
        [HttpPost]
        [RequirePermission("hr.applications.create", "Registrar postulaciones")]
        public IActionResult Insert([FromBody] HR.ApplicationRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@VacancyId",   request.VacancyId);
            p.Add("@CandidateId", request.CandidateId);
            p.Add("@Notes",       request.Notes?.Trim());

            var result = _repo.Get<HR.SP_ApplicationResult>("hr.SP_InsertApplication", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar la postulación." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia la etapa del proceso de selección de una postulación.
        /// La etapa Hired no se asigna por esta vía: usar el endpoint de contratación,
        /// que además crea el registro del empleado.
        /// </summary>
        /// <param name="id">Identificador único de la postulación.</param>
        /// <param name="request">Nueva etapa.</param>
        /// <returns>200 con <see cref="HR.SP_ApplicationResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/stage")]
        [RequirePermission("hr.applications.change-stage", "Cambiar etapa del pipeline de postulaciones")]
        public IActionResult ChangeStage(Guid id, [FromBody] HR.ApplicationStageRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",    id);
            p.Add("@Stage", request.Stage.Trim());

            var result = _repo.Get<HR.SP_ApplicationResult>("hr.SP_ChangeApplicationStage", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar la etapa de la postulación." });

            return Ok(result);
        }

        /// <summary>
        /// Contrata al candidato de una postulación: crea el empleado en hr.Employees
        /// con los datos del candidato y de la vacante, marca la postulación como Hired
        /// y cierra la vacante si se completan sus plazas. Si el candidato tiene
        /// currículum en el contenedor, se copia al expediente del nuevo empleado.
        /// </summary>
        /// <param name="id">Identificador único de la postulación.</param>
        /// <param name="request">Código, identificación, remuneración y fecha del nuevo empleado.</param>
        /// <returns>200 con <see cref="HR.SP_ApplicationResult"/> (Id del empleado creado) o 400 si hay error.</returns>
        [HttpPost("{id:guid}/hire")]
        [RequirePermission("hr.applications.hire", "Convertir postulación en contratación")]
        public async Task<IActionResult> Hire(Guid id, [FromBody] HR.ApplicationHireRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",                   id);
            p.Add("@Code",                 request.Code.Trim());
            p.Add("@IdentificationTypeId", request.IdentificationTypeId);
            p.Add("@IdentificationNumber", request.IdentificationNumber.Trim());
            p.Add("@Salary",               request.Salary);
            p.Add("@CurrencyId",           request.CurrencyId);
            p.Add("@HireDate",             request.HireDate);

            var result = _repo.Get<HR.SP_ApplicationResult>("hr.SP_HireApplication", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al contratar al candidato." });

            // El currículum del candidato pasa a formar parte del expediente del empleado
            if (result.Id.HasValue)
                await CopyResumeToEmployeeFileAsync(id, result.Id.Value);

            return Ok(result);
        }

        /// <summary>
        /// Copia el currículum del candidato de una postulación al expediente del
        /// empleado recién contratado: duplica el archivo del contenedor bajo
        /// hr/employees/{id}/docs/ y lo registra en hr.EmployeeDocuments con el
        /// tipo "Currículum (CV)". Es un paso complementario a la contratación:
        /// si falla (CV externo, archivo inexistente, tipo inactivo), el empleado
        /// queda contratado igualmente y el CV puede subirse manualmente.
        /// </summary>
        private async Task CopyResumeToEmployeeFileAsync(Guid applicationId, Guid employeeId)
        {
            try
            {
                var appParams = new DynamicParameters();
                appParams.Add("@Id", applicationId);
                var application = _repo.Get<HR.ApplicationResponse>("hr.SP_GetApplicationById", appParams);
                if (application is null)
                    return;

                var candParams = new DynamicParameters();
                candParams.Add("@Id", application.CandidateId);
                var candidate = _repo.Get<HR.CandidateResponse>("hr.SP_GetCandidateById", candParams);

                // Solo aplica a CV almacenados en el contenedor (una URL externa
                // no es un archivo que se pueda copiar al expediente)
                var resumePath = candidate?.ResumeUrl;
                if (string.IsNullOrWhiteSpace(resumePath) || resumePath.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    return;

                var typeParams = new DynamicParameters();
                typeParams.Add("@IsActive", true);
                var cvType = _repo.GetAll<HR.DocumentTypeResponse>("hr.SP_GetDocumentTypes", typeParams)
                    .FirstOrDefault(t => t.Name.StartsWith("Currículum", StringComparison.OrdinalIgnoreCase));
                if (cvType is null)
                    return;

                var download = await _storage.DownloadAsync(resumePath);
                if (download is null)
                    return;

                // Misma convención que la subida manual de documentos: prefijo único
                // para permitir varios archivos con el mismo nombre en el expediente
                var fileName = Path.GetFileName(resumePath);
                var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + fileName;
                var blobPath = BlobPaths.EmployeeDocument(employeeId, blobName);

                long fileSize;
                await using (var content = download.Value.Content)
                {
                    // El stream de descarga no expone Length: se pasa por memoria
                    // para conocer el tamaño del archivo (CV limitado a 10 MB)
                    using var buffer = new MemoryStream();
                    await content.CopyToAsync(buffer);
                    fileSize = buffer.Length;
                    buffer.Position = 0;
                    await _storage.UploadAsync(blobPath, buffer, download.Value.ContentType);
                }

                var docParams = new DynamicParameters();
                docParams.Add("@EmployeeId",     employeeId);
                docParams.Add("@DocumentTypeId", cvType.Id);
                docParams.Add("@FileName",       fileName);
                docParams.Add("@BlobPath",       blobPath);
                docParams.Add("@FileSize",       fileSize);

                var docResult = _repo.Get<HR.SP_EmployeeResult>("hr.SP_InsertEmployeeDocument", docParams);

                // Si el registro falla, el blob se elimina para no dejar huérfanos
                if (docResult is null || docResult.Success == 0)
                    await _storage.DeleteAsync(blobPath);
            }
            catch
            {
                // La contratación ya se confirmó en la base de datos: un fallo al
                // copiar el CV no debe deshacerla ni convertir la respuesta en error
            }
        }

        /// <summary>
        /// Actualiza las notas de una postulación.
        /// </summary>
        /// <param name="id">Identificador único de la postulación.</param>
        /// <param name="request">Nuevas notas.</param>
        /// <returns>200 con <see cref="HR.SP_ApplicationResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.applications.update", "Editar notas de postulaciones")]
        public IActionResult Update(Guid id, [FromBody] HR.ApplicationNotesRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",    id);
            p.Add("@Notes", request.Notes?.Trim());

            var result = _repo.Get<HR.SP_ApplicationResult>("hr.SP_UpdateApplication", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la postulación." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una postulación.
        /// </summary>
        /// <param name="id">Identificador único de la postulación.</param>
        /// <returns>200 con <see cref="HR.SP_ApplicationResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.applications.delete", "Eliminar postulaciones")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_ApplicationResult>("hr.SP_DeleteApplication", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la postulación." });

            return Ok(result);
        }
    }
}
