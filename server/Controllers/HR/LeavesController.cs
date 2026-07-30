using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Ausencias e incapacidades.
    /// Expone el catálogo de tipos de ausencia (incapacidades, licencias,
    /// permisos) y el registro de ausencias por empleado. A diferencia de las
    /// vacaciones, una ausencia no se solicita ni se aprueba: se registra como
    /// un hecho (con su constancia médica cuando el tipo la exige) y no
    /// descuenta del saldo de vacaciones.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/leaves")]
    [Authorize(Policy = "hr")]
    public class LeavesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public LeavesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        // ── Tipos de ausencia (catálogo) ──────────────────────────────────────

        /// <summary>
        /// Retorna la lista de tipos de ausencia con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.LeaveTypeResponse"/>.</returns>
        [HttpGet("types")]
        public IActionResult GetTypes([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@OnlyActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.LeaveTypeResponse>("hr.SP_GetLeaveTypes", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un tipo de ausencia por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del tipo de ausencia.</param>
        /// <returns>200 con <see cref="HR.LeaveTypeResponse"/> o 404 si no existe.</returns>
        [HttpGet("types/{id:guid}")]
        public IActionResult GetTypeById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.LeaveTypeResponse>("hr.SP_GetLeaveTypeById", p);
            if (result is null)
                return NotFound(new { message = "Tipo de ausencia no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un tipo de ausencia validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre, descripción y banderas del tipo.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpPost("types")]
        [RequirePermission("hr.leaves.type-create", "Crear tipos de ausencia")]
        public IActionResult InsertType([FromBody] HR.LeaveTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",             request.Name.Trim());
            p.Add("@Description",      request.Description?.Trim());
            p.Add("@IsPaid",           request.IsPaid);
            p.Add("@RequiresDocument", request.RequiresDocument);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_InsertLeaveType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el tipo de ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un tipo de ausencia validando unicidad del nombre.
        /// </summary>
        /// <param name="id">Identificador único del tipo a actualizar.</param>
        /// <param name="request">Nuevos datos del tipo.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpPut("types/{id:guid}")]
        [RequirePermission("hr.leaves.type-update", "Editar tipos de ausencia")]
        public IActionResult UpdateType(Guid id, [FromBody] HR.LeaveTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",               id);
            p.Add("@Name",             request.Name.Trim());
            p.Add("@Description",      request.Description?.Trim());
            p.Add("@IsPaid",           request.IsPaid);
            p.Add("@RequiresDocument", request.RequiresDocument);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_UpdateLeaveType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el tipo de ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un tipo de ausencia (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del tipo de ausencia.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si no existe.</returns>
        [HttpPatch("types/{id:guid}/toggle")]
        [RequirePermission("hr.leaves.type-toggle", "Activar/desactivar tipos de ausencia")]
        public IActionResult ToggleType(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_ToggleLeaveTypeStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del tipo de ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un tipo de ausencia.
        /// No se permite si tiene ausencias registradas.
        /// </summary>
        /// <param name="id">Identificador único del tipo de ausencia.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpDelete("types/{id:guid}")]
        [RequirePermission("hr.leaves.type-delete", "Eliminar tipos de ausencia")]
        public IActionResult DeleteType(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_DeleteLeaveType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el tipo de ausencia." });

            return Ok(result);
        }

        // ── Ausencias registradas ─────────────────────────────────────────────

        /// <summary>
        /// Retorna la lista de ausencias/incapacidades con filtros opcionales.
        /// </summary>
        /// <param name="status">Filtro por estado derivado: Active | Finished | Voided.</param>
        /// <param name="employeeId">Filtro por empleado.</param>
        /// <param name="year">Filtro por año de la fecha de inicio.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeLeaveResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll(
            [FromQuery] string? status = null,
            [FromQuery] Guid? employeeId = null,
            [FromQuery] int? year = null)
        {
            var p = new DynamicParameters();
            p.Add("@Status",     status);
            p.Add("@EmployeeId", employeeId);
            p.Add("@Year",       year);

            var result = _repo.GetAll<HR.EmployeeLeaveResponse>("hr.SP_GetEmployeeLeaves", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una ausencia por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la ausencia.</param>
        /// <returns>200 con <see cref="HR.EmployeeLeaveResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.EmployeeLeaveResponse>("hr.SP_GetEmployeeLeaveById", p);
            if (result is null)
                return NotFound(new { message = "Ausencia no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Registra una ausencia/incapacidad. El servidor valida empleado y tipo
        /// activos, constancia obligatoria según el tipo, y solapamiento con
        /// otras ausencias y con vacaciones pendientes o aprobadas.
        /// El usuario que registra se toma del JWT.
        /// </summary>
        /// <param name="request">Empleado, tipo, período, constancia y observaciones.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error de validación.</returns>
        [HttpPost]
        [RequirePermission("hr.leaves.create", "Registrar ausencias")]
        public IActionResult Insert([FromBody] HR.EmployeeLeaveCreateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",     request.EmployeeId);
            p.Add("@LeaveTypeId",    request.LeaveTypeId);
            p.Add("@StartDate",      request.StartDate.Date);
            p.Add("@EndDate",        request.EndDate.Date);
            p.Add("@DocumentNumber", string.IsNullOrWhiteSpace(request.DocumentNumber) ? null : request.DocumentNumber.Trim());
            p.Add("@Notes",          string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());
            p.Add("@RegisteredBy",   CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_InsertEmployeeLeave", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar la ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza el tipo, período, constancia y observaciones de una ausencia
        /// no anulada (cubre prórrogas extendiendo la fecha final).
        /// </summary>
        /// <param name="id">Identificador único de la ausencia a actualizar.</param>
        /// <param name="request">Nuevos datos de la ausencia.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.leaves.update", "Editar ausencias")]
        public IActionResult Update(Guid id, [FromBody] HR.EmployeeLeaveUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",             id);
            p.Add("@LeaveTypeId",    request.LeaveTypeId);
            p.Add("@StartDate",      request.StartDate.Date);
            p.Add("@EndDate",        request.EndDate.Date);
            p.Add("@DocumentNumber", string.IsNullOrWhiteSpace(request.DocumentNumber) ? null : request.DocumentNumber.Trim());
            p.Add("@Notes",          string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_UpdateEmployeeLeave", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Anula una ausencia registrada por error. El registro se conserva
        /// para auditoría pero deja de contar para validaciones y reportes.
        /// </summary>
        /// <param name="id">Identificador único de la ausencia a anular.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/void")]
        [RequirePermission("hr.leaves.void", "Anular ausencias")]
        public IActionResult Void(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_VoidEmployeeLeave", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al anular la ausencia." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una ausencia anulada.
        /// Las ausencias vigentes o finalizadas deben anularse primero.
        /// </summary>
        /// <param name="id">Identificador único de la ausencia a eliminar.</param>
        /// <returns>200 con <see cref="HR.SP_LeaveResult"/> o 400 si hay error.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.leaves.delete", "Eliminar ausencias")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_LeaveResult>("hr.SP_DeleteEmployeeLeave", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la ausencia." });

            return Ok(result);
        }
    }
}
