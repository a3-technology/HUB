using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR) — Asistencia.
    /// </summary>
    public partial class HR
    {
        // ── Feriados ──────────────────────────────────────────────────────────

        /// <summary>
        /// Feriado del calendario laboral (hr.Holidays).
        /// Mapea el resultado de hr.SP_GetHolidays.
        /// </summary>
        public class HolidayResponse
        {
            public Guid      Id          { get; set; }
            public string    Name        { get; set; } = string.Empty;
            public DateTime  HolidayDate { get; set; }
            /// <summary>Si se repite cada año en el mismo día/mes.</summary>
            public bool      IsRecurring { get; set; }
            public DateTime  CreatedAt   { get; set; }
            public DateTime? UpdatedAt   { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un feriado.</summary>
        public class HolidayRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "La fecha es requerida.")]
            public DateTime HolidayDate { get; set; }

            public bool IsRecurring { get; set; }
        }

        // ── Horarios de trabajo ───────────────────────────────────────────────

        /// <summary>
        /// Horario de trabajo (hr.WorkSchedules).
        /// Mapea el resultado de hr.SP_GetWorkSchedules.
        /// </summary>
        public class WorkScheduleResponse
        {
            public Guid      Id               { get; set; }
            public string    Name             { get; set; } = string.Empty;
            public TimeSpan  StartTime        { get; set; }
            public TimeSpan  EndTime          { get; set; }
            public int       ToleranceMinutes { get; set; }
            /// <summary>Días laborables como CSV ISO: 1=lunes … 7=domingo.</summary>
            public string    WorkDays         { get; set; } = string.Empty;
            /// <summary>Horario aplicado a los empleados sin asignación explícita.</summary>
            public bool      IsDefault        { get; set; }
            public bool      IsActive         { get; set; }
            /// <summary>Cantidad de empleados activos asignados explícitamente.</summary>
            public int       AssignedCount    { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un horario.</summary>
        public class WorkScheduleRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "La hora de entrada es requerida.")]
            public TimeSpan StartTime { get; set; }

            [Required(ErrorMessage = "La hora de salida es requerida.")]
            public TimeSpan EndTime { get; set; }

            [Range(0, 120, ErrorMessage = "La tolerancia debe estar entre 0 y 120 minutos.")]
            public int ToleranceMinutes { get; set; } = 10;

            [Required(ErrorMessage = "Los días laborables son requeridos.")]
            [MaxLength(15)]
            public string WorkDays { get; set; } = "1,2,3,4,5";

            public bool IsDefault { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para asignar el turno de un empleado.</summary>
        public class EmployeeScheduleRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            /// <summary>Horario a asignar; null vuelve al horario predeterminado.</summary>
            public Guid? ScheduleId { get; set; }

            /// <summary>Inicio de la vigencia del turno; null = hoy.</summary>
            public DateTime? EffectiveFrom { get; set; }
        }

        // ── Marcajes y estado del día ─────────────────────────────────────────

        /// <summary>
        /// Asistencia de un empleado en una fecha: horario aplicable, marcaje y
        /// estado derivado (cruzado con vacaciones, ausencias y feriados).
        /// Mapea el resultado de hr.SP_GetAttendanceDay.
        /// </summary>
        public class AttendanceDayResponse
        {
            public Guid      EmployeeId       { get; set; }
            public string    EmployeeCode     { get; set; } = string.Empty;
            public string    EmployeeName     { get; set; } = string.Empty;
            public string    DepartmentName   { get; set; } = string.Empty;
            public Guid      ScheduleId       { get; set; }
            public string    ScheduleName     { get; set; } = string.Empty;
            public TimeSpan  StartTime        { get; set; }
            public TimeSpan  EndTime          { get; set; }
            public int       ToleranceMinutes { get; set; }
            public Guid?     RecordId         { get; set; }
            public TimeSpan? CheckIn          { get; set; }
            public TimeSpan? CheckOut         { get; set; }
            public string?   Notes            { get; set; }
            /// <summary>IP pública desde la que se marcó la entrada/salida en el kiosco del login (null si fue corregido manualmente por RR. HH.).</summary>
            public string?   CheckInIp        { get; set; }
            public string?   CheckOutIp       { get; set; }
            /// <summary>Leave | Vacation | Holiday | DayOff | Late | Present | Absent | Pending | Scheduled.</summary>
            public string    Status           { get; set; } = string.Empty;
            /// <summary>Minutos de retraso sobre la hora de entrada (0 si llegó a tiempo).</summary>
            public int       LateMinutes      { get; set; }
            public string?   HolidayName      { get; set; }
            public string?   LeaveTypeName    { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para registrar o corregir un marcaje.</summary>
        public class AttendanceUpsertRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "La fecha es requerida.")]
            public DateTime WorkDate { get; set; }

            public TimeSpan? CheckIn  { get; set; }
            public TimeSpan? CheckOut { get; set; }

            [MaxLength(300, ErrorMessage = "Las notas no pueden superar 300 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Cuerpo del automarcaje desde el kiosco del login: el empleado se
        /// identifica por su código y marca entrada o salida.
        /// </summary>
        public class AttendanceMarkRequest
        {
            [Required(ErrorMessage = "El código de empleado es requerido.")]
            [MaxLength(10, ErrorMessage = "El código no puede superar 10 caracteres.")]
            public string EmployeeCode { get; set; } = string.Empty;

            [Required(ErrorMessage = "El tipo de marcaje es requerido.")]
            [RegularExpression("^(In|Out)$", ErrorMessage = "El tipo debe ser In o Out.")]
            public string Type { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resumen mensual de asistencia de un empleado.
        /// Mapea el resultado de hr.SP_GetAttendanceSummary.
        /// </summary>
        public class AttendanceSummaryResponse
        {
            public Guid   EmployeeId     { get; set; }
            public string EmployeeCode   { get; set; } = string.Empty;
            public string EmployeeName   { get; set; } = string.Empty;
            public string DepartmentName { get; set; } = string.Empty;
            public int    PresentDays    { get; set; }
            public int    LateDays       { get; set; }
            public int    AbsentDays     { get; set; }
            /// <summary>Días cubiertos por vacaciones aprobadas o ausencias vigentes.</summary>
            public int    JustifiedDays  { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de asistencia.
        /// Usado por los SPs de feriados, horarios y marcajes.
        /// </summary>
        public class SP_AttendanceResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
