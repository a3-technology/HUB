using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Resumen.
    /// La pantalla de Resumen no tiene una entidad propia (agrega datos de
    /// proyectos y tareas ya expuestos por sus propios controllers); este
    /// endpoint solo existe para poder exigir el permiso projects.dashboard.view
    /// — sin él, cualquiera con el módulo projects vería el resumen sin poder
    /// controlarse por permiso granular.
    /// </summary>
    [ApiController]
    [Route("api/projects/dashboard")]
    [Authorize(Policy = "projects")]
    public class ProjectsDashboardController : ControllerBase
    {
        /// <summary>Verifica acceso a la pantalla de Resumen de Proyectos.</summary>
        [HttpGet("access")]
        [RequirePermission("projects.dashboard.view", "Ver resumen de Proyectos")]
        public IActionResult CheckAccess() => Ok();
    }
}
