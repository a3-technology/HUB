using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Reportes.
    /// Expone agregaciones de solo lectura (volumen, carga por agente, tiempos de
    /// respuesta/resolución y cumplimiento de SLA) calculadas en SQL, con filtro
    /// opcional de rango de fechas. Todas las operaciones se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/reports")]
    [Authorize(Policy = "helpdesk")]
    public class HelpdeskReportsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public HelpdeskReportsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Volumen de tickets agrupado por estado, categoría o prioridad.</summary>
        /// <param name="groupBy">"Status" | "Category" | "Priority".</param>
        /// <param name="from">Fecha inicial (inclusive), filtra por CreatedAt.</param>
        /// <param name="to">Fecha final (inclusive), filtra por CreatedAt.</param>
        [HttpGet("volume")]
        [RequirePermission("helpdesk.reports.view", "Ver reportes de Helpdesk")]
        public IActionResult GetVolume([FromQuery] string groupBy, [FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
        {
            var p = new DynamicParameters();
            p.Add("@DateFrom", from);
            p.Add("@DateTo",   to);
            p.Add("@GroupBy",  groupBy);

            var result = _repo.GetAll<HD.VolumeByGroupResponse>("hd.SP_GetTicketVolumeReport", p);
            return Ok(result);
        }

        /// <summary>Carga actual (tickets no-finales asignados) y resueltos en el rango, por agente.</summary>
        [HttpGet("agent-load")]
        [RequirePermission("helpdesk.reports.view", "Ver reportes de Helpdesk")]
        public IActionResult GetAgentLoad([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
        {
            var p = new DynamicParameters();
            p.Add("@DateFrom", from);
            p.Add("@DateTo",   to);

            var result = _repo.GetAll<HD.AgentLoadResponse>("hd.SP_GetAgentLoadReport", p);
            return Ok(result);
        }

        /// <summary>Tiempos promedio de primera respuesta y resolución, en minutos.</summary>
        [HttpGet("response-times")]
        [RequirePermission("helpdesk.reports.view", "Ver reportes de Helpdesk")]
        public IActionResult GetResponseTimes([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
        {
            var p = new DynamicParameters();
            p.Add("@DateFrom", from);
            p.Add("@DateTo",   to);

            var result = _repo.Get<HD.ResponseTimesResponse>("hd.SP_GetResponseTimeReport", p);
            return Ok(result);
        }

        /// <summary>Cumplimiento de SLA por prioridad (dentro de objetivo / incumplido / pendiente).</summary>
        [HttpGet("sla-compliance")]
        [RequirePermission("helpdesk.reports.view", "Ver reportes de Helpdesk")]
        public IActionResult GetSlaCompliance([FromQuery] DateTime? from = null, [FromQuery] DateTime? to = null)
        {
            var p = new DynamicParameters();
            p.Add("@DateFrom", from);
            p.Add("@DateTo",   to);

            var result = _repo.GetAll<HD.SlaCompliancePriorityResponse>("hd.SP_GetSlaComplianceReport", p);
            return Ok(result);
        }
    }
}
