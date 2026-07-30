using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR) — Reclutamiento.
    /// Vacantes, candidatos y postulaciones.
    /// </summary>
    public partial class HR
    {
        // ── Vacantes ──────────────────────────────────────────────────────────

        /// <summary>
        /// Vacante retornada por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetVacancies y hr.SP_GetVacancyById.
        /// </summary>
        public class VacancyResponse
        {
            public Guid      Id               { get; set; }
            public string    Title            { get; set; } = string.Empty;
            public string?   Description      { get; set; }
            public Guid      PositionId       { get; set; }
            public string    PositionName     { get; set; } = string.Empty;
            public Guid      DepartmentId     { get; set; }
            public string    DepartmentName   { get; set; } = string.Empty;
            public int       OpeningsCount    { get; set; }
            public decimal?  SalaryMin        { get; set; }
            public decimal?  SalaryMax        { get; set; }
            public Guid?     CurrencyId       { get; set; }
            public string?   CurrencyCode     { get; set; }
            public string?   CurrencySymbol   { get; set; }
            public string    Status           { get; set; } = string.Empty;
            public DateTime  PublishedDate    { get; set; }
            public DateTime? ClosingDate      { get; set; }
            public int       ApplicationCount { get; set; }
            public int       HiredCount       { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una vacante.</summary>
        public class VacancyRequest
        {
            [Required(ErrorMessage = "El título de la vacante es requerido.")]
            [MaxLength(150, ErrorMessage = "El título no puede superar 150 caracteres.")]
            public string Title { get; set; } = string.Empty;

            [MaxLength(1000, ErrorMessage = "La descripción no puede superar 1000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "El cargo es requerido.")]
            public Guid PositionId { get; set; }

            [Required(ErrorMessage = "El departamento es requerido.")]
            public Guid DepartmentId { get; set; }

            [Range(1, int.MaxValue, ErrorMessage = "El número de plazas debe ser al menos 1.")]
            public int OpeningsCount { get; set; } = 1;

            [Range(0, double.MaxValue, ErrorMessage = "El salario mínimo no puede ser negativo.")]
            public decimal? SalaryMin { get; set; }

            [Range(0, double.MaxValue, ErrorMessage = "El salario máximo no puede ser negativo.")]
            public decimal? SalaryMax { get; set; }

            /// <summary>Moneda del rango salarial. Requerida solo si se indica algún salario.</summary>
            public Guid? CurrencyId { get; set; }

            public DateTime? ClosingDate { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para cambiar el estado de una vacante.</summary>
        public class VacancyStatusRequest
        {
            [Required(ErrorMessage = "El estado es requerido.")]
            [RegularExpression("^(Open|OnHold|Closed|Cancelled)$", ErrorMessage = "El estado indicado no es válido.")]
            public string Status { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de vacantes.
        /// Usado por hr.SP_InsertVacancy, hr.SP_UpdateVacancy,
        /// hr.SP_ChangeVacancyStatus y hr.SP_DeleteVacancy.
        /// </summary>
        public class SP_VacancyResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Candidatos ────────────────────────────────────────────────────────

        /// <summary>
        /// Candidato retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetCandidates y hr.SP_GetCandidateById.
        /// </summary>
        public class CandidateResponse
        {
            public Guid      Id               { get; set; }
            public string    FirstName        { get; set; } = string.Empty;
            public string    LastName         { get; set; } = string.Empty;
            public string    Email            { get; set; } = string.Empty;
            public string?   Phone            { get; set; }
            public string?   ResumeUrl        { get; set; }
            public string?   Source           { get; set; }
            public string?   Notes            { get; set; }
            public bool      IsActive         { get; set; }
            public int       ApplicationCount { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un candidato.</summary>
        public class CandidateRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string FirstName { get; set; } = string.Empty;

            [Required(ErrorMessage = "El apellido es requerido.")]
            [MaxLength(100, ErrorMessage = "El apellido no puede superar 100 caracteres.")]
            public string LastName { get; set; } = string.Empty;

            [Required(ErrorMessage = "El correo es requerido.")]
            [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
            [MaxLength(150, ErrorMessage = "El correo no puede superar 150 caracteres.")]
            public string Email { get; set; } = string.Empty;

            [MaxLength(20, ErrorMessage = "El teléfono no puede superar 20 caracteres.")]
            public string? Phone { get; set; }

            [MaxLength(500, ErrorMessage = "La URL del CV no puede superar 500 caracteres.")]
            public string? ResumeUrl { get; set; }

            [MaxLength(100, ErrorMessage = "La fuente no puede superar 100 caracteres.")]
            public string? Source { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de candidatos.
        /// Usado por hr.SP_InsertCandidate, hr.SP_UpdateCandidate,
        /// hr.SP_ToggleCandidateStatus y hr.SP_DeleteCandidate.
        /// </summary>
        public class SP_CandidateResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Postulaciones ─────────────────────────────────────────────────────

        /// <summary>
        /// Postulación retornada por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetApplications y hr.SP_GetApplicationById.
        /// </summary>
        public class ApplicationResponse
        {
            public Guid      Id                 { get; set; }
            public Guid      VacancyId          { get; set; }
            public string    VacancyTitle       { get; set; } = string.Empty;
            public string    VacancyStatus      { get; set; } = string.Empty;
            public string    PositionName       { get; set; } = string.Empty;
            public string    DepartmentName     { get; set; } = string.Empty;
            public Guid      CandidateId        { get; set; }
            public string    CandidateFirstName { get; set; } = string.Empty;
            public string    CandidateLastName  { get; set; } = string.Empty;
            public string    CandidateEmail     { get; set; } = string.Empty;
            public string?   CandidatePhone     { get; set; }
            public string    Stage              { get; set; } = string.Empty;
            public DateTime  AppliedDate        { get; set; }
            public string?   Notes              { get; set; }
            public Guid?     EmployeeId         { get; set; }
            public string?   EmployeeCode       { get; set; }
            public DateTime  CreatedAt          { get; set; }
            public DateTime? UpdatedAt          { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para registrar una postulación.</summary>
        public class ApplicationRequest
        {
            [Required(ErrorMessage = "La vacante es requerida.")]
            public Guid VacancyId { get; set; }

            [Required(ErrorMessage = "El candidato es requerido.")]
            public Guid CandidateId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud para cambiar la etapa de una postulación.
        /// La etapa Hired no se asigna por esta vía: usar el endpoint de contratación.
        /// </summary>
        public class ApplicationStageRequest
        {
            [Required(ErrorMessage = "La etapa es requerida.")]
            [RegularExpression("^(Applied|Screening|Interview|Offer|Rejected)$", ErrorMessage = "La etapa indicada no es válida.")]
            public string Stage { get; set; } = string.Empty;
        }

        /// <summary>
        /// Cuerpo de la solicitud para contratar al candidato de una postulación.
        /// Los datos personales se toman del candidato y el cargo/departamento de la vacante;
        /// aquí solo se piden los datos propios del nuevo empleado.
        /// </summary>
        public class ApplicationHireRequest
        {
            [Required(ErrorMessage = "El código del empleado es requerido.")]
            [MaxLength(10, ErrorMessage = "El código no puede superar 10 caracteres.")]
            public string Code { get; set; } = string.Empty;

            [Required(ErrorMessage = "El tipo de identificación es requerido.")]
            public Guid IdentificationTypeId { get; set; }

            [Required(ErrorMessage = "El número de identificación es requerido.")]
            [MaxLength(50, ErrorMessage = "El número de identificación no puede superar 50 caracteres.")]
            public string IdentificationNumber { get; set; } = string.Empty;

            [Range(0, double.MaxValue, ErrorMessage = "La remuneración no puede ser negativa.")]
            public decimal Salary { get; set; }

            /// <summary>Moneda del salario. Si se omite, se hereda la de la vacante.</summary>
            public Guid? CurrencyId { get; set; }

            [Required(ErrorMessage = "La fecha de contratación es requerida.")]
            public DateTime HireDate { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar las notas de una postulación.</summary>
        public class ApplicationNotesRequest
        {
            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de postulaciones.
        /// Usado por hr.SP_InsertApplication, hr.SP_ChangeApplicationStage,
        /// hr.SP_UpdateApplication y hr.SP_DeleteApplication.
        /// </summary>
        public class SP_ApplicationResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Trazabilidad ──────────────────────────────────────────────────────

        /// <summary>
        /// Transición de etapa de una postulación (línea de tiempo del proceso).
        /// Mapea el resultado de hr.SP_GetApplicationStageHistory.
        /// FromStage null indica el registro inicial de la postulación.
        /// </summary>
        public class ApplicationStageHistoryResponse
        {
            public Guid     Id            { get; set; }
            public Guid     ApplicationId { get; set; }
            public string?  FromStage     { get; set; }
            public string   ToStage       { get; set; } = string.Empty;
            public DateTime ChangedAt     { get; set; }
        }

        /// <summary>
        /// Evento de la trayectoria laboral de un empleado: contratación (Hire)
        /// o cambio de cargo (Position), departamento (Department) o salario (Salary).
        /// Mapea el resultado de hr.SP_GetEmployeeJobHistory.
        /// </summary>
        public class EmployeeJobHistoryResponse
        {
            public Guid     Id         { get; set; }
            public Guid     EmployeeId { get; set; }
            public string   ChangeType { get; set; } = string.Empty;
            public string?  OldValue   { get; set; }
            public string   NewValue   { get; set; } = string.Empty;
            public DateTime ChangedAt  { get; set; }
        }
    }
}
