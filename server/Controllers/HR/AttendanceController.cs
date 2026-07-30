using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Asistencia.
    /// Expone el control diario de marcajes (entrada/salida) con estado derivado
    /// que cruza vacaciones aprobadas, ausencias/incapacidades vigentes,
    /// feriados y el horario de cada empleado; el resumen mensual; y los
    /// catálogos de horarios de trabajo y feriados.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/attendance")]
    [Authorize(Policy = "hr")]
    public class AttendanceController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public AttendanceController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// IP pública del cliente que hace la solicitud. Si hay un proxy/balanceador
        /// delante (IIS, Nginx) toma la primera IP de "X-Forwarded-For" (la del
        /// cliente original); si no, usa la IP de la conexión directa.
        /// </summary>
        private string? ClientPublicIp()
        {
            var forwarded = Request.Headers["X-Forwarded-For"].ToString();
            if (!string.IsNullOrWhiteSpace(forwarded))
                return forwarded.Split(',')[0].Trim();

            return HttpContext.Connection.RemoteIpAddress?.ToString();
        }

        // ── Marcajes ──────────────────────────────────────────────────────────

        /// <summary>
        /// Retorna la asistencia de una fecha para todos los empleados activos:
        /// horario aplicable, marcaje y estado derivado.
        /// </summary>
        /// <param name="date">Fecha a consultar (por defecto hoy).</param>
        /// <returns>200 con la lista de <see cref="HR.AttendanceDayResponse"/>.</returns>
        [HttpGet("day")]
        public IActionResult GetDay([FromQuery] DateTime? date = null)
        {
            var p = new DynamicParameters();
            p.Add("@Date", (date ?? DateTime.Today).Date);

            var result = _repo.GetAll<HR.AttendanceDayResponse>("hr.SP_GetAttendanceDay", p);
            return Ok(result);
        }

        /// <summary>
        /// Registra o corrige el marcaje de un empleado en una fecha.
        /// Valida orden de horas y que el día no esté cubierto por vacaciones
        /// aprobadas o una ausencia/incapacidad vigente.
        /// </summary>
        /// <param name="request">Empleado, fecha, horas de entrada/salida y notas.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPost("records")]
        [RequirePermission("hr.attendance.record-create", "Registrar/corregir marcajes de asistencia")]
        public IActionResult Upsert([FromBody] HR.AttendanceUpsertRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",   request.EmployeeId);
            p.Add("@WorkDate",     request.WorkDate.Date);
            p.Add("@CheckIn",      request.CheckIn);
            p.Add("@CheckOut",     request.CheckOut);
            p.Add("@Notes",        string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim());
            p.Add("@RegisteredBy", CurrentUserId == Guid.Empty ? (object?)null : CurrentUserId);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_UpsertAttendance", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar el marcaje." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina un marcaje de asistencia.
        /// </summary>
        /// <param name="id">Identificador único del marcaje.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpDelete("records/{id:guid}")]
        [RequirePermission("hr.attendance.record-delete", "Eliminar marcajes de asistencia")]
        public IActionResult DeleteRecord(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_DeleteAttendance", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el marcaje." });

            return Ok(result);
        }

        /// <summary>
        /// Automarcaje público desde el kiosco del login (sin sesión): el
        /// empleado se identifica por su código y registra entrada o salida
        /// con la hora del servidor. Valida vacaciones e incapacidades del día
        /// y el orden de los marcajes.
        /// </summary>
        /// <param name="request">Código del empleado y tipo (In/Out).</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPost("mark")]
        [AllowAnonymous]
        public IActionResult Mark([FromBody] HR.AttendanceMarkRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeCode", request.EmployeeCode.Trim().ToUpper());
            p.Add("@Type",         request.Type);
            p.Add("@Ip",           ClientPublicIp());

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_MarkAttendance", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar el marcaje." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna el resumen mensual de asistencia por empleado: presentes,
        /// tardanzas, ausencias y días justificados.
        /// </summary>
        /// <param name="year">Año a consultar.</param>
        /// <param name="month">Mes a consultar (1-12).</param>
        /// <returns>200 con la lista de <see cref="HR.AttendanceSummaryResponse"/>.</returns>
        [HttpGet("summary")]
        public IActionResult GetSummary([FromQuery] int year, [FromQuery] int month)
        {
            if (month < 1 || month > 12)
                return BadRequest(new { message = "El mes debe estar entre 1 y 12." });

            var p = new DynamicParameters();
            p.Add("@Year",  year);
            p.Add("@Month", month);

            var result = _repo.GetAll<HR.AttendanceSummaryResponse>("hr.SP_GetAttendanceSummary", p);
            return Ok(result);
        }

        // ── Horarios de trabajo ───────────────────────────────────────────────

        /// <summary>
        /// Retorna la lista de horarios de trabajo con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.WorkScheduleResponse"/>.</returns>
        [HttpGet("schedules")]
        public IActionResult GetSchedules([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@OnlyActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.WorkScheduleResponse>("hr.SP_GetWorkSchedules", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea un horario de trabajo. Si se marca como predeterminado,
        /// desmarca el anterior.
        /// </summary>
        /// <param name="request">Nombre, horas, tolerancia y días laborables.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPost("schedules")]
        [RequirePermission("hr.attendance.schedule-create", "Crear horarios de trabajo")]
        public IActionResult InsertSchedule([FromBody] HR.WorkScheduleRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",             request.Name.Trim());
            p.Add("@StartTime",        request.StartTime);
            p.Add("@EndTime",          request.EndTime);
            p.Add("@ToleranceMinutes", request.ToleranceMinutes);
            p.Add("@WorkDays",         request.WorkDays.Trim());
            p.Add("@IsDefault",        request.IsDefault);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_InsertWorkSchedule", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el horario." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un horario de trabajo existente.
        /// </summary>
        /// <param name="id">Identificador único del horario.</param>
        /// <param name="request">Nuevos datos del horario.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPut("schedules/{id:guid}")]
        [RequirePermission("hr.attendance.schedule-update", "Editar horarios de trabajo")]
        public IActionResult UpdateSchedule(Guid id, [FromBody] HR.WorkScheduleRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",               id);
            p.Add("@Name",             request.Name.Trim());
            p.Add("@StartTime",        request.StartTime);
            p.Add("@EndTime",          request.EndTime);
            p.Add("@ToleranceMinutes", request.ToleranceMinutes);
            p.Add("@WorkDays",         request.WorkDays.Trim());
            p.Add("@IsDefault",        request.IsDefault);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_UpdateWorkSchedule", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el horario." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina un horario si no es el predeterminado ni tiene empleados asignados.
        /// </summary>
        /// <param name="id">Identificador único del horario.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpDelete("schedules/{id:guid}")]
        [RequirePermission("hr.attendance.schedule-delete", "Eliminar horarios de trabajo")]
        public IActionResult DeleteSchedule(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_DeleteWorkSchedule", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el horario." });

            return Ok(result);
        }

        /// <summary>
        /// Asigna el turno de un empleado a partir de una fecha (turnos
        /// rotativos): cierra la asignación vigente y crea la nueva. Con
        /// scheduleId null el empleado vuelve al horario predeterminado.
        /// </summary>
        /// <param name="request">Empleado, horario e inicio de vigencia (omitir = hoy).</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPut("schedules/assignment")]
        [RequirePermission("hr.attendance.schedule-assign", "Asignar turnos de trabajo a empleados")]
        public IActionResult AssignSchedule([FromBody] HR.EmployeeScheduleRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",    request.EmployeeId);
            p.Add("@ScheduleId",    request.ScheduleId);
            p.Add("@EffectiveFrom", request.EffectiveFrom?.Date);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_AssignEmployeeSchedule", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al asignar el turno." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna el historial de turnos asignados de un empleado con su
        /// período de vigencia, del más reciente al más antiguo.
        /// </summary>
        /// <param name="employeeId">Identificador único del empleado.</param>
        /// <returns>200 con la lista de <see cref="HR.EmployeeScheduleAssignmentResponse"/>.</returns>
        [HttpGet("schedules/assignments/{employeeId:guid}")]
        public IActionResult GetScheduleAssignments(Guid employeeId)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", employeeId);

            var result = _repo.GetAll<HR.EmployeeScheduleAssignmentResponse>("hr.SP_GetEmployeeScheduleAssignments", p);
            return Ok(result);
        }

        // ── Feriados ──────────────────────────────────────────────────────────

        /// <summary>
        /// Retorna la lista de feriados ordenados por fecha.
        /// </summary>
        /// <returns>200 con la lista de <see cref="HR.HolidayResponse"/>.</returns>
        [HttpGet("holidays")]
        public IActionResult GetHolidays()
        {
            var result = _repo.GetAll<HR.HolidayResponse>("hr.SP_GetHolidays", new DynamicParameters());
            return Ok(result);
        }

        /// <summary>
        /// Crea un feriado validando fecha única.
        /// </summary>
        /// <param name="request">Nombre, fecha y recurrencia anual.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPost("holidays")]
        [RequirePermission("hr.attendance.holiday-create", "Crear feriados")]
        public IActionResult InsertHoliday([FromBody] HR.HolidayRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@HolidayDate", request.HolidayDate.Date);
            p.Add("@IsRecurring", request.IsRecurring);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_InsertHoliday", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el feriado." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un feriado existente.
        /// </summary>
        /// <param name="id">Identificador único del feriado.</param>
        /// <param name="request">Nuevos datos del feriado.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpPut("holidays/{id:guid}")]
        [RequirePermission("hr.attendance.holiday-update", "Editar feriados")]
        public IActionResult UpdateHoliday(Guid id, [FromBody] HR.HolidayRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@HolidayDate", request.HolidayDate.Date);
            p.Add("@IsRecurring", request.IsRecurring);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_UpdateHoliday", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el feriado." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un feriado.
        /// </summary>
        /// <param name="id">Identificador único del feriado.</param>
        /// <returns>200 con <see cref="HR.SP_AttendanceResult"/> o 400 si hay error.</returns>
        [HttpDelete("holidays/{id:guid}")]
        [RequirePermission("hr.attendance.holiday-delete", "Eliminar feriados")]
        public IActionResult DeleteHoliday(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_AttendanceResult>("hr.SP_DeleteHoliday", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el feriado." });

            return Ok(result);
        }
    }
}
