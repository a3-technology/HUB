using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del catálogo general de monedas.
    /// Las monedas son transversales a todos los módulos (hoy las usan los
    /// salarios de RR.HH.), por eso viven en el schema dbo y el acceso solo
    /// requiere estar autenticado, sin política de módulo.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/currencies")]
    [Authorize]
    public class CurrenciesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public CurrenciesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de monedas con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="DBO.CurrencyResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<DBO.CurrencyResponse>("dbo.SP_GetCurrencies", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una moneda por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la moneda.</param>
        /// <returns>200 con <see cref="DBO.CurrencyResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.CurrencyResponse>("dbo.SP_GetCurrencyById", p);
            if (result is null)
                return NotFound(new { message = "Moneda no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva moneda validando unicidad del código ISO y del nombre.
        /// </summary>
        /// <param name="request">Código ISO 4217, nombre y símbolo de la moneda.</param>
        /// <returns>200 con <see cref="DBO.SP_CurrencyResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("general.currencies.create", "Crear monedas")]
        public IActionResult Insert([FromBody] DBO.CurrencyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Code",   request.Code.Trim().ToUpperInvariant());
            p.Add("@Name",   request.Name.Trim());
            p.Add("@Symbol", request.Symbol.Trim());

            var result = _repo.Get<DBO.SP_CurrencyResult>("dbo.SP_InsertCurrency", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la moneda." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una moneda existente.
        /// Valida unicidad del código y nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único de la moneda a actualizar.</param>
        /// <param name="request">Nuevos datos de la moneda.</param>
        /// <returns>200 con <see cref="DBO.SP_CurrencyResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("general.currencies.update", "Editar monedas")]
        public IActionResult Update(Guid id, [FromBody] DBO.CurrencyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Code",   request.Code.Trim().ToUpperInvariant());
            p.Add("@Name",   request.Name.Trim());
            p.Add("@Symbol", request.Symbol.Trim());

            var result = _repo.Get<DBO.SP_CurrencyResult>("dbo.SP_UpdateCurrency", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la moneda." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una moneda (eliminación lógica).
        /// Si estaba activa la desactiva; si estaba inactiva la reactiva.
        /// </summary>
        /// <param name="id">Identificador único de la moneda.</param>
        /// <returns>200 con <see cref="DBO.SP_CurrencyResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("general.currencies.toggle", "Activar/desactivar monedas")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_CurrencyResult>("dbo.SP_ToggleCurrencyStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la moneda." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una moneda.
        /// No se permite si hay empleados o vacantes que la usan.
        /// </summary>
        /// <param name="id">Identificador único de la moneda.</param>
        /// <returns>200 con <see cref="DBO.SP_CurrencyResult"/> o 400 si no existe o está en uso.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("general.currencies.delete", "Eliminar monedas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_CurrencyResult>("dbo.SP_DeleteCurrency", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la moneda." });

            return Ok(result);
        }
    }
}
