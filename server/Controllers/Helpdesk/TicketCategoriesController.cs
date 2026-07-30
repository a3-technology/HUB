using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Categorías de tickets.
    /// Catálogo administrable desde la aplicación. Todas las
    /// operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del
    /// schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/categories")]
    [Authorize(Policy = "helpdesk")]
    public class TicketCategoriesController : ControllerBase    
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TicketCategoriesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Retorna el catálogo de categorías de tickets.</summary>
        /// <param name="actpeive">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.CategoryResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<Helpdesk.CategoryResponse>("hd.SP_GetTicketCategories", p);

            return Ok(result);
        }

        /// <summary>Retorna una categoría por su identificador único.</summary>
        /// <param name="id">Identificador único (GUID) de la categoría.</param>
        /// <returns>200 con <see cref="Helpdesk.CategoryResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.CategoryResponse>("hd.SP_GetTicketCategoryById", p);
            if (result is null)
                return NotFound(new { message = "Categoría no encontrada." });

            return Ok(result);
        }

        /// <summary>Crea una nueva categoría de tickets.</summary>
        /// <param name="request">Datos de la categoría.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_CategoryResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("helpdesk.categories.create", "Crear categorías")]
        public IActionResult Insert([FromBody] Helpdesk.CategoryRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<Helpdesk.SP_CategoryResult>("hd.SP_InsertTicketCategory", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la categoría." });

            return Ok(result);
        }

        /// <summary>Actualiza los datos de una categoría existente.</summary>
        /// <param name="id">Identificador único de la categoría a actualizar.</param>
        /// <param name="request">Nuevos datos de la categoría.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_CategoryResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("helpdesk.categories.update", "Editar categorías")]
        public IActionResult Update(Guid id, [FromBody] Helpdesk.CategoryRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<Helpdesk.SP_CategoryResult>("hd.SP_UpdateTicketCategory", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la categoría." });

            return Ok(result);
        }

        /// <summary>Alterna el estado activo/inactivo de una categoría.</summary>
        /// <param name="id">Identificador único de la categoría.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_CategoryResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("helpdesk.categories.toggle", "Activar/desactivar categorías")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_CategoryResult>("hd.SP_ToggleTicketCategoryStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la categoría." });

            return Ok(result);
        }

        /// <summary>Elimina permanentemente una categoría (bloqueado si ya está en uso en tickets).</summary>
        /// <param name="id">Identificador único de la categoría.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_CategoryResult"/> o 400 si no existe o está en uso.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("helpdesk.categories.delete", "Eliminar categorías")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_CategoryResult>("hd.SP_DeleteTicketCategory", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la categoría." });

            return Ok(result);
        }
    }
}
