using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Recursos Humanos — Nómina.
    /// El cálculo es un motor parametrizable por datos: el catálogo de conceptos
    /// define ingresos, deducciones y aportes patronales con su método de
    /// cálculo (fijo, porcentual con tope o escala progresiva), por lo que la
    /// nómina de cualquier país se modela solo con configuración.
    /// </summary>
    public partial class HR
    {
        // ── Conceptos de nómina ───────────────────────────────────────────────

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

        // ── Resultados ────────────────────────────────────────────────────────

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
    }
}
