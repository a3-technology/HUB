using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Países.
    /// Catálogo de solo lectura (hr.Countries), sembrado con la lista completa
    /// de países: se elige de la lista ya sembrada, sin pantalla propia de
    /// administración (igual que Moneda).
    /// </summary>
    [ApiController]
    [Route("api/hr/countries")]
    [Authorize(Policy = "hr")]
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
        /// <returns>200 con la lista de <see cref="HR.CountryResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.CountryResponse>("hr.SP_GetCountries", p);
            return Ok(result);
        }
    }
}
