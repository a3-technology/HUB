using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Vacaciones.
    /// Expone las solicitudes de vacaciones con flujo de aprobación
    /// (pendiente → aprobada/rechazada/cancelada) y la gestión de saldos
    /// anuales por empleado.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/vacations")]
    [Authorize(Policy = "hr")]
    public class VacationsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public VacationsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        // ── Solicitudes ───────────────────────────────────────────────────────

        /// <summary>
        /// Retorna la lista de solicitudes de vacaciones con filtros opcionales.
        /// </summary>
        /// <param name="status">Filtro por estado: Pending | Approved | Rejected | Cancelled.</param>
        /// <param name="employeeId">Filtro por empleado.</param>
        /// <param name="year">Filtro por año de la fecha de inicio.</param>
        /// <returns>200 con la lista de <see cref="HR.VacationRequestResponse"/>.</returns>
        [HttpGet("requests")]
        public IActionResult GetRequests(
            [FromQuery] string? status = null,
            [FromQuery] Guid? employeeId = null,
            [FromQuery] int? year = null)
        {
            var p = new DynamicParameters();
            p.Add("@Status",     status);
            p.Add("@EmployeeId", employeeId);
            p.Add("@Year",       year);

            var result = _repo.GetAll<HR.VacationRequestResponse>("hr.SP_GetVacationRequests", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una solicitud de vacaciones por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la solicitud.</param>
        /// <returns>200 con <see cref="HR.VacationRequestResponse"/> o 404 si no existe.</returns>
        [HttpGet("requests/{id:guid}")]
        public IActionResult GetRequestById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.VacationRequestResponse>("hr.SP_GetVacationRequestById", p);
            if (result is null)
                return NotFound(new { message = "Solicitud de vacaciones no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Crea una solicitud de vacaciones. El servidor calcula los días hábiles
        /// y valida solapamiento y saldo disponible del año.
        /// </summary>
        /// <param name="request">Empleado, período y motivo de la solicitud.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error de validación.</returns>
        [HttpPost("requests")]
        [RequirePermission("hr.vacations.request-create", "Crear solicitudes de vacaciones")]
        public IActionResult InsertRequest([FromBody] HR.VacationRequestCreateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", request.EmployeeId);
            p.Add("@StartDate",  request.StartDate.Date);
            p.Add("@EndDate",    request.EndDate.Date);
            p.Add("@Reason",     string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim());

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_InsertVacationRequest", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la solicitud de vacaciones." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza el período y motivo de una solicitud pendiente.
        /// Revalida días hábiles, solapamiento y saldo.
        /// </summary>
        /// <param name="id">Identificador único de la solicitud a actualizar.</param>
        /// <param name="request">Nuevo período y motivo.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpPut("requests/{id:guid}")]
        [RequirePermission("hr.vacations.request-update", "Editar solicitudes de vacaciones")]
        public IActionResult UpdateRequest(Guid id, [FromBody] HR.VacationRequestUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",        id);
            p.Add("@StartDate", request.StartDate.Date);
            p.Add("@EndDate",   request.EndDate.Date);
            p.Add("@Reason",    string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim());

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_UpdateVacationRequest", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la solicitud de vacaciones." });

            return Ok(result);
        }

        /// <summary>
        /// Aprueba o rechaza una solicitud pendiente. El revisor se toma
        /// del usuario autenticado en el JWT.
        /// </summary>
        /// <param name="id">Identificador único de la solicitud a revisar.</param>
        /// <param name="request">Nuevo estado (Approved/Rejected) y comentario opcional.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpPatch("requests/{id:guid}/review")]
        [RequirePermission("hr.vacations.request-review", "Aprobar/rechazar solicitudes de vacaciones")]
        public IActionResult ReviewRequest(Guid id, [FromBody] HR.VacationReviewRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",            id);
            p.Add("@Status",        request.Status);
            p.Add("@ReviewedBy",    CurrentUserId);
            p.Add("@ReviewComment", string.IsNullOrWhiteSpace(request.ReviewComment) ? null : request.ReviewComment.Trim());

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_ReviewVacationRequest", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al revisar la solicitud de vacaciones." });

            return Ok(result);
        }

        /// <summary>
        /// Cancela una solicitud pendiente o aprobada, liberando el saldo reservado.
        /// </summary>
        /// <param name="id">Identificador único de la solicitud a cancelar.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpPatch("requests/{id:guid}/cancel")]
        [RequirePermission("hr.vacations.request-cancel", "Cancelar solicitudes de vacaciones")]
        public IActionResult CancelRequest(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_CancelVacationRequest", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cancelar la solicitud de vacaciones." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una solicitud de vacaciones.
        /// Las solicitudes aprobadas deben cancelarse primero.
        /// </summary>
        /// <param name="id">Identificador único de la solicitud a eliminar.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpDelete("requests/{id:guid}")]
        [RequirePermission("hr.vacations.request-delete", "Eliminar solicitudes de vacaciones")]
        public IActionResult DeleteRequest(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_DeleteVacationRequest", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la solicitud de vacaciones." });

            return Ok(result);
        }

        // ── Saldos (devengo acumulativo) ──────────────────────────────────────

        /// <summary>
        /// Retorna el saldo acumulativo de vacaciones de los empleados activos:
        /// meses trabajados, días acumulados (meses × tasa mensual), usados,
        /// pendientes y disponibles. El saldo no se reinicia por año.
        /// Si el saldo fue editado manualmente, meses y acumulados ya lo incluyen.
        /// </summary>
        /// <param name="employeeId">Filtro opcional por empleado.</param>
        /// <returns>200 con la lista de <see cref="HR.VacationBalanceResponse"/>.</returns>
        [HttpGet("balances")]
        public IActionResult GetBalances([FromQuery] Guid? employeeId = null)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", employeeId);

            var result = _repo.GetAll<HR.VacationBalanceResponse>("hr.SP_GetVacationBalances", p);
            return Ok(result);
        }

        /// <summary>
        /// Edita directamente el saldo de un empleado fijando los meses trabajados
        /// y los días acumulados. El servidor guarda la diferencia contra el
        /// cálculo automático para que el devengo mensual continúe desde los
        /// valores fijados.
        /// </summary>
        /// <param name="request">Empleado, meses trabajados y días acumulados.</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpPut("balances")]
        [RequirePermission("hr.vacations.balance-update", "Ajustar saldos de vacaciones")]
        public IActionResult UpdateBalance([FromBody] HR.VacationBalanceUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",   request.EmployeeId);
            p.Add("@MonthsWorked", request.MonthsWorked);
            p.Add("@AccruedDays",  request.AccruedDays);
            p.Add("@UpdatedBy",    CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_SetVacationBalance", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el saldo de vacaciones." });

            return Ok(result);
        }

        // ── Configuración ─────────────────────────────────────────────────────

        /// <summary>
        /// Retorna la configuración de vacaciones: días que acumula un empleado
        /// por cada mes completo trabajado.
        /// </summary>
        /// <returns>200 con <see cref="HR.VacationSettingsResponse"/>.</returns>
        [HttpGet("settings")]
        public IActionResult GetSettings()
        {
            var result = _repo.Get<HR.VacationSettingsResponse>("hr.SP_GetVacationSettings", new DynamicParameters());
            if (result is null)
                return NotFound(new { message = "Configuración de vacaciones no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza la tasa de acumulación mensual de días de vacaciones.
        /// </summary>
        /// <param name="request">Días acumulados por mes (0 a 31).</param>
        /// <returns>200 con <see cref="HR.SP_VacationResult"/> o 400 si hay error.</returns>
        [HttpPut("settings")]
        [RequirePermission("hr.vacations.settings-update", "Editar configuración de vacaciones")]
        public IActionResult UpdateSettings([FromBody] HR.VacationSettingsRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@AccrualDaysPerMonth", request.AccrualDaysPerMonth);

            var result = _repo.Get<HR.SP_VacationResult>("hr.SP_UpdateVacationSettings", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la configuración de vacaciones." });

            return Ok(result);
        }
    }
}
