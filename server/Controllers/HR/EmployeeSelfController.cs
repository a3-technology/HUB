using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Autoservicio de perfil: permite a CUALQUIER usuario autenticado con un
    /// empleado vinculado (claim "employee_id" del JWT) ver y editar sus propios
    /// datos de contacto, sin necesidad de tener el módulo hr ni sus permisos —
    /// a diferencia de <see cref="EmployeesController"/>, reservado a quienes
    /// gestionan la plantilla completa. El resto de la ficha (foto, salario,
    /// cargo, departamento, banco, etc.) queda fuera de alcance: solo se edita
    /// desde RR. HH. La foto de PERFIL propia del usuario (independiente de la
    /// ficha de empleado) se gestiona aparte en <see cref="UserSelfController"/>.
    /// </summary>
    [ApiController]
    [Route("api/employees/me")]
    [Authorize]
    public class EmployeeSelfController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public EmployeeSelfController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>Empleado vinculado al usuario en sesión, tomado del claim "employee_id" del JWT (null si no tiene).</summary>
        private Guid? CurrentEmployeeId() =>
            Guid.TryParse(User.FindFirst("employee_id")?.Value, out var id) ? id : null;

        /// <summary>
        /// Retorna los datos del empleado vinculado al usuario en sesión.
        /// </summary>
        /// <returns>200 con <see cref="HR.EmployeeResponse"/>, o 404 si el usuario no tiene un empleado vinculado.</returns>
        [HttpGet]
        public async Task<IActionResult> Get()
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null)
                return NotFound(new { message = "Tu usuario no está vinculado a un empleado." });

            var employee = GetEmployee(employeeId.Value);
            if (employee is null)
                return NotFound(new { message = "Empleado no encontrado." });

            employee.PhotoUrl = await SignPhotoUrl(employee.PhotoUrl);
            return Ok(employee);
        }

        /// <summary>
        /// Actualiza el teléfono y la dirección del empleado vinculado al usuario en sesión.
        /// </summary>
        /// <param name="request">Nuevo teléfono y dirección.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/>, o 400/404 si hay error.</returns>
        [HttpPatch]
        public IActionResult Update([FromBody] HR.EmployeeSelfUpdateRequest request)
        {
            var employeeId = CurrentEmployeeId();
            if (employeeId is null)
                return NotFound(new { message = "Tu usuario no está vinculado a un empleado." });

            var p = new DynamicParameters();
            p.Add("@Id",      employeeId.Value);
            p.Add("@Phone",   string.IsNullOrWhiteSpace(request.Phone) ? null : request.Phone.Trim());
            p.Add("@Address", string.IsNullOrWhiteSpace(request.Address) ? null : request.Address.Trim());

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_UpdateEmployeeSelf", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el perfil." });

            return Ok(result);
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

        /// <summary>Convierte la ruta de blob de la foto en una URL firmada temporal (60 minutos).</summary>
        private async Task<string?> SignPhotoUrl(string? photoPath)
        {
            if (string.IsNullOrWhiteSpace(photoPath))
                return null;

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return url.ToString();
        }
    }
}
