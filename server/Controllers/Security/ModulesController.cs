using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Seguridad — Módulos del sistema.
    /// Expone el catálogo de módulos disponibles para asignar permisos a los roles.
    /// </summary>
    [ApiController]
    [Route("api/security/modules")]
    [Authorize(Policy = "security")]
    public class ModulesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ModulesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de módulos activos del sistema.
        /// </summary>
        /// <returns>200 con la lista de <see cref="DBO.ModuleResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll()
        {
            var result = _repo.GetAll<DBO.ModuleResponse>("dbo.SP_GetModules", new DynamicParameters());
            return Ok(result);
        }
    }
}
