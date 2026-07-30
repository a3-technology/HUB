using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Reportes.
    /// La pantalla de Reportes no tiene una entidad propia (agrega datos de
    /// proyectos, tareas y recursos ya expuestos por sus propios controllers,
    /// igual que ProjectsDashboardController con Resumen); este endpoint solo
    /// existe para poder exigir el permiso projects.reports.view — sin él,
    /// cualquiera con el módulo projects vería los reportes sin poder
    /// controlarse por permiso granular.
    /// </summary>
    [ApiController]
    [Route("api/projects/reports")]
    [Authorize(Policy = "projects")]
    public class ProjectsReportsController : ControllerBase
    {
        /// <summary>Verifica acceso a la pantalla de Reportes de Proyectos.</summary>
        [HttpGet("access")]
        [RequirePermission("projects.reports.view", "Ver reportes de Proyectos")]
        public IActionResult CheckAccess() => Ok();
    }
}
