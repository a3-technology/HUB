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
    /// Controlador del módulo Recursos Humanos — Contratos de empleados.
    /// Gestiona el ciclo de vida completo de los contratos: alta, edición,
    /// renovación encadenada, terminación anticipada y eliminación. Soporta
    /// contratos mixtos (un empleado puede tener contratos activos de tipos
    /// distintos en paralelo, p. ej. fijo + servicios profesionales) y alertas
    /// de vencimiento para contratos con fecha de fin.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/contracts")]
    [Authorize(Policy = "hr")]
    public class EmployeeContractsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Extensiones aceptadas para el documento firmado y tamaño máximo (10 MB).</summary>
        private static readonly string[] AllowedDocumentExtensions = [".pdf", ".jpg", ".jpeg", ".png"];
        private const long MaxDocumentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public EmployeeContractsController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna la lista de contratos con filtros opcionales.
        /// </summary>
        /// <param name="employeeId">Filtra por empleado (omitir = todos).</param>
        /// <param name="status">Filtra por estado: Active | Terminated | Renewed (omitir = todos).</param>
        /// <param name="expiringInDays">Solo contratos activos que vencen dentro de N días.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeContractResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] Guid? employeeId = null,
                                    [FromQuery] string? status = null,
                                    [FromQuery] int? expiringInDays = null)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",     employeeId);
            p.Add("@Status",         string.IsNullOrWhiteSpace(status) ? null : status.Trim());
            p.Add("@ExpiringInDays", expiringInDays);

            var result = _repo.GetAll<HR.EmployeeContractResponse>("hr.SP_GetEmployeeContracts", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un contrato por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del contrato.</param>
        /// <returns>200 con <see cref="HR.EmployeeContractResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.EmployeeContractResponse>("hr.SP_GetEmployeeContractById", p);
            if (result is null)
                return NotFound(new { message = "Contrato no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un contrato validando fechas y solapamiento con otro contrato
        /// activo del mismo tipo. Sincroniza el tipo de contrato del empleado.
        /// </summary>
        /// <param name="request">Empleado, tipo, fechas, base salarial y tarifa.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("hr.contracts.create", "Crear contratos de empleados")]
        public IActionResult Insert([FromBody] HR.EmployeeContractRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",     request.EmployeeId);
            p.Add("@ContractTypeId", request.ContractTypeId);
            p.Add("@StartDate",      request.StartDate.Date);
            p.Add("@EndDate",        request.EndDate?.Date);
            p.Add("@PayUnit",        request.PayUnit);
            p.Add("@PayFrequency",   request.PayFrequency);
            p.Add("@WorkShift",      request.WorkShift);
            p.Add("@PayRate",        request.PayRate);
            p.Add("@CurrencyId",     request.CurrencyId);
            p.Add("@WeeklyHours",    request.WeeklyHours);
            p.Add("@Notes",          string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());
            p.Add("@RegisteredBy",   CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_InsertEmployeeContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un contrato activo (fechas, tarifa, horas, documento y notas).
        /// </summary>
        /// <param name="id">Identificador único del contrato a actualizar.</param>
        /// <param name="request">Nuevos datos del contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.contracts.update", "Editar contratos de empleados")]
        public IActionResult Update(Guid id, [FromBody] HR.EmployeeContractUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@StartDate",    request.StartDate.Date);
            p.Add("@EndDate",      request.EndDate?.Date);
            p.Add("@PayUnit",      request.PayUnit);
            p.Add("@PayFrequency", request.PayFrequency);
            p.Add("@WorkShift",    request.WorkShift);
            p.Add("@PayRate",      request.PayRate);
            p.Add("@CurrencyId",   request.CurrencyId);
            p.Add("@WeeklyHours",  request.WeeklyHours);
            p.Add("@Notes",        string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_UpdateEmployeeContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Renueva un contrato: cierra el actual (estado Renewed) y crea uno
        /// nuevo encadenado. Los campos omitidos heredan del contrato original.
        /// </summary>
        /// <param name="id">Identificador único del contrato a renovar.</param>
        /// <param name="request">Fechas y condiciones de la renovación.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> (Id del contrato nuevo) o 400 si hay error.</returns>
        [HttpPost("{id:guid}/renew")]
        [RequirePermission("hr.contracts.renew", "Renovar contratos de empleados")]
        public IActionResult Renew(Guid id, [FromBody] HR.EmployeeContractRenewRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@StartDate",    request.StartDate.Date);
            p.Add("@EndDate",      request.EndDate?.Date);
            p.Add("@PayUnit",      string.IsNullOrWhiteSpace(request.PayUnit) ? null : request.PayUnit);
            p.Add("@PayFrequency", string.IsNullOrWhiteSpace(request.PayFrequency) ? null : request.PayFrequency);
            p.Add("@WorkShift",    string.IsNullOrWhiteSpace(request.WorkShift) ? null : request.WorkShift);
            p.Add("@PayRate",      request.PayRate);
            p.Add("@CurrencyId",   request.CurrencyId);
            p.Add("@WeeklyHours",  request.WeeklyHours);
            p.Add("@Notes",        string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());
            p.Add("@RegisteredBy", CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_RenewEmployeeContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al renovar el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Termina anticipadamente un contrato activo con motivo opcional.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <param name="request">Fecha de término (omitir = hoy) y motivo.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/terminate")]
        [RequirePermission("hr.contracts.terminate", "Terminar contratos de empleados")]
        public IActionResult Terminate(Guid id, [FromBody] HR.EmployeeContractTerminateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",              id);
            p.Add("@EndDate",         request.EndDate?.Date);
            p.Add("@TerminationType", string.IsNullOrWhiteSpace(request.TerminationType) ? null : request.TerminationType);
            p.Add("@Reason",          string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim());

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_TerminateEmployeeContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al terminar el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un contrato sin horas imputadas ni
        /// renovaciones encadenadas.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 400 si hay error.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.contracts.delete", "Eliminar contratos de empleados")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_DeleteEmployeeContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el contrato." });

            return Ok(result);
        }

        // ── Documento firmado del contrato ────────────────────────────────────

        /// <summary>
        /// Sube (o reemplaza) el documento firmado del contrato. El archivo se
        /// guarda en el contenedor a3hub bajo la convención
        /// hr/contracts/{id}/document/{archivo} y su ruta queda asociada al contrato.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <param name="file">Archivo PDF, JPG o PNG de máximo 10 MB.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/document")]
        [RequirePermission("hr.contracts.document-upload", "Subir documento firmado del contrato")]
        public async Task<IActionResult> UploadDocument(Guid id, IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo del contrato firmado." });

            if (file.Length > MaxDocumentSizeBytes)
                return BadRequest(new { message = "El documento no puede superar 10 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedDocumentExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, JPG y PNG." });

            var contract = GetContract(id);
            if (contract is null)
                return NotFound(new { message = "Contrato no encontrado." });

            // Nombre saneado + prefijo único para no chocar con subidas anteriores
            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
            var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

            var blobPath = BlobPaths.ContractDocument(id, blobName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@Id",       id);
            p.Add("@BlobPath", blobPath);
            p.Add("@FileName", file.FileName);

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_SetContractDocument", p);

            if (result is null || result.Success == 0)
            {
                // Si el registro falla, el blob se elimina para no dejar huérfanos
                await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al guardar el documento del contrato." });
            }

            // El documento anterior (si existía) se elimina del almacenamiento
            if (!string.IsNullOrWhiteSpace(contract.DocumentUrl) && contract.DocumentUrl != blobPath)
                await _storage.DeleteAsync(contract.DocumentUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar el documento
        /// firmado del contrato con su nombre original.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con { url } o 404 si el contrato no tiene documento.</returns>
        [HttpGet("{id:guid}/document-url")]
        public async Task<IActionResult> GetDocumentUrl(Guid id)
        {
            var contract = GetContract(id);
            if (contract is null || string.IsNullOrWhiteSpace(contract.DocumentUrl))
                return NotFound(new { message = "El contrato no tiene documento asociado." });

            if (!await _storage.ExistsAsync(contract.DocumentUrl))
                return NotFound(new { message = "El archivo del contrato no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(contract.DocumentUrl, TimeSpan.FromMinutes(15), contract.DocumentFileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina el documento firmado del contrato: borra el archivo del
        /// contenedor y desasocia la ruta en la base de datos.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractResult"/> o 404 si no tiene documento.</returns>
        [HttpDelete("{id:guid}/document")]
        [RequirePermission("hr.contracts.document-delete", "Eliminar documento firmado del contrato")]
        public async Task<IActionResult> DeleteDocument(Guid id)
        {
            var contract = GetContract(id);
            if (contract is null || string.IsNullOrWhiteSpace(contract.DocumentUrl))
                return NotFound(new { message = "El contrato no tiene documento asociado." });

            await _storage.DeleteAsync(contract.DocumentUrl);

            var p = new DynamicParameters();
            p.Add("@Id",       id);
            p.Add("@BlobPath", (string?)null);
            p.Add("@FileName", (string?)null);

            var result = _repo.Get<HR.SP_ContractResult>("hr.SP_SetContractDocument", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el documento del contrato." });

            return Ok(result);
        }

        /// <summary>Consulta un contrato por Id (null si no existe).</summary>
        private HR.EmployeeContractResponse? GetContract(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);
            return _repo.Get<HR.EmployeeContractResponse>("hr.SP_GetEmployeeContractById", p);
        }
    }
}
