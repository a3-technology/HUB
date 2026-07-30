using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Helpdesk — Estados de ticket.
    /// Catálogo administrable desde la aplicación (nombre, color, banderas de
    /// ciclo de vida y matriz de transiciones permitidas). Todas las
    /// operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del
    /// schema hd.
    /// </summary>
    [ApiController]
    [Route("api/helpdesk/statuses")]
    [Authorize(Policy = "helpdesk")]
    public class TicketStatusesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TicketStatusesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Retorna el catálogo de estados de ticket, ordenado por su orden de visualización.</summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="Helpdesk.TicketStatusResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<Helpdesk.TicketStatusResponse>("hd.SP_GetTicketStatuses", p);
            return Ok(result);
        }

        /// <summary>Retorna un estado de ticket por su identificador único.</summary>
        /// <param name="id">Identificador único (GUID) del estado.</param>
        /// <returns>200 con <see cref="Helpdesk.TicketStatusResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.TicketStatusResponse>("hd.SP_GetTicketStatusById", p);
            if (result is null)
                return NotFound(new { message = "Estado no encontrado." });

            return Ok(result);
        }

        /// <summary>Retorna la matriz completa de transiciones permitidas (o las de un estado de origen puntual).</summary>
        /// <param name="fromStatusId">Id del estado de origen; omitir para traer todas las transiciones.</param>
        [HttpGet("transitions")]
        public IActionResult GetTransitions([FromQuery] Guid? fromStatusId = null)
        {
            var p = new DynamicParameters();
            p.Add("@FromStatusId", fromStatusId);

            var result = _repo.GetAll<Helpdesk.TicketStatusTransitionResponse>("hd.SP_GetTicketStatusTransitions", p);
            return Ok(result);
        }

        /// <summary>Crea un nuevo estado de ticket.</summary>
        /// <param name="request">Datos del estado, incluyendo las transiciones permitidas desde él.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketStatusResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("helpdesk.statuses.create", "Crear estados de ticket")]
        public IActionResult Insert([FromBody] Helpdesk.TicketStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",                   request.Name.Trim());
            p.Add("@ColorHex",               request.ColorHex);
            p.Add("@SortOrder",              request.SortOrder);
            p.Add("@IsInitial",              request.IsInitial);
            p.Add("@IsFinal",                request.IsFinal);
            p.Add("@RequiresResolution",     request.RequiresResolution);
            p.Add("@AllowedTransitionsJson", JsonSerializer.Serialize(request.AllowedTransitionIds));

            var result = _repo.Get<Helpdesk.SP_TicketStatusResult>("hd.SP_InsertTicketStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el estado." });

            return Ok(result);
        }

        /// <summary>Actualiza los datos de un estado de ticket existente, incluyendo su matriz de transiciones.</summary>
        /// <param name="id">Identificador único del estado a actualizar.</param>
        /// <param name="request">Nuevos datos del estado.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketStatusResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("helpdesk.statuses.update", "Editar estados de ticket")]
        public IActionResult Update(Guid id, [FromBody] Helpdesk.TicketStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",                     id);
            p.Add("@Name",                   request.Name.Trim());
            p.Add("@ColorHex",               request.ColorHex);
            p.Add("@SortOrder",              request.SortOrder);
            p.Add("@IsInitial",              request.IsInitial);
            p.Add("@IsFinal",                request.IsFinal);
            p.Add("@RequiresResolution",     request.RequiresResolution);
            p.Add("@AllowedTransitionsJson", JsonSerializer.Serialize(request.AllowedTransitionIds));

            var result = _repo.Get<Helpdesk.SP_TicketStatusResult>("hd.SP_UpdateTicketStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el estado." });

            return Ok(result);
        }

        /// <summary>Alterna el estado activo/inactivo de un estado de ticket.</summary>
        /// <param name="id">Identificador único del estado.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketStatusResult"/> o 400 si no existe o violaría el invariante mínimo del catálogo.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("helpdesk.statuses.toggle", "Activar/desactivar estados de ticket")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_TicketStatusResult>("hd.SP_ToggleTicketStatusStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar la disponibilidad del estado." });

            return Ok(result);
        }

        /// <summary>Elimina permanentemente un estado de ticket (bloqueado si ya está en uso en tickets).</summary>
        /// <param name="id">Identificador único del estado.</param>
        /// <returns>200 con <see cref="Helpdesk.SP_TicketStatusResult"/> o 400 si no existe o está en uso.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("helpdesk.statuses.delete", "Eliminar estados de ticket")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Helpdesk.SP_TicketStatusResult>("hd.SP_DeleteTicketStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el estado." });

            return Ok(result);
        }
    }
}
