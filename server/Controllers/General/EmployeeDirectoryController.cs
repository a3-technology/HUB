using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Directorio básico de empleados (nombre, correo, foto). Es transversal a
    /// todos los módulos — igual que <see cref="CurrenciesController"/> — porque
    /// varios módulos referencian empleados (solicitante de un ticket, owner de
    /// una oportunidad/cliente, responsable de una tarea, vendedor de una
    /// cotización, empleado vinculado a un usuario) sin que quien lo usa tenga
    /// necesariamente el módulo hr asignado. Por eso el acceso solo requiere
    /// estar autenticado, sin política de módulo, y no expone datos sensibles
    /// (salario, banco, identificación) — para eso está hr.SP_GetEmployees vía
    /// EmployeesController, restringido al módulo hr.
    /// </summary>
    [ApiController]
    [Route("api/employees/directory")]
    [Authorize]
    public class EmployeeDirectoryController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public EmployeeDirectoryController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna el directorio de empleados con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir a todos.</param>
        /// <returns>200 con la lista de <see cref="DBO.EmployeeDirectoryResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<DBO.EmployeeDirectoryResponse>("dbo.SP_GetEmployeeDirectory", p).ToList();

            // PhotoUrl viene como ruta de blob cruda (ej. "hr/employees/{id}/photo/foto.jpg"),
            // no usable directo en <img src>; se firma con una URL temporal antes de responder
            // (mismo tratamiento que EmployeesController para /api/hr/employees).
            foreach (var e in result)
                e.PhotoUrl = await SignPhotoUrl(e.PhotoUrl);

            return Ok(result);
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
