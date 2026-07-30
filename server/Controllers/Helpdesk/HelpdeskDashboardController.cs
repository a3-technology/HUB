using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Resumen.
    /// La pantalla de Resumen no tiene una entidad propia (agrega datos de
    /// tickets ya expuestos por TicketsController); este endpoint solo existe
    /// para poder exigir el permiso helpdesk.dashboard.view — sin él, cualquiera
    /// con el módulo helpdesk vería el resumen sin poder controlarse por
    /// permiso granular.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/dashboard")]
    [Authorize(Policy = "helpdesk")]
    public class HelpdeskDashboardController : ControllerBase
    {
        /// <summary>Verifica acceso a la pantalla de Resumen de Helpdesk.</summary>
        [HttpGet("access")]
        [RequirePermission("helpdesk.dashboard.view", "Ver resumen de Helpdesk")]
        public IActionResult CheckAccess() => Ok();
    }
}
