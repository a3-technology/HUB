using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Prioridades.
    /// Catálogo administrable desde la aplicación (nombre, nivel de severidad
    /// y color para la UI). Todas las operaciones de base de datos se
    /// realizan a través de <see cref="IGenericRepository"/> usando los
    /// stored procedures del schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/priorities")]
    [Authorize(Policy = "helpdesk")]
    public class PrioritiesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public PrioritiesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Retorna el catálogo de prioridades, ordenado por nivel.</summary>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.PriorityResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<Helpdesk.PriorityResponse>("hd.SP_GetPriorities", p);
            return Ok(result);
        }

        /// <summary>Retorna una prioridad por su identificador único.</summary>
        /// <param name="id">Identificador único (GUID) de la prioridad.</param>
        /// <returns>200 con <see cref="Helpdesk.PriorityResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.PriorityResponse>("hd.SP_GetPriorityById", p);
            if (result is null)
                return NotFound(new { message = "Prioridad no encontrada." });

            return Ok(result);
        }

        /// <summary>Crea una nueva prioridad.</summary>
        /// <param name="request">Datos de la prioridad.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_PriorityResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("helpdesk.priorities.create", "Crear prioridades")]
        public IActionResult Insert([FromBody] Helpdesk.PriorityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",                    request.Name.Trim());
            p.Add("@Level",                   request.Level);
            p.Add("@ColorHex",                request.ColorHex);
            p.Add("@ResponseTargetMinutes",   request.ResponseTargetMinutes);
            p.Add("@ResolutionTargetMinutes", request.ResolutionTargetMinutes);

            var result = _repo.Get<Helpdesk.SP_PriorityResult>("hd.SP_InsertPriority", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la prioridad." });

            return Ok(result);
        }

        /// <summary>Actualiza los datos de una prioridad existente.</summary>
        /// <param name="id">Identificador único de la prioridad a actualizar.</param>
        /// <param name="request">Nuevos datos de la prioridad.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_PriorityResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("helpdesk.priorities.update", "Editar prioridades")]
        public IActionResult Update(Guid id, [FromBody] Helpdesk.PriorityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",                       id);
            p.Add("@Name",                     request.Name.Trim());
            p.Add("@Level",                    request.Level);
            p.Add("@ColorHex",                 request.ColorHex);
            p.Add("@ResponseTargetMinutes",    request.ResponseTargetMinutes);
            p.Add("@ResolutionTargetMinutes",  request.ResolutionTargetMinutes);

            var result = _repo.Get<Helpdesk.SP_PriorityResult>("hd.SP_UpdatePriority", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la prioridad." });

            return Ok(result);
        }

        /// <summary>Alterna el estado activo/inactivo de una prioridad.</summary>
        /// <param name="id">Identificador único de la prioridad.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_PriorityResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("helpdesk.priorities.toggle", "Activar/desactivar prioridades")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_PriorityResult>("hd.SP_TogglePriorityStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la prioridad." });

            return Ok(result);
        }

        /// <summary>Elimina permanentemente una prioridad (bloqueado si ya está en uso en tickets).</summary>
        /// <param name="id">Identificador único de la prioridad.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_PriorityResult"/> o 400 si no existe o está en uso.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("helpdesk.priorities.delete", "Eliminar prioridades")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_PriorityResult>("hd.SP_DeletePriority", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la prioridad." });

            return Ok(result);
        }
    }
}
