using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Reportes.
    /// La pantalla de Reportes no tiene una entidad propia (agrega datos de
    /// empleados, nómina, asistencia, vacaciones y reclutamiento ya expuestos
    /// por sus propios controllers, igual que HrDashboardController con
    /// Resumen); este endpoint solo existe para poder exigir el permiso
    /// hr.reports.view — sin él, cualquiera con el módulo hr vería los
    /// reportes sin poder controlarse por permiso granular.
    /// </summary>
    [ApiController]
    [Route("api/hr/reports")]
    [Authorize(Policy = "hr")]
    public class HrReportsController : ControllerBase
    {
        /// <summary>Verifica acceso a la pantalla de Reportes de RR. HH.</summary>
        [HttpGet("access")]
        [RequirePermission("hr.reports.view", "Ver reportes de RR. HH.")]
        public IActionResult CheckAccess() => Ok();
    }
}
