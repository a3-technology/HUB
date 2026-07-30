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
    /// Controlador del módulo Recursos Humanos — Empleados.
    /// Expone operaciones CRUD y cambio de estado para los empleados de la organización.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/employees")]
    [Authorize(Policy = "hr")]
    public class EmployeesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Extensiones de foto aceptadas y tamaño máximo (5 MB).</summary>
        private static readonly string[] AllowedPhotoExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        private const long MaxPhotoSizeBytes = 5 * 1024 * 1024;

        /// <summary>Extensiones de documento aceptadas y tamaño máximo (10 MB).</summary>
        private static readonly string[] AllowedDocumentExtensions = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"];
        private const long MaxDocumentSizeBytes = 10 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public EmployeesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de empleados con filtros opcionales por estado y departamento.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="departmentId">Filtra por departamento específico.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool? active = null, [FromQuery] Guid? departmentId = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive",     active.HasValue ? (object)active.Value : null);
            p.Add("@DepartmentId", departmentId.HasValue ? (object)departmentId.Value : null);

            var result = _repo.GetAll<HR.EmployeeResponse>("hr.SP_GetEmployees", p).ToList();

            // PhotoUrl se expone como URL firmada temporal para mostrarla directo en el cliente
            foreach (var e in result)
                e.PhotoUrl = await SignPhotoUrl(e.PhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna un empleado por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del empleado.</param>
        /// <returns>200 con <see cref="HR.EmployeeResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = GetEmployee(id);
            if (result is null)
                return NotFound(new { message = "Empleado no encontrado." });

            result.PhotoUrl = await SignPhotoUrl(result.PhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar el CV asociado al
        /// empleado (el del candidato de origen cuando fue contratado desde el
        /// módulo de reclutamiento); la URL fuerza la descarga con el nombre
        /// del archivo. Las URLs externas se retornan tal cual.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del empleado.</param>
        /// <returns>200 con { url } o 404 si el empleado no tiene CV asociado.</returns>
        [HttpGet("{id:guid}/resume-url")]
        public async Task<IActionResult> GetResumeUrl(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var employee = _repo.Get<HR.EmployeeResponse>("hr.SP_GetEmployeeById", p);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            if (string.IsNullOrWhiteSpace(employee.ResumeUrl))
                return NotFound(new { message = "El empleado no tiene currículum asociado." });

            // URL externa registrada manualmente en el candidato: se usa directo
            if (employee.ResumeUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                return Ok(new { url = employee.ResumeUrl });

            if (!await _storage.ExistsAsync(employee.ResumeUrl))
                return NotFound(new { message = "El archivo del currículum no se encontró en el almacenamiento." });

            var fileName = Path.GetFileName(employee.ResumeUrl);
            var url = await _storage.GetReadUrlAsync(employee.ResumeUrl, TimeSpan.FromMinutes(15), fileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Retorna la trayectoria laboral de un empleado (contratación y cambios
        /// de cargo, departamento y salario), del más reciente al más antiguo.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del empleado.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeJobHistoryResponse"/>.</returns>
        [HttpGet("{id:guid}/history")]
        public IActionResult GetHistory(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", id);

            var result = _repo.GetAll<HR.EmployeeJobHistoryResponse>("hr.SP_GetEmployeeJobHistory", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo empleado validando existencia del departamento y el cargo,
        /// y unicidad de código y correo.
        /// </summary>
        /// <param name="request">Datos del empleado.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si hay conflicto.</returns>
        [HttpPost]
        [RequirePermission("hr.employees.create", "Crear empleados")]
        public IActionResult Insert([FromBody] HR.EmployeeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Code",         request.Code.Trim().ToUpper());
            p.Add("@FirstName",    request.FirstName.Trim());
            p.Add("@LastName",     request.LastName.Trim());
            p.Add("@Email",        request.Email.Trim().ToLower());
            p.Add("@Phone",                string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim());
            p.Add("@Address",              string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim());
            p.Add("@BirthDate",            request.BirthDate?.Date);
            p.Add("@IdentificationTypeId", request.IdentificationTypeId);
            p.Add("@IdentificationNumber", request.IdentificationNumber.Trim());
            p.Add("@Salary",               request.Salary);
            p.Add("@CurrencyId",           request.CurrencyId);
            p.Add("@PositionId",           request.PositionId);
            p.Add("@DepartmentId",         request.DepartmentId);
            p.Add("@WorkModalityId",       request.WorkModalityId);
            p.Add("@ContractTypeId",       request.ContractTypeId);
            p.Add("@PayUnit",              request.PayUnit);
            p.Add("@PayFrequency",         request.PayFrequency);
            p.Add("@WorkShift",            request.WorkShift);
            p.Add("@BankId",               request.BankId);
            p.Add("@BankAccountNumber",    string.IsNullOrWhiteSpace(request.BankAccountNumber) ? null : request.BankAccountNumber.Trim());
            p.Add("@HireDate",             request.HireDate.Date);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_InsertEmployee", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el empleado." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un empleado existente.
        /// </summary>
        /// <param name="id">Identificador único del empleado a actualizar.</param>
        /// <param name="request">Nuevos datos del empleado.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.employees.update", "Editar empleados")]
        public IActionResult Update(Guid id, [FromBody] HR.EmployeeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",           id);
            p.Add("@Code",         request.Code.Trim().ToUpper());
            p.Add("@FirstName",    request.FirstName.Trim());
            p.Add("@LastName",     request.LastName.Trim());
            p.Add("@Email",        request.Email.Trim().ToLower());
            p.Add("@Phone",                string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim());
            p.Add("@Address",              string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim());
            p.Add("@BirthDate",            request.BirthDate?.Date);
            p.Add("@IdentificationTypeId", request.IdentificationTypeId);
            p.Add("@IdentificationNumber", request.IdentificationNumber.Trim());
            p.Add("@Salary",               request.Salary);
            p.Add("@CurrencyId",           request.CurrencyId);
            p.Add("@PositionId",           request.PositionId);
            p.Add("@DepartmentId",         request.DepartmentId);
            p.Add("@WorkModalityId",       request.WorkModalityId);
            p.Add("@ContractTypeId",       request.ContractTypeId);
            p.Add("@PayUnit",              request.PayUnit);
            p.Add("@PayFrequency",         request.PayFrequency);
            p.Add("@WorkShift",            request.WorkShift);
            p.Add("@BankId",               request.BankId);
            p.Add("@BankAccountNumber",    string.IsNullOrWhiteSpace(request.BankAccountNumber) ? null : request.BankAccountNumber.Trim());
            p.Add("@HireDate",             request.HireDate.Date);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_UpdateEmployee", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el empleado." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un empleado (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.employees.toggle", "Activar/desactivar empleados")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_ToggleEmployeeStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del empleado." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un empleado. Si la eliminación en base de datos
        /// tiene éxito, se borran también su foto y los archivos de su expediente
        /// del contenedor (los registros de documentos caen en cascada).
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.employees.delete", "Eliminar empleados")]
        public async Task<IActionResult> Delete(Guid id)
        {
            // Se capturan las rutas de blobs ANTES del borrado (después ya no existen los registros)
            var employee = GetEmployee(id);
            var docsParams = new DynamicParameters();
            docsParams.Add("@EmployeeId", id);
            var documents = _repo.GetAll<HR.EmployeeDocumentResponse>("hr.SP_GetEmployeeDocuments", docsParams).ToList();

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_DeleteEmployee", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el empleado." });

            if (!string.IsNullOrWhiteSpace(employee?.PhotoUrl))
                await _storage.DeleteAsync(employee.PhotoUrl);
            foreach (var doc in documents)
                await _storage.DeleteAsync(doc.BlobPath);

            return Ok(result);
        }

        // ── Foto del empleado (Azure Blob Storage) ────────────────────────────

        /// <summary>
        /// Sube o reemplaza la foto de un empleado.
        /// El archivo se guarda en el contenedor a3hub bajo la convención
        /// hr/employees/{id}/photo/{archivo} y la ruta queda registrada en PhotoUrl.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <param name="file">Imagen JPG, PNG o WEBP de máximo 5 MB.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("{id:guid}/photo")]
        [RequirePermission("hr.employees.photo-upload", "Subir foto de empleado")]
        public async Task<IActionResult> UploadPhoto(Guid id, IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo de la foto." });

            if (file.Length > MaxPhotoSizeBytes)
                return BadRequest(new { message = "La foto no puede superar 5 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedPhotoExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan JPG, PNG y WEBP." });

            var employee = GetEmployee(id);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            // Si ya tenía una foto en el contenedor, se elimina para no dejar huérfanos
            if (!string.IsNullOrWhiteSpace(employee.PhotoUrl))
                await _storage.DeleteAsync(employee.PhotoUrl);

            // Nombre saneado: solo letras, números, punto, guion y guion bajo
            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;

            var blobPath = BlobPaths.EmployeePhoto(id, safeName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@Id", id);
            p.Add("@PhotoUrl", blobPath);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_UpdateEmployeePhoto", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar la foto." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para mostrar la foto del empleado.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con { url } o 404 si el empleado no tiene foto.</returns>
        [HttpGet("{id:guid}/photo-url")]
        public async Task<IActionResult> GetPhotoUrl(Guid id)
        {
            var employee = GetEmployee(id);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            if (string.IsNullOrWhiteSpace(employee.PhotoUrl))
                return NotFound(new { message = "El empleado no tiene foto registrada." });

            if (!await _storage.ExistsAsync(employee.PhotoUrl))
                return NotFound(new { message = "El archivo de la foto no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(employee.PhotoUrl, TimeSpan.FromMinutes(15));
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Sirve los bytes de la foto del empleado a través del API (mismo
        /// origen). Necesario cuando el navegador no puede leer la URL firmada
        /// del blob por CORS, p. ej. al incrustar la foto en el PDF de la ficha.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con la imagen o 404 si el empleado no tiene foto.</returns>
        [HttpGet("{id:guid}/photo")]
        public async Task<IActionResult> GetPhoto(Guid id)
        {
            var employee = GetEmployee(id);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            if (string.IsNullOrWhiteSpace(employee.PhotoUrl))
                return NotFound(new { message = "El empleado no tiene foto registrada." });

            var download = await _storage.DownloadAsync(employee.PhotoUrl);
            if (download is null)
                return NotFound(new { message = "El archivo de la foto no se encontró en el almacenamiento." });

            return File(download.Value.Content, download.Value.ContentType);
        }

        /// <summary>
        /// Elimina la foto de un empleado: borra el archivo del contenedor
        /// y limpia la referencia en la base de datos.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 404 si no existe.</returns>
        [HttpDelete("{id:guid}/photo")]
        [RequirePermission("hr.employees.photo-delete", "Eliminar foto de empleado")]
        public async Task<IActionResult> DeletePhoto(Guid id)
        {
            var employee = GetEmployee(id);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            if (!string.IsNullOrWhiteSpace(employee.PhotoUrl))
                await _storage.DeleteAsync(employee.PhotoUrl);

            var p = new DynamicParameters();
            p.Add("@Id", id);
            p.Add("@PhotoUrl", null);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_UpdateEmployeePhoto", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la foto." });

            return Ok(result);
        }

        // ── Expediente documental (Azure Blob Storage) ────────────────────────

        /// <summary>
        /// Retorna los documentos del expediente de un empleado
        /// (CV, récord policial, identificación, títulos, contratos).
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeDocumentResponse"/>.</returns>
        [HttpGet("{id:guid}/documents")]
        public IActionResult GetDocuments(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", id);

            var result = _repo.GetAll<HR.EmployeeDocumentResponse>("hr.SP_GetEmployeeDocuments", p);
            return Ok(result);
        }

        /// <summary>
        /// Sube un documento al expediente de un empleado.
        /// El archivo se guarda en el contenedor a3hub bajo la convención
        /// hr/employees/{id}/docs/{archivo} y se registra en hr.EmployeeDocuments.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <param name="file">Archivo PDF, DOC, DOCX, JPG, PNG o WEBP de máximo 10 MB.</param>
        /// <param name="documentTypeId">Identificador del tipo de documento (catálogo hr.DocumentTypes).</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si el archivo o tipo no es válido.</returns>
        [HttpPost("{id:guid}/documents")]
        [RequirePermission("hr.employees.document-upload", "Subir documento del expediente de empleado")]
        public async Task<IActionResult> UploadDocument(Guid id, IFormFile file, [FromForm] Guid documentTypeId)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo del documento." });

            if (file.Length > MaxDocumentSizeBytes)
                return BadRequest(new { message = "El documento no puede superar 10 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedDocumentExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan PDF, DOC, DOCX, JPG, PNG y WEBP." });

            if (documentTypeId == Guid.Empty)
                return BadRequest(new { message = "Selecciona el tipo de documento." });

            var employee = GetEmployee(id);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            // Nombre saneado + prefijo único para permitir varios documentos
            // con el mismo nombre de archivo dentro del expediente
            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;
            var blobName = $"{Guid.NewGuid():N}"[..8] + "-" + safeName;

            var blobPath = BlobPaths.EmployeeDocument(id, blobName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var p = new DynamicParameters();
            p.Add("@EmployeeId",     id);
            p.Add("@DocumentTypeId", documentTypeId);
            p.Add("@FileName",       file.FileName);
            p.Add("@BlobPath",       blobPath);
            p.Add("@FileSize",       file.Length);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_InsertEmployeeDocument", p);

            if (result is null || result.Success == 0)
            {
                // Si el registro falla, el blob se elimina para no dejar huérfanos
                await _storage.DeleteAsync(blobPath);
                return BadRequest(new { message = result?.Message ?? "Error al registrar el documento." });
            }

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (15 minutos) para descargar un documento del
        /// expediente. La URL fuerza la descarga con el nombre original del archivo.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <param name="docId">Identificador único del documento.</param>
        /// <returns>200 con { url } o 404 si el documento no existe.</returns>
        [HttpGet("{id:guid}/documents/{docId:guid}/url")]
        public async Task<IActionResult> GetDocumentUrl(Guid id, Guid docId)
        {
            var document = GetDocument(docId);
            if (document is null || document.EmployeeId != id)
                return NotFound(new { message = "Documento no encontrado." });

            if (!await _storage.ExistsAsync(document.BlobPath))
                return NotFound(new { message = "El archivo del documento no se encontró en el almacenamiento." });

            var url = await _storage.GetReadUrlAsync(document.BlobPath, TimeSpan.FromMinutes(15), document.FileName);
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina un documento del expediente: borra el archivo del contenedor
        /// y el registro en la base de datos.
        /// </summary>
        /// <param name="id">Identificador único del empleado.</param>
        /// <param name="docId">Identificador único del documento.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 404 si no existe.</returns>
        [HttpDelete("{id:guid}/documents/{docId:guid}")]
        [RequirePermission("hr.employees.document-delete", "Eliminar documento del expediente de empleado")]
        public async Task<IActionResult> DeleteDocument(Guid id, Guid docId)
        {
            var document = GetDocument(docId);
            if (document is null || document.EmployeeId != id)
                return NotFound(new { message = "Documento no encontrado." });

            await _storage.DeleteAsync(document.BlobPath);

            var p = new DynamicParameters();
            p.Add("@Id", docId);

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_DeleteEmployeeDocument", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el documento." });

            return Ok(result);
        }

        /// <summary>Consulta un documento del expediente por Id (null si no existe).</summary>
        private HR.EmployeeDocumentResponse? GetDocument(Guid docId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", docId);
            return _repo.Get<HR.EmployeeDocumentResponse>("hr.SP_GetEmployeeDocumentById", p);
        }

        /// <summary>
        /// Consulta un empleado por Id (null si no existe).
        /// PhotoUrl viene como ruta de blob cruda; los endpoints públicos la firman
        /// con <see cref="SignPhotoUrl"/> antes de responder.
        /// </summary>
        private HR.EmployeeResponse? GetEmployee(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);
            return _repo.Get<HR.EmployeeResponse>("hr.SP_GetEmployeeById", p);
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto en una URL firmada temporal (60 minutos).
        /// Retorna null si el empleado no tiene foto.
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
