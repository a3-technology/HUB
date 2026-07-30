using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;
using System.Text.Json;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Nómina.
    /// Expone el catálogo de conceptos (motor parametrizable por datos), las
    /// asignaciones por empleado, los períodos con su ciclo de vida
    /// (Open → Calculated → Approved → Paid), las novedades y los resultados.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/payroll")]
    [Authorize(Policy = "hr")]
    public class PayrollController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public PayrollController(IGenericRepository repo)
        {
            _repo = repo;
        }

        // ── Conceptos ─────────────────────────────────────────────────────────

        /// <summary>Retorna el catálogo de conceptos de nómina.</summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        [HttpGet("concepts")]
        public IActionResult GetConcepts([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.PayrollConceptResponse>("hr.SP_GetPayrollConcepts", p);
            return Ok(result);
        }

        /// <summary>Crea un concepto de nómina.</summary>
        [HttpPost("concepts")]
        [RequirePermission("hr.payroll.concept-create", "Crear conceptos de nómina")]
        public IActionResult InsertConcept([FromBody] HR.PayrollConceptRequest request)
        {
            var p = BuildConceptParameters(request);
            p.Add("@Code", request.Code.Trim());

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_InsertPayrollConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el concepto." });

            return Ok(result);
        }

        /// <summary>Actualiza un concepto (código y tipo no cambian).</summary>
        [HttpPut("concepts/{id:guid}")]
        [RequirePermission("hr.payroll.concept-update", "Editar conceptos de nómina")]
        public IActionResult UpdateConcept(Guid id, [FromBody] HR.PayrollConceptRequest request)
        {
            var p = BuildConceptParameters(request);
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_UpdatePayrollConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el concepto." });

            return Ok(result);
        }

        /// <summary>Activa o desactiva un concepto.</summary>
        [HttpPatch("concepts/{id:guid}/toggle")]
        [RequirePermission("hr.payroll.concept-toggle", "Activar/desactivar conceptos de nómina")]
        public IActionResult ToggleConcept(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_TogglePayrollConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del concepto." });

            return Ok(result);
        }

        /// <summary>Elimina un concepto sin historial de uso.</summary>
        [HttpDelete("concepts/{id:guid}")]
        [RequirePermission("hr.payroll.concept-delete", "Eliminar conceptos de nómina")]
        public IActionResult DeleteConcept(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_DeletePayrollConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el concepto." });

            return Ok(result);
        }

        /// <summary>Retorna los tramos de la escala progresiva de un concepto.</summary>
        [HttpGet("concepts/{id:guid}/brackets")]
        public IActionResult GetBrackets(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@ConceptId", id);

            var result = _repo.GetAll<HR.PayrollBracketResponse>("hr.SP_GetPayrollConceptBrackets", p);
            return Ok(result);
        }

        /// <summary>Reemplaza completa la escala de tramos de un concepto.</summary>
        [HttpPut("concepts/{id:guid}/brackets")]
        [RequirePermission("hr.payroll.concept-brackets-replace", "Editar tramos de conceptos de nómina")]
        public IActionResult ReplaceBrackets(Guid id, [FromBody] List<HR.PayrollBracketRequest> brackets)
        {
            var p = new DynamicParameters();
            p.Add("@ConceptId", id);
            p.Add("@Brackets", JsonSerializer.Serialize(brackets.Select(b => new
            {
                lowerLimit  = b.LowerLimit,
                upperLimit  = b.UpperLimit,
                fixedQuota  = b.FixedQuota,
                ratePercent = b.RatePercent,
            })));

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_ReplacePayrollConceptBrackets", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar los tramos." });

            return Ok(result);
        }

        // ── Asignaciones por empleado ─────────────────────────────────────────

        /// <summary>Lista asignaciones recurrentes, filtrables por empleado o concepto.</summary>
        [HttpGet("employee-concepts")]
        public IActionResult GetEmployeeConcepts([FromQuery] Guid? employeeId = null, [FromQuery] Guid? conceptId = null)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", employeeId);
            p.Add("@ConceptId",  conceptId);

            var result = _repo.GetAll<HR.EmployeeConceptResponse>("hr.SP_GetEmployeeConcepts", p);
            return Ok(result);
        }

        /// <summary>Asigna un concepto recurrente a un empleado.</summary>
        [HttpPost("employee-concepts")]
        [RequirePermission("hr.payroll.employee-concept-create", "Asignar conceptos recurrentes a empleados")]
        public IActionResult InsertEmployeeConcept([FromBody] HR.EmployeeConceptRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId",     request.EmployeeId);
            p.Add("@ConceptId",      request.ConceptId);
            p.Add("@OverrideAmount", request.OverrideAmount);
            p.Add("@StartDate",      request.StartDate?.Date);
            p.Add("@EndDate",        request.EndDate?.Date);
            p.Add("@Notes",          request.Notes?.Trim());

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_InsertEmployeeConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al asignar el concepto." });

            return Ok(result);
        }

        /// <summary>Elimina una asignación recurrente.</summary>
        [HttpDelete("employee-concepts/{id:guid}")]
        [RequirePermission("hr.payroll.employee-concept-delete", "Eliminar asignaciones de conceptos a empleados")]
        public IActionResult DeleteEmployeeConcept(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_DeleteEmployeeConcept", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la asignación." });

            return Ok(result);
        }

        // ── Períodos ──────────────────────────────────────────────────────────

        /// <summary>Lista los períodos de nómina con sus totales.</summary>
        [HttpGet("periods")]
        public IActionResult GetPeriods([FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@Status", string.IsNullOrWhiteSpace(status) ? null : status.Trim());

            var result = _repo.GetAll<HR.PayrollPeriodResponse>("hr.SP_GetPayrollPeriods", p);
            return Ok(result);
        }

        /// <summary>Crea un período de nómina en estado Open.</summary>
        [HttpPost("periods")]
        [RequirePermission("hr.payroll.period-create", "Crear períodos de nómina")]
        public IActionResult InsertPeriod([FromBody] HR.PayrollPeriodRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",           request.Name.Trim());
            p.Add("@PayFrequency",   request.PayFrequency);
            p.Add("@StartDate",      request.StartDate.Date);
            p.Add("@EndDate",        request.EndDate.Date);
            p.Add("@PayDate",        request.PayDate.Date);
            p.Add("@BaseCurrencyId", request.BaseCurrencyId);
            p.Add("@ExchangeRates",  SerializeExchangeRates(request.ExchangeRates));
            p.Add("@RateDate",       request.RateDate?.Date);
            p.Add("@Notes",          request.Notes?.Trim());

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_InsertPayrollPeriod", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el período." });

            return Ok(result);
        }

        // ── Tasas de cambio del período ───────────────────────────────────────

        /// <summary>Retorna las tasas de cambio guardadas de un período, para precargar su edición.</summary>
        [HttpGet("periods/{id:guid}/exchange-rates")]
        public IActionResult GetExchangeRates(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@PeriodId", id);

            var result = _repo.GetAll<HR.PayrollExchangeRateResponse>("hr.SP_GetPayrollPeriodExchangeRates", p);
            return Ok(result);
        }

        /// <summary>
        /// Actualiza la moneda base y las tasas de cambio de un período no aprobado.
        /// Si el período ya estaba calculado, se reabre para forzar un recálculo.
        /// </summary>
        [HttpPut("periods/{id:guid}/exchange-rates")]
        [RequirePermission("hr.payroll.period-exchange-rates-replace", "Editar tasas de cambio del período de nómina")]
        public IActionResult ReplaceExchangeRates(Guid id, [FromBody] HR.PayrollExchangeRatesUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",             id);
            p.Add("@BaseCurrencyId", request.BaseCurrencyId);
            p.Add("@ExchangeRates",  SerializeExchangeRates(request.ExchangeRates));
            p.Add("@RateDate",       request.RateDate?.Date);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_ReplacePayrollPeriodExchangeRates", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar las tasas de cambio." });

            return Ok(result);
        }

        /// <summary>
        /// Ejecuta el motor de cálculo del período: aplica el catálogo de
        /// conceptos por fases y deja el período en estado Calculated.
        /// </summary>
        [HttpPost("periods/{id:guid}/calculate")]
        [RequirePermission("hr.payroll.period-calculate", "Calcular períodos de nómina")]
        public IActionResult CalculatePeriod(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@PeriodId", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_CalculatePayroll", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al calcular la nómina." });

            return Ok(result);
        }

        /// <summary>Aprueba un período calculado.</summary>
        [HttpPatch("periods/{id:guid}/approve")]
        [RequirePermission("hr.payroll.period-approve", "Aprobar períodos de nómina")]
        public IActionResult ApprovePeriod(Guid id) => ChangePeriodStatus(id, "Approve");

        /// <summary>Marca como pagado un período aprobado (estado final).</summary>
        [HttpPatch("periods/{id:guid}/pay")]
        [RequirePermission("hr.payroll.period-pay", "Marcar períodos de nómina como pagados")]
        public IActionResult PayPeriod(Guid id) => ChangePeriodStatus(id, "Pay");

        /// <summary>Reabre un período calculado o aprobado para recalcular.</summary>
        [HttpPatch("periods/{id:guid}/reopen")]
        [RequirePermission("hr.payroll.period-reopen", "Reabrir períodos de nómina")]
        public IActionResult ReopenPeriod(Guid id) => ChangePeriodStatus(id, "Reopen");

        /// <summary>Elimina un período no aprobado con sus novedades y resultados.</summary>
        [HttpDelete("periods/{id:guid}")]
        [RequirePermission("hr.payroll.period-delete", "Eliminar períodos de nómina")]
        public IActionResult DeletePeriod(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_DeletePayrollPeriod", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el período." });

            return Ok(result);
        }

        // ── Novedades ─────────────────────────────────────────────────────────

        /// <summary>Lista las novedades de un período.</summary>
        [HttpGet("periods/{id:guid}/novelties")]
        public IActionResult GetNovelties(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@PeriodId", id);

            var result = _repo.GetAll<HR.PayrollNoveltyResponse>("hr.SP_GetPayrollNovelties", p);
            return Ok(result);
        }

        /// <summary>Registra una novedad (monto puntual) en un período.</summary>
        [HttpPost("periods/{id:guid}/novelties")]
        [RequirePermission("hr.payroll.novelty-create", "Registrar novedades de nómina")]
        public IActionResult InsertNovelty(Guid id, [FromBody] HR.PayrollNoveltyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@PeriodId",   id);
            p.Add("@EmployeeId", request.EmployeeId);
            p.Add("@ConceptId",  request.ConceptId);
            p.Add("@Amount",     request.Amount);
            p.Add("@Notes",      request.Notes?.Trim());

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_InsertPayrollNovelty", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar la novedad." });

            return Ok(result);
        }

        /// <summary>Elimina una novedad de un período abierto o calculado.</summary>
        [HttpDelete("novelties/{id:guid}")]
        [RequirePermission("hr.payroll.novelty-delete", "Eliminar novedades de nómina")]
        public IActionResult DeleteNovelty(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_DeletePayrollNovelty", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la novedad." });

            return Ok(result);
        }

        // ── Resultados ────────────────────────────────────────────────────────

        /// <summary>Retorna el resultado del cálculo de un período (una fila por empleado).</summary>
        [HttpGet("periods/{id:guid}/details")]
        public IActionResult GetDetails(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@PeriodId", id);

            var result = _repo.GetAll<HR.PayrollDetailResponse>("hr.SP_GetPayrollDetails", p);
            return Ok(result);
        }

        /// <summary>Retorna el desglose por concepto (recibo) de un resultado.</summary>
        [HttpGet("details/{detailId:guid}/lines")]
        public IActionResult GetDetailLines(Guid detailId)
        {
            var p = new DynamicParameters();
            p.Add("@DetailId", detailId);

            var result = _repo.GetAll<HR.PayrollDetailLineResponse>("hr.SP_GetPayrollDetailLines", p);
            return Ok(result);
        }

        // ── Helpers ───────────────────────────────────────────────────────────

        /// <summary>Ejecuta una transición del ciclo de vida del período (Approve | Pay | Reopen).</summary>
        private IActionResult ChangePeriodStatus(Guid id, string action)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Action", action);

            var result = _repo.Get<HR.SP_PayrollResult>("hr.SP_ChangePayrollPeriodStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del período." });

            return Ok(result);
        }

        /// <summary>Serializa las tasas de cambio al JSON que esperan los stored procedures del período.</summary>
        private static string SerializeExchangeRates(List<HR.PayrollExchangeRateRequest> rates) =>
            JsonSerializer.Serialize(rates.Select(r => new { currencyId = r.CurrencyId, rate = r.Rate }));

        /// <summary>Parámetros comunes de crear/actualizar concepto.</summary>
        private static DynamicParameters BuildConceptParameters(HR.PayrollConceptRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",                request.Name.Trim());
            p.Add("@ConceptType",         request.ConceptType);
            p.Add("@CalcType",            request.CalcType);
            p.Add("@BaseType",            request.BaseType);
            p.Add("@DefaultAmount",       request.DefaultAmount);
            p.Add("@Percentage",          request.Percentage);
            p.Add("@BaseCapAmount",       request.BaseCapAmount);
            p.Add("@AnnualizationFactor", request.AnnualizationFactor);
            p.Add("@AffectsTaxable",      request.AffectsTaxable);
            p.Add("@AppliesToAll",        request.AppliesToAll);
            p.Add("@CalcOrder",           request.CalcOrder);
            return p;
        }
    }
}
