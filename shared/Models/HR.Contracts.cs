using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR) — Contratos y horas por tipo de trabajo.
    /// </summary>
    public partial class HR
    {
        // ── Contratos de empleados ────────────────────────────────────────────

        /// <summary>
        /// Contrato de un empleado (hr.EmployeeContracts).
        /// Mapea el resultado de hr.SP_GetEmployeeContracts y hr.SP_GetEmployeeContractById.
        /// </summary>
        public class EmployeeContractResponse
        {
            public Guid      Id               { get; set; }
            public Guid      EmployeeId       { get; set; }
            public string    EmployeeCode     { get; set; } = string.Empty;
            public string    EmployeeName     { get; set; } = string.Empty;
            public Guid      ContractTypeId   { get; set; }
            public string    ContractTypeName { get; set; } = string.Empty;
            public DateTime  StartDate        { get; set; }
            /// <summary>Fecha de fin del contrato; null = indefinido.</summary>
            public DateTime? EndDate          { get; set; }
            /// <summary>Base salarial (base de cálculo): Monthly | Hourly | Service.</summary>
            public string    PayUnit          { get; set; } = string.Empty;
            /// <summary>Frecuencia de pago (calendario de nómina): Monthly | Biweekly | Weekly.</summary>
            public string    PayFrequency     { get; set; } = string.Empty;
            /// <summary>Jornada laboral: Day | Night | Mixed; null si no se especificó.</summary>
            public string?   WorkShift        { get; set; }
            /// <summary>Monto pactado por unidad de pago.</summary>
            public decimal   PayRate          { get; set; }
            public Guid?     CurrencyId       { get; set; }
            public string?   CurrencyCode     { get; set; }
            public decimal?  WeeklyHours      { get; set; }
            /// <summary>Estado persistido: Active | Terminated | Renewed.</summary>
            public string    Status           { get; set; } = string.Empty;
            /// <summary>Estado derivado: agrega Expired cuando un contrato activo ya venció.</summary>
            public string    EffectiveStatus  { get; set; } = string.Empty;
            /// <summary>Días restantes hasta el vencimiento (solo contratos activos con fecha de fin).</summary>
            public int?      ExpiresInDays    { get; set; }
            /// <summary>Motivo tipificado de finalización: Resignation | Dismissal | Expiration | MutualAgreement | Other.</summary>
            public string?   TerminationType    { get; set; }
            public string?   TerminationReason  { get; set; }
            /// <summary>Ruta del documento firmado en Blob Storage; null si no se ha subido.</summary>
            public string?   DocumentUrl        { get; set; }
            /// <summary>Nombre original del archivo del documento firmado.</summary>
            public string?   DocumentFileName   { get; set; }
            public string?   Notes              { get; set; }
            /// <summary>Contrato original cuando este es una renovación.</summary>
            public Guid?     PreviousContractId { get; set; }
            public DateTime  CreatedAt          { get; set; }
            public DateTime? UpdatedAt          { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un contrato.</summary>
        public class EmployeeContractRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "El tipo de contrato es requerido.")]
            public Guid ContractTypeId { get; set; }

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            /// <summary>Fecha de fin; omitir para contratos indefinidos.</summary>
            public DateTime? EndDate { get; set; }

            [Required(ErrorMessage = "La base salarial es requerida.")]
            [RegularExpression("^(Monthly|Hourly|Service)$", ErrorMessage = "La base salarial debe ser Monthly, Hourly o Service.")]
            public string PayUnit { get; set; } = "Monthly";

            [Required(ErrorMessage = "La frecuencia de pago es requerida.")]
            [RegularExpression("^(Monthly|Biweekly|Weekly)$", ErrorMessage = "La frecuencia de pago debe ser Monthly, Biweekly o Weekly.")]
            public string PayFrequency { get; set; } = "Monthly";

            /// <summary>Jornada laboral (opcional): Day | Night | Mixed.</summary>
            [RegularExpression("^(Day|Night|Mixed)$", ErrorMessage = "La jornada debe ser Day, Night o Mixed.")]
            public string? WorkShift { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El monto no puede ser negativo.")]
            public decimal PayRate { get; set; }

            public Guid? CurrencyId { get; set; }

            [Range(1, 168, ErrorMessage = "Las horas semanales deben estar entre 1 y 168.")]
            public decimal? WeeklyHours { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar un contrato activo.</summary>
        public class EmployeeContractUpdateRequest
        {
            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            public DateTime? EndDate { get; set; }

            [Required(ErrorMessage = "La base salarial es requerida.")]
            [RegularExpression("^(Monthly|Hourly|Service)$", ErrorMessage = "La salarial debe ser Monthly, Hourly o Service.")]
            public string PayUnit { get; set; } = "Monthly";

            [Required(ErrorMessage = "La frecuencia de pago es requerida.")]
            [RegularExpression("^(Monthly|Biweekly|Weekly)$", ErrorMessage = "La frecuencia de pago debe ser Monthly, Biweekly o Weekly.")]
            public string PayFrequency { get; set; } = "Monthly";

            /// <summary>Jornada laboral (opcional): Day | Night | Mixed.</summary>
            [RegularExpression("^(Day|Night|Mixed)$", ErrorMessage = "La jornada debe ser Day, Night o Mixed.")]
            public string? WorkShift { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El monto no puede ser negativo.")]
            public decimal PayRate { get; set; }

            public Guid? CurrencyId { get; set; }

            [Range(1, 168, ErrorMessage = "Las horas semanales deben estar entre 1 y 168.")]
            public decimal? WeeklyHours { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud para renovar un contrato. Los campos opcionales
        /// en null heredan el valor del contrato original.
        /// </summary>
        public class EmployeeContractRenewRequest
        {
            [Required(ErrorMessage = "La fecha de inicio de la renovación es requerida.")]
            public DateTime StartDate { get; set; }

            public DateTime? EndDate { get; set; }

            [RegularExpression("^(Monthly|Hourly|Service)$", ErrorMessage = "La base salarial debe ser Monthly, Hourly o Service.")]
            public string? PayUnit { get; set; }

            /// <summary>Frecuencia de pago (opcional; hereda del original): Monthly | Biweekly | Weekly.</summary>
            [RegularExpression("^(Monthly|Biweekly|Weekly)$", ErrorMessage = "La frecuencia de pago debe ser Monthly, Biweekly o Weekly.")]
            public string? PayFrequency { get; set; }

            /// <summary>Jornada laboral (opcional; hereda del original): Day | Night | Mixed.</summary>
            [RegularExpression("^(Day|Night|Mixed)$", ErrorMessage = "La jornada debe ser Day, Night o Mixed.")]
            public string? WorkShift { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El monto no puede ser negativo.")]
            public decimal? PayRate { get; set; }

            public Guid? CurrencyId { get; set; }

            [Range(1, 168, ErrorMessage = "Las horas semanales deben estar entre 1 y 168.")]
            public decimal? WeeklyHours { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para terminar anticipadamente un contrato.</summary>
        public class EmployeeContractTerminateRequest
        {
            /// <summary>Fecha de término; omitir para usar la fecha de hoy.</summary>
            public DateTime? EndDate { get; set; }

            /// <summary>Motivo tipificado: Resignation | Dismissal | Expiration | MutualAgreement | Other.</summary>
            [RegularExpression("^(Resignation|Dismissal|Expiration|MutualAgreement|Other)$",
                ErrorMessage = "El motivo debe ser Resignation, Dismissal, Expiration, MutualAgreement u Other.")]
            public string? TerminationType { get; set; }

            /// <summary>Detalle libre del motivo (opcional).</summary>
            [MaxLength(600, ErrorMessage = "El motivo no puede superar 600 caracteres.")]
            public string? Reason { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de contratos.
        /// Usado por hr.SP_InsertEmployeeContract, hr.SP_UpdateEmployeeContract,
        /// hr.SP_RenewEmployeeContract, hr.SP_TerminateEmployeeContract y
        /// hr.SP_DeleteEmployeeContract.
        /// </summary>
        public class SP_ContractResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Tipos de trabajo ──────────────────────────────────────────────────

        /// <summary>
        /// Tipo de trabajo para clasificar horas (hr.WorkTypes).
        /// Mapea el resultado de hr.SP_GetWorkTypes y hr.SP_GetWorkTypeById.
        /// </summary>
        public class WorkTypeResponse
        {
            public Guid      Id             { get; set; }
            public string    Name           { get; set; } = string.Empty;
            public string?   Description    { get; set; }
            /// <summary>Multiplicador sobre la tarifa hora (ej. 1.50 para extras).</summary>
            public decimal   RateMultiplier { get; set; }
            public bool      IsActive       { get; set; }
            public DateTime  CreatedAt      { get; set; }
            public DateTime? UpdatedAt      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un tipo de trabajo.</summary>
        public class WorkTypeRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }

            [Range(0.01, 99.99, ErrorMessage = "El multiplicador debe estar entre 0.01 y 99.99.")]
            public decimal RateMultiplier { get; set; } = 1.00m;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de tipos de trabajo.
        /// Usado por hr.SP_InsertWorkType, hr.SP_UpdateWorkType,
        /// hr.SP_ToggleWorkTypeStatus y hr.SP_DeleteWorkType.
        /// </summary>
        public class SP_WorkTypeResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Registro de horas ─────────────────────────────────────────────────

        /// <summary>
        /// Registro de horas por tipo de trabajo (hr.TimeEntries).
        /// Mapea el resultado de hr.SP_GetTimeEntries.
        /// </summary>
        public class TimeEntryResponse
        {
            public Guid      Id             { get; set; }
            public Guid      EmployeeId     { get; set; }
            public string    EmployeeCode   { get; set; } = string.Empty;
            public string    EmployeeName   { get; set; } = string.Empty;
            public string    DepartmentName { get; set; } = string.Empty;
            public Guid      WorkTypeId     { get; set; }
            public string    WorkTypeName   { get; set; } = string.Empty;
            public decimal   RateMultiplier { get; set; }
            /// <summary>Contrato al que se imputan las horas (opcional).</summary>
            public Guid?     ContractId       { get; set; }
            public string?   ContractTypeName { get; set; }
            public DateTime  WorkDate         { get; set; }
            public decimal   Hours            { get; set; }
            public string?   Description      { get; set; }
            /// <summary>Monto estimado: tarifa hora del contrato × multiplicador × horas (solo contratos por horas).</summary>
            public decimal?  EstimatedAmount  { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para registrar horas de un empleado.</summary>
        public class TimeEntryRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "El tipo de trabajo es requerido.")]
            public Guid WorkTypeId { get; set; }

            [Required(ErrorMessage = "La fecha es requerida.")]
            public DateTime WorkDate { get; set; }

            [Range(0.25, 24, ErrorMessage = "Las horas deben estar entre 0.25 y 24.")]
            public decimal Hours { get; set; }

            /// <summary>Contrato al que se imputan las horas (opcional).</summary>
            public Guid? ContractId { get; set; }

            [MaxLength(600, ErrorMessage = "La descripción no puede superar 600 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resumen de horas por empleado y tipo de trabajo en un rango de fechas.
        /// Mapea el resultado de hr.SP_GetTimeEntriesSummary.
        /// </summary>
        public class TimeEntrySummaryResponse
        {
            public Guid    EmployeeId      { get; set; }
            public string  EmployeeCode    { get; set; } = string.Empty;
            public string  EmployeeName    { get; set; } = string.Empty;
            public string  DepartmentName  { get; set; } = string.Empty;
            public Guid    WorkTypeId      { get; set; }
            public string  WorkTypeName    { get; set; } = string.Empty;
            public decimal RateMultiplier  { get; set; }
            public decimal TotalHours      { get; set; }
            /// <summary>Monto estimado acumulado (0 si el empleado no tiene contrato por horas).</summary>
            public decimal EstimatedAmount { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de registros de horas.
        /// Usado por hr.SP_InsertTimeEntry, hr.SP_UpdateTimeEntry y hr.SP_DeleteTimeEntry.
        /// </summary>
        public class SP_TimeEntryResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Turnos con vigencia ───────────────────────────────────────────────

        /// <summary>
        /// Asignación de turno de un empleado con su período de vigencia.
        /// Mapea el resultado de hr.SP_GetEmployeeScheduleAssignments.
        /// </summary>
        public class EmployeeScheduleAssignmentResponse
        {
            public Guid      Id            { get; set; }
            public Guid      ScheduleId    { get; set; }
            public string    ScheduleName  { get; set; } = string.Empty;
            public TimeSpan  StartTime     { get; set; }
            public TimeSpan  EndTime       { get; set; }
            /// <summary>Días laborables como CSV ISO: 1=lunes … 7=domingo.</summary>
            public string    WorkDays      { get; set; } = string.Empty;
            public DateTime  EffectiveFrom { get; set; }
            /// <summary>Fin de la vigencia; null = vigencia abierta.</summary>
            public DateTime? EffectiveTo   { get; set; }
            /// <summary>Si la asignación está vigente hoy.</summary>
            public bool      IsCurrent     { get; set; }
        }
    }
}
