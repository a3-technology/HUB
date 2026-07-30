using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Registro de horas.
    /// Gestiona las horas trabajadas por empleado clasificadas por tipo de
    /// trabajo (ordinaria, extra, nocturna…), con imputación opcional a un
    /// contrato y monto estimado para contratos por horas. Complementa la
    /// asistencia: el marcaje indica cuándo estuvo el empleado; este registro,
    /// cuántas horas y de qué tipo, insumo directo para la nómina.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/time-entries")]
    [Authorize(Policy = "hr")]
    public class TimeEntriesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TimeEntriesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna los registros de horas de un rango de fechas con filtros opcionales.
        /// </summary>
        /// <param name="from">Fecha inicial del rango (requerida).</param>
        /// <param name="to">Fecha final del rango (requerida).</param>
        /// <param name="employeeId">Filtra por empleado (omitir = todos).</param>
        /// <param name="workTypeId">Filtra por tipo de trabajo (omitir = todos).</param>
        /// <returns>200 con la lista de <see cref="HR.TimeEntryResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] DateTime from, [FromQuery] DateTime to,
                                    [FromQuery] Guid? employeeId = null,
                                    [FromQuery] Guid? workTypeId = null)
        {
            if (to < from)
                return BadRequest(new { message = "La fecha final no puede ser anterior a la inicial." });

            var p = new DynamicParameters();
            p.Add("@FromDate",   from.Date);
            p.Add("@ToDate",     to.Date);
            p.Add("@EmployeeId", employeeId);
            p.Add("@WorkTypeId", workTypeId);

            var result = _repo.GetAll<HR.TimeEntryResponse>("hr.SP_GetTimeEntries", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna el resumen de horas por empleado y tipo de trabajo en un rango,
        /// con el monto estimado para contratos por horas.
        /// </summary>
        /// <param name="from">Fecha inicial del rango (requerida).</param>
        /// <param name="to">Fecha final del rango (requerida).</param>
        /// <param name="employeeId">Filtra por empleado (omitir = todos).</param>
        /// <returns>200 con la lista de <see cref="HR.TimeEntrySummaryResponse"/>.</returns>
        [HttpGet("summary")]
        public IActionResult GetSummary([FromQuery] DateTime from, [FromQuery] DateTime to,
                                        [FromQuery] Guid? employeeId = null)
        {
            if (to < from)
                return BadRequest(new { message = "La fecha final no puede ser anterior a la inicial." });

            var p = new DynamicParameters();
            p.Add("@FromDate",   from.Date);
            p.Add("@ToDate",     to.Date);
            p.Add("@EmployeeId", employeeId);

            var result = _repo.GetAll<HR.TimeEntrySummaryResponse>("hr.SP_GetTimeEntriesSummary", p);
            return Ok(result);
        }

        /// <summary>
        /// Registra horas de un empleado validando tipo de trabajo activo,
        /// tope diario de 24 horas y pertenencia del contrato imputado.
        /// </summary>
        /// <param name="request">Empleado, tipo de trabajo, fecha, horas y contrato opcional.</param>
        /// <returns>200 con <see cref="HR.SP_TimeEntryResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("hr.time-entries.create", "Registrar horas trabajadas")]
        public IActionResult Insert([FromBody] HR.TimeEntryRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",   request.EmployeeId);
            p.Add("@WorkTypeId",   request.WorkTypeId);
            p.Add("@WorkDate",     request.WorkDate.Date);
            p.Add("@Hours",        request.Hours);
            p.Add("@ContractId",   request.ContractId);
            p.Add("@Description",  string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim());
            p.Add("@RegisteredBy", CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_TimeEntryResult>("hr.SP_InsertTimeEntry", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar las horas." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un registro de horas con las mismas validaciones del alta.
        /// </summary>
        /// <param name="id">Identificador único del registro de horas.</param>
        /// <param name="request">Nuevos datos del registro (el empleado no cambia).</param>
        /// <returns>200 con <see cref="HR.SP_TimeEntryResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.time-entries.update", "Editar registros de horas trabajadas")]
        public IActionResult Update(Guid id, [FromBody] HR.TimeEntryRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@WorkTypeId",  request.WorkTypeId);
            p.Add("@WorkDate",    request.WorkDate.Date);
            p.Add("@Hours",       request.Hours);
            p.Add("@ContractId",  request.ContractId);
            p.Add("@Description", string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim());

            var result = _repo.Get<HR.SP_TimeEntryResult>("hr.SP_UpdateTimeEntry", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el registro de horas." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un registro de horas.
        /// </summary>
        /// <param name="id">Identificador único del registro de horas.</param>
        /// <returns>200 con <see cref="HR.SP_TimeEntryResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.time-entries.delete", "Eliminar registros de horas trabajadas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_TimeEntryResult>("hr.SP_DeleteTimeEntry", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el registro de horas." });

            return Ok(result);
        }
    }
}
