using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo CRM — Actividades.
    /// Expone operaciones CRUD y cambio de estado para la bitácora de interacciones
    /// (llamadas, reuniones, correos, notas) asociadas a clientes, contactos y oportunidades.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/activities")]
    [Authorize(Policy = "crm")]
    public class ActivitiesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public ActivitiesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de actividades con filtros opcionales por cliente, contacto, oportunidad y estado activo.
        /// </summary>
        /// <param name="clientId">Filtra las actividades de un cliente específico.</param>
        /// <param name="contactId">Filtra las actividades de un contacto específico.</param>
        /// <param name="opportunityId">Filtra las actividades de una oportunidad específica.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="CRM.ActivityResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? clientId = null, [FromQuery] Guid? contactId = null, [FromQuery] Guid? opportunityId = null, [FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",      clientId);
            p.Add("@ContactId",     contactId);
            p.Add("@OpportunityId", opportunityId);
            p.Add("@IsActive",      active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<CRM.ActivityResponse>("crm.SP_GetActivities", p).ToList();

            foreach (var a in result)
                a.OwnerPhotoUrl = await SignPhotoUrl(a.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una actividad por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la actividad.</param>
        /// <returns>200 con <see cref="CRM.ActivityResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.ActivityResponse>("crm.SP_GetActivityById", p);
            if (result is null)
                return NotFound(new { message = "Actividad no encontrada." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva actividad asociada a un cliente.
        /// </summary>
        /// <param name="request">Datos de la actividad.</param>
        /// <returns>200 con <see cref="CRM.SP_ActivityResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.activities.create", "Crear actividades")]
        public IActionResult Insert([FromBody] CRM.ActivityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",      request.ClientId);
            p.Add("@ContactId",     request.ContactId);
            p.Add("@OpportunityId", request.OpportunityId);
            p.Add("@Type",          request.Type);
            p.Add("@Subject",       request.Subject.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@ActivityDate",  request.ActivityDate);
            p.Add("@OwnerId",       request.OwnerId);

            var result = _repo.Get<CRM.SP_ActivityResult>("crm.SP_InsertActivity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la actividad." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una actividad existente.
        /// </summary>
        /// <param name="id">Identificador único de la actividad a actualizar.</param>
        /// <param name="request">Nuevos datos de la actividad.</param>
        /// <returns>200 con <see cref="CRM.SP_ActivityResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.activities.update", "Editar actividades")]
        public IActionResult Update(Guid id, [FromBody] CRM.ActivityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",            id);
            p.Add("@ClientId",      request.ClientId);
            p.Add("@ContactId",     request.ContactId);
            p.Add("@OpportunityId", request.OpportunityId);
            p.Add("@Type",          request.Type);
            p.Add("@Subject",       request.Subject.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@ActivityDate",  request.ActivityDate);
            p.Add("@OwnerId",       request.OwnerId);

            var result = _repo.Get<CRM.SP_ActivityResult>("crm.SP_UpdateActivity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la actividad." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una actividad (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la actividad.</param>
        /// <returns>200 con <see cref="CRM.SP_ActivityResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.activities.toggle", "Activar/desactivar actividades")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ActivityResult>("crm.SP_ToggleActivityStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la actividad." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una actividad.
        /// </summary>
        /// <param name="id">Identificador único de la actividad.</param>
        /// <returns>200 con <see cref="CRM.SP_ActivityResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.activities.delete", "Eliminar actividades")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ActivityResult>("crm.SP_DeleteActivity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la actividad." });

            return Ok(result);
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto del ejecutivo asignado en una URL firmada
        /// temporal (60 minutos). Retorna null si no tiene foto.
        /// </summary>
        private async Task<string?> SignPhotoUrl(string? photoPath)
        {
            if (string.IsNullOrWhiteSpace(photoPath))
                return null;

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return url.ToString();
        }
    }
}
