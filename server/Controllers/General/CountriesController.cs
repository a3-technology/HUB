using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del catálogo general de países.
    /// Los países son transversales a todos los módulos (hoy los usa la ficha
    /// del empleado), por eso viven en el schema dbo y el acceso solo requiere
    /// estar autenticado, sin política de módulo. Catálogo de solo lectura:
    /// se elige de la lista ya sembrada, sin pantalla propia de administración.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/countries")]
    [Authorize]
    public class CountriesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public CountriesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de países con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="DBO.CountryResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<DBO.CountryResponse>("dbo.SP_GetCountries", p);
            return Ok(result);
        }
    }
}
