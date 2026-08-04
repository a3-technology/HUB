using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del catálogo general de industrias.
    /// Las industrias son transversales (hoy las usa la ficha de Empresa en
    /// CRM), por eso viven en el schema dbo y el acceso solo requiere estar
    /// autenticado, sin política de módulo. Catálogo de solo lectura: se
    /// elige de la lista ya sembrada, sin pantalla propia de administración.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/industries")]
    [Authorize]
    public class IndustriesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public IndustriesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de industrias con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="DBO.IndustryResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<DBO.IndustryResponse>("dbo.SP_GetIndustries", p);
            return Ok(result);
        }
    }
}
