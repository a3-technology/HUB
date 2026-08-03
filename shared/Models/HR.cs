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
            /// <summary>País del empleado (hr.Countries); null si no se ha registrado.</summary>
            public Guid?     CountryId      { get; set; }
            public string?   CountryName    { get; set; }
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

            /// <summary>País del empleado (opcional).</summary>
            public Guid? CountryId { get; set; }

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

        // ── Países (catálogo de solo lectura, sembrado con la lista completa) ──

        /// <summary>
        /// País retornado por hr.SP_GetCountries. Catálogo sin pantalla de
        /// administración: se elige de la lista ya sembrada, igual que Moneda.
        /// </summary>
        public class CountryResponse
        {
            public Guid      Id        { get; set; }
            public string    Name      { get; set; } = string.Empty;
            public string?   IsoCode   { get; set; }
            public bool      IsActive  { get; set; }
            public DateTime  CreatedAt { get; set; }
            public DateTime? UpdatedAt { get; set; }
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

        // ── Conceptos de nómina ───────────────────────────────────────────────
        // El cálculo de nómina es un motor parametrizable por datos: el catálogo
        // de conceptos define ingresos, deducciones y aportes patronales con su
        // método de cálculo (fijo, porcentual con tope o escala progresiva), por
        // lo que la nómina de cualquier país se modela solo con configuración.

        /// <summary>
        /// Concepto del catálogo de nómina.
        /// Mapea el resultado de hr.SP_GetPayrollConcepts.
        /// </summary>
        public class PayrollConceptResponse
        {
            public Guid      Id                  { get; set; }
            public string    Code                { get; set; } = string.Empty;
            public string    Name                { get; set; } = string.Empty;
            /// <summary>Earning | Deduction | EmployerContribution.</summary>
            public string    ConceptType         { get; set; } = string.Empty;
            /// <summary>Fixed | Percent | Brackets.</summary>
            public string    CalcType            { get; set; } = string.Empty;
            /// <summary>BaseSalary | Gross | Taxable (para Percent/Brackets).</summary>
            public string?   BaseType            { get; set; }
            public decimal?  DefaultAmount       { get; set; }
            public decimal?  Percentage          { get; set; }
            public decimal?  BaseCapAmount       { get; set; }
            public decimal?  AnnualizationFactor { get; set; }
            public bool      AffectsTaxable      { get; set; }
            public bool      AppliesToAll        { get; set; }
            public int       CalcOrder           { get; set; }
            public bool      IsActive            { get; set; }
            public int       BracketCount        { get; set; }
            public int      AssignedCount        { get; set; }
            public DateTime  CreatedAt           { get; set; }
            public DateTime? UpdatedAt           { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un concepto.</summary>
        public class PayrollConceptRequest
        {
            [Required(ErrorMessage = "El código es requerido.")]
            [MaxLength(20, ErrorMessage = "El código no puede superar 20 caracteres.")]
            public string Code { get; set; } = string.Empty;

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(150, ErrorMessage = "El nombre no puede superar 150 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "El tipo de concepto es requerido.")]
            [RegularExpression("^(Earning|Deduction|EmployerContribution)$", ErrorMessage = "Tipo de concepto inválido.")]
            public string ConceptType { get; set; } = "Earning";

            [Required(ErrorMessage = "El método de cálculo es requerido.")]
            [RegularExpression("^(Fixed|Percent|Brackets)$", ErrorMessage = "Método de cálculo inválido.")]
            public string CalcType { get; set; } = "Fixed";

            [RegularExpression("^(BaseSalary|Gross|Taxable)$", ErrorMessage = "Base de cálculo inválida.")]
            public string? BaseType { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El monto no puede ser negativo.")]
            public decimal? DefaultAmount { get; set; }

            [Range(0, 100, ErrorMessage = "El porcentaje debe estar entre 0 y 100.")]
            public decimal? Percentage { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El tope no puede ser negativo.")]
            public decimal? BaseCapAmount { get; set; }

            [Range(0.0001, 1000, ErrorMessage = "El factor de anualización debe ser mayor que cero.")]
            public decimal? AnnualizationFactor { get; set; }

            public bool AffectsTaxable { get; set; }
            public bool AppliesToAll   { get; set; }

            [Range(0, 9999, ErrorMessage = "El orden debe estar entre 0 y 9999.")]
            public int CalcOrder { get; set; } = 100;
        }

        /// <summary>
        /// Tramo de la escala progresiva de un concepto.
        /// Mapea el resultado de hr.SP_GetPayrollConceptBrackets.
        /// </summary>
        public class PayrollBracketResponse
        {
            public Guid     Id          { get; set; }
            public Guid     ConceptId   { get; set; }
            public decimal  LowerLimit  { get; set; }
            public decimal? UpperLimit  { get; set; }
            public decimal  FixedQuota  { get; set; }
            public decimal  RatePercent { get; set; }
        }

        /// <summary>Tramo enviado al reemplazar la escala completa de un concepto.</summary>
        public class PayrollBracketRequest
        {
            [Range(0, 999999999999, ErrorMessage = "El límite inferior no puede ser negativo.")]
            public decimal LowerLimit { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El límite superior no puede ser negativo.")]
            public decimal? UpperLimit { get; set; }

            [Range(0, 999999999999, ErrorMessage = "La cuota fija no puede ser negativa.")]
            public decimal FixedQuota { get; set; }

            [Range(0, 100, ErrorMessage = "La tasa debe estar entre 0 y 100.")]
            public decimal RatePercent { get; set; }
        }

        // ── Asignaciones por empleado ─────────────────────────────────────────

        /// <summary>
        /// Asignación recurrente de un concepto a un empleado.
        /// Mapea el resultado de hr.SP_GetEmployeeConcepts.
        /// </summary>
        public class EmployeeConceptResponse
        {
            public Guid      Id             { get; set; }
            public Guid      EmployeeId     { get; set; }
            public string    EmployeeCode   { get; set; } = string.Empty;
            public string    EmployeeName   { get; set; } = string.Empty;
            public Guid      ConceptId      { get; set; }
            public string    ConceptCode    { get; set; } = string.Empty;
            public string    ConceptName    { get; set; } = string.Empty;
            public string    ConceptType    { get; set; } = string.Empty;
            public decimal?  OverrideAmount { get; set; }
            public DateTime  StartDate      { get; set; }
            public DateTime? EndDate        { get; set; }
            public string?   Notes          { get; set; }
            public bool      IsActive       { get; set; }
            public DateTime  CreatedAt      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para asignar un concepto a un empleado.</summary>
        public class EmployeeConceptRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "El concepto es requerido.")]
            public Guid ConceptId { get; set; }

            [Range(0, 999999999999, ErrorMessage = "El monto no puede ser negativo.")]
            public decimal? OverrideAmount { get; set; }

            public DateTime? StartDate { get; set; }
            public DateTime? EndDate   { get; set; }

            [MaxLength(300, ErrorMessage = "Las notas no pueden superar 300 caracteres.")]
            public string? Notes { get; set; }
        }

        // ── Períodos de nómina ────────────────────────────────────────────────

        /// <summary>
        /// Período de nómina con sus totales calculados.
        /// Mapea el resultado de hr.SP_GetPayrollPeriods.
        /// </summary>
        public class PayrollPeriodResponse
        {
            public Guid      Id                 { get; set; }
            public string    Name               { get; set; } = string.Empty;
            /// <summary>Monthly | Biweekly | Weekly.</summary>
            public string    PayFrequency       { get; set; } = string.Empty;
            public DateTime  StartDate          { get; set; }
            public DateTime  EndDate            { get; set; }
            public DateTime  PayDate            { get; set; }
            /// <summary>Open | Calculated | Approved | Paid.</summary>
            public string    Status             { get; set; } = string.Empty;
            public string?   Notes              { get; set; }
            /// <summary>Moneda en la que se consolidan los totales del período.</summary>
            public Guid      BaseCurrencyId     { get; set; }
            public string    BaseCurrencyCode   { get; set; } = string.Empty;
            public string?   BaseCurrencySymbol { get; set; }
            public int       EmployeeCount      { get; set; }
            public int       NoveltyCount       { get; set; }
            /// <summary>Totales consolidados en la moneda base (monto de cada empleado × su tasa de cambio).</summary>
            public decimal   TotalGross         { get; set; }
            public decimal   TotalDeductions    { get; set; }
            public decimal   TotalNet           { get; set; }
            public decimal   TotalEmployerCost  { get; set; }
            /// <summary>true si algún empleado del período se paga en una moneda distinta a la base.</summary>
            public bool       HasMultipleCurrencies { get; set; }
            public DateTime  CreatedAt          { get; set; }
            public DateTime? UpdatedAt          { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un período de nómina.</summary>
        public class PayrollPeriodRequest
        {
            [Required(ErrorMessage = "El nombre del período es requerido.")]
            [MaxLength(120, ErrorMessage = "El nombre no puede superar 120 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "La frecuencia es requerida.")]
            [RegularExpression("^(Monthly|Biweekly|Weekly)$", ErrorMessage = "La frecuencia debe ser Monthly, Biweekly o Weekly.")]
            public string PayFrequency { get; set; } = "Monthly";

            [Required(ErrorMessage = "La fecha inicial es requerida.")]
            public DateTime StartDate { get; set; }

            [Required(ErrorMessage = "La fecha final es requerida.")]
            public DateTime EndDate { get; set; }

            [Required(ErrorMessage = "La fecha de pago es requerida.")]
            public DateTime PayDate { get; set; }

            [Required(ErrorMessage = "La moneda base del período es requerida.")]
            public Guid BaseCurrencyId { get; set; }

            /// <summary>Tasa de cambio de cada moneda distinta a la base que paguen empleados del período.</summary>
            public List<PayrollExchangeRateRequest> ExchangeRates { get; set; } = new();

            /// <summary>Fecha en que se consultaron las tasas de cambio anteriores (por defecto hoy).</summary>
            public DateTime? RateDate { get; set; }

            [MaxLength(500, ErrorMessage = "Las notas no pueden superar 500 caracteres.")]
            public string? Notes { get; set; }
        }

        // ── Tasas de cambio del período ───────────────────────────────────────

        /// <summary>Tasa de cambio de una moneda hacia la moneda base del período.</summary>
        public class PayrollExchangeRateRequest
        {
            [Required(ErrorMessage = "La moneda es requerida.")]
            public Guid CurrencyId { get; set; }

            [Range(0.000001, 999999999999, ErrorMessage = "La tasa de cambio debe ser mayor que cero.")]
            public decimal Rate { get; set; }
        }

        /// <summary>
        /// Tasa de cambio guardada de un período.
        /// Mapea el resultado de hr.SP_GetPayrollPeriodExchangeRates.
        /// </summary>
        public class PayrollExchangeRateResponse
        {
            public Guid     CurrencyId     { get; set; }
            public string   CurrencyCode   { get; set; } = string.Empty;
            public string?  CurrencySymbol { get; set; }
            public decimal  Rate           { get; set; }
            /// <summary>Fecha en que se consultó esta tasa de cambio.</summary>
            public DateTime? RateDate      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar la moneda base y las tasas de cambio de un período existente.</summary>
        public class PayrollExchangeRatesUpdateRequest
        {
            [Required(ErrorMessage = "La moneda base del período es requerida.")]
            public Guid BaseCurrencyId { get; set; }

            public List<PayrollExchangeRateRequest> ExchangeRates { get; set; } = new();

            /// <summary>Fecha en que se consultaron las tasas de cambio anteriores (por defecto hoy).</summary>
            public DateTime? RateDate { get; set; }
        }

        // ── Novedades ─────────────────────────────────────────────────────────

        /// <summary>
        /// Novedad (monto puntual) de un período.
        /// Mapea el resultado de hr.SP_GetPayrollNovelties.
        /// </summary>
        public class PayrollNoveltyResponse
        {
            public Guid     Id           { get; set; }
            public Guid     PeriodId     { get; set; }
            public Guid     EmployeeId   { get; set; }
            public string   EmployeeCode { get; set; } = string.Empty;
            public string   EmployeeName { get; set; } = string.Empty;
            public Guid     ConceptId    { get; set; }
            public string   ConceptCode  { get; set; } = string.Empty;
            public string   ConceptName  { get; set; } = string.Empty;
            public string   ConceptType  { get; set; } = string.Empty;
            public decimal  Amount       { get; set; }
            public string?  Notes        { get; set; }
            public DateTime CreatedAt    { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para registrar una novedad del período.</summary>
        public class PayrollNoveltyRequest
        {
            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }

            [Required(ErrorMessage = "El concepto es requerido.")]
            public Guid ConceptId { get; set; }

            [Range(0.01, 999999999999, ErrorMessage = "El monto debe ser mayor que cero.")]
            public decimal Amount { get; set; }

            [MaxLength(300, ErrorMessage = "Las notas no pueden superar 300 caracteres.")]
            public string? Notes { get; set; }
        }

        // ── Resultados de nómina ──────────────────────────────────────────────

        /// <summary>
        /// Resultado del cálculo por empleado (fila de la nómina).
        /// Mapea el resultado de hr.SP_GetPayrollDetails.
        /// </summary>
        public class PayrollDetailResponse
        {
            public Guid     Id              { get; set; }
            public Guid     PeriodId        { get; set; }
            public Guid     EmployeeId      { get; set; }
            public string   EmployeeCode    { get; set; } = string.Empty;
            public string   EmployeeName    { get; set; } = string.Empty;
            public string?  DepartmentName  { get; set; }
            /// <summary>Salario, bruto, deducciones, neto y costo patronal en la moneda propia del empleado (CurrencyCode).</summary>
            public decimal  BaseSalary      { get; set; }
            public decimal  GrossPay        { get; set; }
            public decimal  TotalDeductions { get; set; }
            public decimal  NetPay          { get; set; }
            public decimal  EmployerCost    { get; set; }
            public Guid     CurrencyId      { get; set; }
            public string   CurrencyCode    { get; set; } = string.Empty;
            public string?  CurrencySymbol  { get; set; }
            /// <summary>Tasa de cambio hacia la moneda base del período aplicada al calcular (1 si ya está en la moneda base).</summary>
            public decimal  ExchangeRate    { get; set; }
            /// <summary>Fecha en que se consultó la tasa de cambio anterior (null si el empleado ya cobra en la moneda base).</summary>
            public DateTime? ExchangeRateDate { get; set; }
            public DateTime CreatedAt       { get; set; }
        }

        /// <summary>
        /// Línea del desglose (recibo) de un resultado de nómina.
        /// Mapea el resultado de hr.SP_GetPayrollDetailLines.
        /// </summary>
        public class PayrollDetailLineResponse
        {
            public Guid     Id          { get; set; }
            public Guid     DetailId    { get; set; }
            public Guid?    ConceptId   { get; set; }
            public string   ConceptCode { get; set; } = string.Empty;
            public string   ConceptName { get; set; } = string.Empty;
            public string   ConceptType { get; set; } = string.Empty;
            public decimal? BaseUsed    { get; set; }
            public decimal? RateUsed    { get; set; }
            public decimal  Amount      { get; set; }
            public int      SortOrder   { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura del módulo de nómina.
        /// </summary>
        public class SP_PayrollResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

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
