using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR) — Ausencias e incapacidades.
    /// </summary>
    public partial class HR
    {
        // ── Tipos de ausencia (catálogo) ──────────────────────────────────────

        /// <summary>
        /// Tipo de ausencia del catálogo hr.LeaveTypes (incapacidad por
        /// enfermedad, maternidad, permisos, etc.).
        /// Mapea el resultado de hr.SP_GetLeaveTypes y hr.SP_GetLeaveTypeById.
        /// </summary>
        public class LeaveTypeResponse
        {
            public Guid      Id               { get; set; }
            public string    Name             { get; set; } = string.Empty;
            public string?   Description      { get; set; }
            /// <summary>Indica si la ausencia es remunerada.</summary>
            public bool      IsPaid           { get; set; }
            /// <summary>Indica si exige número de constancia o boleta médica.</summary>
            public bool      RequiresDocument { get; set; }
            public bool      IsActive         { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un tipo de ausencia.</summary>
        public class LeaveTypeRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }

            /// <summary>Indica si la ausencia es remunerada (por defecto sí).</summary>
            public bool IsPaid { get; set; } = true;

            /// <summary>Indica si exige constancia médica (por defecto sí).</summary>
            public bool RequiresDocument { get; set; } = true;
        }

        // ── Ausencias registradas ─────────────────────────────────────────────

        /// <summary>
        /// Ausencia/incapacidad de un empleado retornada por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetEmployeeLeaves y hr.SP_GetEmployeeLeaveById.
        /// </summary>
        public class EmployeeLeaveResponse
        {
            public Guid      Id               { get; set; }
            public Guid      EmployeeId       { get; set; }
            public string    EmployeeCode     { get; set; } = string.Empty;
            public string    EmployeeName     { get; set; } = string.Empty;
            public string    DepartmentName   { get; set; } = string.Empty;
            public Guid      LeaveTypeId      { get; set; }
            public string    LeaveTypeName    { get; set; } = string.Empty;
            public bool      IsPaid           { get; set; }
            public bool      RequiresDocument { get; set; }
            public DateTime  StartDate        { get; set; }
            public DateTime  EndDate          { get; set; }
            /// <summary>Días calendario del período (inclusive).</summary>
            public int       Days             { get; set; }
            /// <summary>Número de constancia o boleta médica.</summary>
            public string?   DocumentNumber   { get; set; }
            public string?   Notes            { get; set; }
            /// <summary>Active (en curso o programada) | Finished | Voided. Derivado por el SP.</summary>
            public string    Status           { get; set; } = string.Empty;
            public Guid?     RegisteredBy     { get; set; }
            public string?   RegisteredByName { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para registrar una ausencia.</summary>
        public class EmployeeLeaveCreateRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "El tipo de ausencia es requerido.")]
            public Guid LeaveTypeId { get; set; }

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            [Required(ErrorMessage = "La fecha final es requerida.")]
            public DateTime EndDate { get; set; }

            [MaxLength(50, ErrorMessage = "El número de constancia no puede superar 50 caracteres.")]
            public string? DocumentNumber { get; set; }

            [MaxLength(500, ErrorMessage = "Las observaciones no pueden superar 500 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar una ausencia no anulada.</summary>
        public class EmployeeLeaveUpdateRequest
        {
            [Required(ErrorMessage = "El tipo de ausencia es requerido.")]
            public Guid LeaveTypeId { get; set; }

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            [Required(ErrorMessage = "La fecha final es requerida.")]
            public DateTime EndDate { get; set; }

            [MaxLength(50, ErrorMessage = "El número de constancia no puede superar 50 caracteres.")]
            public string? DocumentNumber { get; set; }

            [MaxLength(500, ErrorMessage = "Las observaciones no pueden superar 500 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de ausencias.
        /// Usado por hr.SP_InsertLeaveType, hr.SP_UpdateLeaveType,
        /// hr.SP_ToggleLeaveTypeStatus, hr.SP_DeleteLeaveType,
        /// hr.SP_InsertEmployeeLeave, hr.SP_UpdateEmployeeLeave,
        /// hr.SP_VoidEmployeeLeave y hr.SP_DeleteEmployeeLeave.
        /// </summary>
        public class SP_LeaveResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
