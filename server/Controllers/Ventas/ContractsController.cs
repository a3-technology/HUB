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
    /// Controlador del módulo Ventas — Contratos.
    /// Expone operaciones CRUD, cambio de estado de negocio, eliminación
    /// lógica y el documento firmado adjunto (Azure Blob Storage). Todas las
    /// operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema sal.
    /// </summary>
    [ApiController]
    [Route("api/ventas/contracts")]
    [Authorize(Policy = "ventas")]
    public class ContractsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Extensiones aceptadas para el documento firmado y tamaño máximo (10 MB).</summary>
        private static readonly string[] AllowedDocumentExtensions = [".pdf", ".jpg", ".jpeg", ".png"];
        private const long MaxDocumentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public ContractsController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de contratos con filtros opcionales.
        /// </summary>
        /// <param name="clientId">Filtra los contratos de un cliente específico.</param>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="status">Filtra por estado (Draft, Active, Expired, Terminated).</param>
        /// <returns>200 con la lista de <see cref="Ventas.ContractResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? clientId = null, [FromQuery] bool? active = null, [FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId", clientId);
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Status",   status);

            var result = _repo.GetAll<Ventas.ContractResponse>("sal.SP_GetContracts", p).ToList();

            foreach (var c in result)
                c.OwnerPhotoUrl = await SignPhotoUrl(c.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna un contrato por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del contrato.</param>
        /// <returns>200 con <see cref="Ventas.ContractResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = GetContract(id);
            if (result is null)
                return NotFound(new { message = "Contrato no encontrado." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo contrato (manual, sin orden de venta asociada).
        /// </summary>
        /// <param name="request">Datos del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("ventas.contracts.create", "Crear contratos")]
        public IActionResult Insert([FromBody] Ventas.ContractRequest request)
        {
            var p = BuildContractParameters(request);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_InsertContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un contrato existente.
        /// </summary>
        /// <param name="id">Identificador único del contrato a actualizar.</param>
        /// <param name="request">Nuevos datos del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("ventas.contracts.update", "Editar contratos")]
        public IActionResult Update(Guid id, [FromBody] Ventas.ContractRequest request)
        {
            var p = BuildContractParameters(request);
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_UpdateContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia el estado de negocio de un contrato (Draft, Active, Expired, Terminated).
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <param name="request">Nuevo estado.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/status")]
        [RequirePermission("ventas.contracts.change-status", "Cambiar estado de contratos")]
        public IActionResult ChangeStatus(Guid id, [FromBody] Ventas.ContractStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Status", request.Status);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_ChangeContractStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un contrato (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("ventas.contracts.toggle", "Activar/desactivar contratos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_ToggleContractStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un contrato.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("ventas.contracts.delete", "Eliminar contratos")]
        public async Task<IActionResult> Delete(Guid id)
        {
            var contract = GetContract(id);

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_DeleteContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el contrato." });

            if (contract is not null && !string.IsNullOrWhiteSpace(contract.DocumentUrl))
                await _storage.DeleteAsync(contract.DocumentUrl);

            return Ok(result);
        }

        // ── Documento firmado del contrato ────────────────────────────────────

        /// <summary>
        /// Sube (o reemplaza) el documento firmado del contrato. El archivo se
        /// guarda en el contenedor a3hub bajo la convención
        /// sal/contracts/{id}/document/{archivo} y su ruta queda asociada al contrato.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <param name="file">Archivo PDF, JPG o PNG de máximo 10 MB.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/document")]
        [RequirePermission("ventas.contracts.document-upload", "Subir documento de contrato")]
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

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
            var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

            var blobPath = BlobPaths.SalesContractDocument(id, blobName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@DocumentUrl",  blobPath);
            p.Add("@DocumentName", file.FileName);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_SetContractDocument", p);

            if (result is null || result.Success == 0)
            {
                await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al guardar el documento del contrato." });
            }

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

            var url = await _storage.GetReadUrlAsync(contract.DocumentUrl, TimeSpan.FromMinutes(15), contract.DocumentName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina el documento firmado del contrato: borra el archivo del
        /// contenedor y desasocia la ruta en la base de datos.
        /// </summary>
        /// <param name="id">Identificador único del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesContractResult"/> o 404 si no tiene documento.</returns>
        [HttpDelete("{id:guid}/document")]
        [RequirePermission("ventas.contracts.document-delete", "Eliminar documento de contrato")]
        public async Task<IActionResult> DeleteDocument(Guid id)
        {
            var contract = GetContract(id);
            if (contract is null || string.IsNullOrWhiteSpace(contract.DocumentUrl))
                return NotFound(new { message = "El contrato no tiene documento asociado." });

            await _storage.DeleteAsync(contract.DocumentUrl);

            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@DocumentUrl",  (string?)null);
            p.Add("@DocumentName", (string?)null);

            var result = _repo.Get<Ventas.SP_SalesContractResult>("sal.SP_SetContractDocument", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el documento del contrato." });

            return Ok(result);
        }

        /// <summary>Consulta un contrato por Id (null si no existe).</summary>
        private Ventas.ContractResponse? GetContract(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);
            return _repo.Get<Ventas.ContractResponse>("sal.SP_GetContractById", p);
        }

        /// <summary>Parámetros comunes de crear/actualizar contrato.</summary>
        private static DynamicParameters BuildContractParameters(Ventas.ContractRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",   request.ClientId);
            p.Add("@Title",      request.Title.Trim());
            p.Add("@StartDate",  request.StartDate.Date);
            p.Add("@EndDate",    request.EndDate?.Date);
            p.Add("@Value",      request.Value);
            p.Add("@CurrencyId", request.CurrencyId);
            p.Add("@OwnerId",    request.OwnerId);
            p.Add("@Notes",      request.Notes?.Trim());
            return p;
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto del ejecutivo asignado en una URL firmada
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
