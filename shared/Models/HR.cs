using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos (HR).
    /// </summary>
    public partial class HR
    {
        // ── Departamentos ─────────────────────────────────────────────────────

        /// <summary>
        /// Departamento retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetDepartments y hr.SP_GetDepartmentById.
        /// </summary>
        public class DepartmentResponse
        {
            public Guid      Id          { get; set; }
            public string    Name        { get; set; } = string.Empty;
            public string?   Description { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un departamento.</summary>
        public class DepartmentRequest
        {
            [Required(ErrorMessage = "El nombre del departamento es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de departamentos.
        /// Usado por hr.SP_InsertDepartment, hr.SP_UpdateDepartment y hr.SP_ToggleDepartmentStatus.
        /// </summary>
        public class SP_DepartmentResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Tipos de identificación ───────────────────────────────────────────

        /// <summary>
        /// Tipo de identificación retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetIdentificationTypes y hr.SP_GetIdentificationTypeById.
        /// </summary>
        public class IdentificationTypeResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un tipo de identificación.</summary>
        public class IdentificationTypeRequest
        {
            [Required(ErrorMessage = "El nombre del tipo de identificación es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de tipos de identificación.
        /// Usado por hr.SP_InsertIdentificationType, hr.SP_UpdateIdentificationType
        /// y hr.SP_ToggleIdentificationTypeStatus.
        /// </summary>
        public class SP_IdentificationTypeResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Cargos ────────────────────────────────────────────────────────────

        /// <summary>
        /// Cargo retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetPositions y hr.SP_GetPositionById.
        /// </summary>
        public class PositionResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un cargo.</summary>
        public class PositionRequest
        {
            [Required(ErrorMessage = "El nombre del cargo es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de cargos.
        /// Usado por hr.SP_InsertPosition, hr.SP_UpdatePosition y hr.SP_TogglePositionStatus.
        /// </summary>
        public class SP_PositionResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Empleados ─────────────────────────────────────────────────────────

        /// <summary>
        /// Empleado retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetEmployees y hr.SP_GetEmployeeById.
        /// </summary>
        public class EmployeeResponse
        {
            public Guid      Id             { get; set; }
            public string    Code           { get; set; } = string.Empty;
            public string    FirstName      { get; set; } = string.Empty;
            public string    LastName       { get; set; } = string.Empty;
            public string    Email          { get; set; } = string.Empty;
            /// <summary>Teléfono de contacto; null si no se ha registrado.</summary>
            public string?   Phone          { get; set; }
            /// <summary>Dirección domiciliar; null si no se ha registrado.</summary>
            public string?   Address        { get; set; }
            /// <summary>Fecha de nacimiento; null si no se ha registrado.</summary>
            public DateTime? BirthDate      { get; set; }
            public Guid      IdentificationTypeId   { get; set; }
            public string    IdentificationTypeName { get; set; } = string.Empty;
            public string    IdentificationNumber   { get; set; } = string.Empty;
            public decimal   Salary         { get; set; }
            public Guid?     CurrencyId     { get; set; }
            public string?   CurrencyCode   { get; set; }
            public string?   CurrencySymbol { get; set; }
            public Guid      PositionId     { get; set; }
            public string    PositionName   { get; set; } = string.Empty;
            public Guid      DepartmentId   { get; set; }
            public string    DepartmentName { get; set; } = string.Empty;
            /// <summary>Modalidad de trabajo (hr.WorkModalities); null si no se ha registrado.</summary>
            public Guid?     WorkModalityId   { get; set; }
            public string?   WorkModalityName { get; set; }
            /// <summary>Tipo de contrato (hr.ContractTypes); null si no se ha registrado.</summary>
            public Guid?     ContractTypeId   { get; set; }
            public string?   ContractTypeName { get; set; }
            /// <summary>Base salarial del contrato activo (Monthly | Hourly | Service); null si no tiene contrato.</summary>
            public string?   PayUnit          { get; set; }
            /// <summary>Frecuencia de pago del contrato activo (Monthly | Biweekly | Weekly); null si no tiene contrato.</summary>
            public string?   PayFrequency     { get; set; }
            /// <summary>Jornada laboral del contrato activo (Day | Night | Mixed); null si no se especificó.</summary>
            public string?   WorkShift        { get; set; }
            /// <summary>Banco de la cuenta de nómina (hr.Banks); null si no se ha registrado.</summary>
            public Guid?     BankId            { get; set; }
            public string?   BankName          { get; set; }
            /// <summary>Número de cuenta bancaria de nómina; null si no se ha registrado.</summary>
            public string?   BankAccountNumber { get; set; }
            public DateTime  HireDate       { get; set; }
            public bool      IsActive       { get; set; }
            /// <summary>CV del candidato de origen (contratación de reclutamiento); null si no aplica.</summary>
            public string?   ResumeUrl      { get; set; }
            /// <summary>Ruta de la foto del empleado en Blob Storage; null si no tiene foto.</summary>
            public string?   PhotoUrl       { get; set; }
            public DateTime  CreatedAt      { get; set; }
            public DateTime? UpdatedAt      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un empleado.</summary>
        public class EmployeeRequest
        {
            [Required(ErrorMessage = "El código del empleado es requerido.")]
            [MaxLength(10, ErrorMessage = "El código no puede superar 10 caracteres.")]
            public string Code { get; set; } = string.Empty;

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

            /// <summary>Teléfono de contacto (opcional).</summary>
            [MaxLength(40, ErrorMessage = "El teléfono no puede superar 40 caracteres.")]
            public string? Phone { get; set; }

            /// <summary>Dirección domiciliar (opcional).</summary>
            [MaxLength(500, ErrorMessage = "La dirección no puede superar 500 caracteres.")]
            public string? Address { get; set; }

            /// <summary>Fecha de nacimiento (opcional).</summary>
            public DateTime? BirthDate { get; set; }

            [Required(ErrorMessage = "El tipo de identificación es requerido.")]
            public Guid IdentificationTypeId { get; set; }

            [Required(ErrorMessage = "El número de identificación es requerido.")]
            [MaxLength(50, ErrorMessage = "El número de identificación no puede superar 50 caracteres.")]
            public string IdentificationNumber { get; set; } = string.Empty;

            [Range(0, double.MaxValue, ErrorMessage = "La remuneración no puede ser negativa.")]
            public decimal Salary { get; set; }

            [Required(ErrorMessage = "La moneda del salario es requerida.")]
            public Guid CurrencyId { get; set; }

            [Required(ErrorMessage = "El cargo es requerido.")]
            public Guid PositionId { get; set; }

            [Required(ErrorMessage = "El departamento es requerido.")]
            public Guid DepartmentId { get; set; }

            /// <summary>Modalidad de trabajo (opcional).</summary>
            public Guid? WorkModalityId { get; set; }

            /// <summary>Tipo de contrato (opcional).</summary>
            public Guid? ContractTypeId { get; set; }

            /// <summary>Base salarial de la remuneración: Monthly | Hourly | Service.</summary>
            [RegularExpression("^(Monthly|Hourly|Service)$", ErrorMessage = "La base salarial debe ser Monthly, Hourly o Service.")]
            public string PayUnit { get; set; } = "Monthly";

            /// <summary>Frecuencia de pago de la nómina: Monthly | Biweekly | Weekly.</summary>
            [RegularExpression("^(Monthly|Biweekly|Weekly)$", ErrorMessage = "La frecuencia de pago debe ser Monthly, Biweekly o Weekly.")]
            public string PayFrequency { get; set; } = "Monthly";

            /// <summary>Jornada laboral (opcional): Day | Night | Mixed.</summary>
            [RegularExpression("^(Day|Night|Mixed)$", ErrorMessage = "La jornada debe ser Day, Night o Mixed.")]
            public string? WorkShift { get; set; }

            /// <summary>Banco de la cuenta de nómina (opcional).</summary>
            public Guid? BankId { get; set; }

            /// <summary>Número de cuenta bancaria de nómina (opcional).</summary>
            [MaxLength(50, ErrorMessage = "El número de cuenta no puede superar 50 caracteres.")]
            public string? BankAccountNumber { get; set; }

            [Required(ErrorMessage = "La fecha de contratación es requerida.")]
            public DateTime HireDate { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud de autoservicio para que un empleado actualice
        /// sus propios datos de contacto. Deliberadamente acotado a teléfono y
        /// dirección — el resto de la ficha (salario, cargo, banco, etc.) solo se
        /// edita desde el módulo de RR. HH.
        /// </summary>
        public class EmployeeSelfUpdateRequest
        {
            /// <summary>Teléfono de contacto (opcional).</summary>
            [MaxLength(40, ErrorMessage = "El teléfono no puede superar 40 caracteres.")]
            public string? Phone { get; set; }

            /// <summary>Dirección domiciliar (opcional).</summary>
            [MaxLength(500, ErrorMessage = "La dirección no puede superar 500 caracteres.")]
            public string? Address { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de empleados.
        /// Usado por hr.SP_InsertEmployee, hr.SP_UpdateEmployee y hr.SP_ToggleEmployeeStatus.
        /// </summary>
        public class SP_EmployeeResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Bancos ────────────────────────────────────────────────────────────

        /// <summary>
        /// Banco retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetBanks y hr.SP_GetBankById.
        /// </summary>
        public class BankResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un banco.</summary>
        public class BankRequest
        {
            [Required(ErrorMessage = "El nombre del banco es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de bancos.
        /// Usado por hr.SP_InsertBank, hr.SP_UpdateBank,
        /// hr.SP_ToggleBankStatus y hr.SP_DeleteBank.
        /// </summary>
        public class SP_BankResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Modalidades de trabajo ────────────────────────────────────────────

        /// <summary>
        /// Modalidad de trabajo retornada por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetWorkModalities y hr.SP_GetWorkModalityById.
        /// </summary>
        public class WorkModalityResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una modalidad de trabajo.</summary>
        public class WorkModalityRequest
        {
            [Required(ErrorMessage = "El nombre de la modalidad de trabajo es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de modalidades de trabajo.
        /// Usado por hr.SP_InsertWorkModality, hr.SP_UpdateWorkModality,
        /// hr.SP_ToggleWorkModalityStatus y hr.SP_DeleteWorkModality.
        /// </summary>
        public class SP_WorkModalityResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Tipos de contrato ─────────────────────────────────────────────────

        /// <summary>
        /// Tipo de contrato retornado por los SPs de consulta.
        /// Mapea el resultado de hr.SP_GetContractTypes y hr.SP_GetContractTypeById.
        /// </summary>
        public class ContractTypeResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un tipo de contrato.</summary>
        public class ContractTypeRequest
        {
            [Required(ErrorMessage = "El nombre del tipo de contrato es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de tipos de contrato.
        /// Usado por hr.SP_InsertContractType, hr.SP_UpdateContractType,
        /// hr.SP_ToggleContractTypeStatus y hr.SP_DeleteContractType.
        /// </summary>
        public class SP_ContractTypeResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Expediente documental del empleado ────────────────────────────────

        /// <summary>
        /// Documento del expediente de un empleado (CV, récord policial,
        /// identificación, títulos, contratos).
        /// Mapea el resultado de hr.SP_GetEmployeeDocuments y hr.SP_GetEmployeeDocumentById.
        /// </summary>
        public class EmployeeDocumentResponse
        {
            public Guid     Id               { get; set; }
            public Guid     EmployeeId       { get; set; }
            public Guid     DocumentTypeId   { get; set; }
            public string   DocumentTypeName { get; set; } = string.Empty;
            public string   FileName         { get; set; } = string.Empty;
            /// <summary>Ruta del archivo en Blob Storage (hr/employees/{id}/docs/{archivo}).</summary>
            public string   BlobPath         { get; set; } = string.Empty;
            public long?    FileSize         { get; set; }
            public DateTime CreatedAt        { get; set; }
        }

        // ── Tipos de documento (catálogo) ─────────────────────────────────────

        /// <summary>
        /// Tipo de documento del catálogo del expediente.
        /// Mapea el resultado de hr.SP_GetDocumentTypes.
        /// </summary>
        public class DocumentTypeResponse
        {
            public Guid      Id            { get; set; }
            public string    Name          { get; set; } = string.Empty;
            public string?   Description   { get; set; }
            public bool      IsActive      { get; set; }
            public int       DocumentCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un tipo de documento.</summary>
        public class DocumentTypeRequest
        {
            [Required(ErrorMessage = "El nombre del tipo de documento es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }
    }
}
