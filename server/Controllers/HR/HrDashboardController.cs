using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Resumen.
    /// La pantalla de Resumen no tiene una entidad propia (agrega datos de
    /// empleados, contratos, vacaciones, permisos y vacantes ya expuestos por
    /// sus propios controllers); este endpoint solo existe para poder exigir
    /// el permiso hr.dashboard.view — sin él, cualquiera con el módulo hr
    /// vería el resumen sin poder controlarse por permiso granular.
    /// </summary>
    [ApiController]
    [Route("api/hr/dashboard")]
    [Authorize(Policy = "hr")]
    public class HrDashboardController : ControllerBase
    {
        /// <summary>Verifica acceso a la pantalla de Resumen de RR. HH.</summary>
        [HttpGet("access")]
        [RequirePermission("hr.dashboard.view", "Ver resumen de RR. HH.")]
        public IActionResult CheckAccess() => Ok();
    }
}
