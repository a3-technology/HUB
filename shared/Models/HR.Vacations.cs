using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR) — Vacaciones.
    /// </summary>
    public partial class HR
    {
        // ── Solicitudes de vacaciones ─────────────────────────────────────────

        /// <summary>
        /// Solicitud de vacaciones retornada por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetVacationRequests y hr.SP_GetVacationRequestById.
        /// </summary>
        public class VacationRequestResponse
        {
            public Guid      Id             { get; set; }
            public Guid      EmployeeId     { get; set; }
            public string    EmployeeCode   { get; set; } = string.Empty;
            public string    EmployeeName   { get; set; } = string.Empty;
            public string    DepartmentName { get; set; } = string.Empty;
            public DateTime  StartDate      { get; set; }
            public DateTime  EndDate        { get; set; }
            /// <summary>Días hábiles (lunes-viernes) calculados por el servidor.</summary>
            public int       RequestedDays  { get; set; }
            public string?   Reason         { get; set; }
            /// <summary>Pending | Approved | Rejected | Cancelled.</summary>
            public string    Status         { get; set; } = string.Empty;
            public Guid?     ReviewedBy     { get; set; }
            public string?   ReviewedByName { get; set; }
            public string?   ReviewComment  { get; set; }
            public DateTime? ReviewedAt     { get; set; }
            public DateTime  CreatedAt      { get; set; }
            public DateTime? UpdatedAt      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear una solicitud de vacaciones.</summary>
        public class VacationRequestCreateRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            [Required(ErrorMessage = "La fecha final es requerida.")]
            public DateTime EndDate { get; set; }

            [MaxLength(500, ErrorMessage = "El motivo no puede superar 500 caracteres.")]
            public string? Reason { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar una solicitud pendiente.</summary>
        public class VacationRequestUpdateRequest
        {
            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            [Required(ErrorMessage = "La fecha final es requerida.")]
            public DateTime EndDate { get; set; }

            [MaxLength(500, ErrorMessage = "El motivo no puede superar 500 caracteres.")]
            public string? Reason { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para aprobar o rechazar una solicitud pendiente.</summary>
        public class VacationReviewRequest
        {
            [Required(ErrorMessage = "El estado de revisión es requerido.")]
            [RegularExpression("^(Approved|Rejected)$", ErrorMessage = "El estado debe ser Approved o Rejected.")]
            public string Status { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "El comentario no puede superar 500 caracteres.")]
            public string? ReviewComment { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de vacaciones.
        /// Usado por hr.SP_InsertVacationRequest, hr.SP_UpdateVacationRequest,
        /// hr.SP_ReviewVacationRequest, hr.SP_CancelVacationRequest,
        /// hr.SP_DeleteVacationRequest y hr.SP_SetVacationBalance.
        /// </summary>
        public class SP_VacationResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Saldos de vacaciones (devengo acumulativo) ────────────────────────

        /// <summary>
        /// Saldo acumulativo de vacaciones de un empleado: los días se acumulan
        /// por mes completo trabajado desde la contratación (tasa configurable)
        /// y no se reinician por año.
        /// Mapea el resultado de hr.SP_GetVacationBalances.
        /// </summary>
        public class VacationBalanceResponse
        {
            public Guid     EmployeeId     { get; set; }
            public string   EmployeeCode   { get; set; } = string.Empty;
            public string   EmployeeName   { get; set; } = string.Empty;
            public string   DepartmentName { get; set; } = string.Empty;
            public DateTime HireDate       { get; set; }
            /// <summary>Meses completos trabajados desde la contratación (incluye la edición manual, si existe).</summary>
            public int      MonthsWorked   { get; set; }
            /// <summary>Días que acumula por mes (hr.Settings).</summary>
            public decimal  AccrualRate    { get; set; }
            /// <summary>Días acumulados a la fecha: meses trabajados × tasa (incluye la edición manual, si existe).</summary>
            public decimal  AccruedDays    { get; set; }
            /// <summary>Días de solicitudes aprobadas (histórico completo).</summary>
            public int      UsedDays       { get; set; }
            /// <summary>Días de solicitudes pendientes de revisión.</summary>
            public int      PendingDays    { get; set; }
            /// <summary>Días disponibles: acumulados − usados − pendientes.</summary>
            public decimal  AvailableDays  { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud para editar directamente el saldo de un empleado.
        /// Los valores fijados reemplazan a los calculados y el devengo mensual
        /// continúa a partir de ellos.
        /// </summary>
        public class VacationBalanceUpdateRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "Los meses trabajados son requeridos.")]
            [Range(0, 600, ErrorMessage = "Los meses trabajados deben estar entre 0 y 600.")]
            public int MonthsWorked { get; set; }

            [Required(ErrorMessage = "Los días acumulados son requeridos.")]
            [Range(0, 999, ErrorMessage = "Los días acumulados deben estar entre 0 y 999.")]
            public decimal AccruedDays { get; set; }
        }

        /// <summary>
        /// Configuración de vacaciones (hr.Settings).
        /// Mapea el resultado de hr.SP_GetVacationSettings.
        /// </summary>
        public class VacationSettingsResponse
        {
            /// <summary>Días de vacaciones que acumula un empleado por mes completo trabajado.</summary>
            public decimal   AccrualDaysPerMonth { get; set; }
            public DateTime? UpdatedAt           { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar la configuración de vacaciones.</summary>
        public class VacationSettingsRequest
        {
            [Required(ErrorMessage = "La acumulación mensual es requerida.")]
            [Range(0, 31, ErrorMessage = "La acumulación mensual debe estar entre 0 y 31 días.")]
            public decimal AccrualDaysPerMonth { get; set; }
        }
    }
}
