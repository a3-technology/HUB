using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Seguridad — Permisos granulares.
    /// Expone el catálogo de permisos disponibles para asignar a los roles.
    /// El catálogo se descubre automáticamente desde los atributos
    /// <c>[RequirePermission]</c> de los controllers al iniciar el servidor
    /// (ver <see cref="server.Authorization.PermissionCatalogSync"/>).
    /// </summary>
    [ApiController]
    [Route("api/security/permissions")]
    [Authorize(Policy = "security")]
    public class PermissionsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public PermissionsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna el catálogo de permisos activos, opcionalmente filtrado por módulo.
        /// </summary>
        /// <param name="moduleCode">Código del módulo para filtrar (ej. "hr").</param>
        /// <returns>200 con la lista de <see cref="DBO.PermissionResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] string? moduleCode = null)
        {
            var p = new DynamicParameters();
            p.Add("@ModuleCode", moduleCode);

            var result = _repo.GetAll<DBO.PermissionResponse>("dbo.SP_GetPermissions", p);
            return Ok(result);
        }
    }
}
