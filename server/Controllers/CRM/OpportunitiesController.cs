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
    /// Controlador del módulo CRM — Oportunidades.
    /// Expone operaciones CRUD y cambio de estado para el pipeline de ventas.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/opportunities")]
    [Authorize(Policy = "crm")]
    public class OpportunitiesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public OpportunitiesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de oportunidades con filtros opcionales por cliente, estado activo y etapa.
        /// </summary>
        /// <param name="clientId">Filtra las oportunidades de un cliente específico.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <param name="stage">Filtra por etapa del pipeline (Prospecting, Qualification, Proposal, Negotiation, Won, Lost).</param>
        /// <returns>200 con la lista de <see cref="CRM.OpportunityResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? clientId = null, [FromQuery] bool? active = null, [FromQuery] string? stage = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId", clientId);
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Stage",    stage);

            var result = _repo.GetAll<CRM.OpportunityResponse>("crm.SP_GetOpportunities", p).ToList();

            foreach (var o in result)
                o.OwnerPhotoUrl = await SignPhotoUrl(o.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una oportunidad por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la oportunidad.</param>
        /// <returns>200 con <see cref="CRM.OpportunityResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.OpportunityResponse>("crm.SP_GetOpportunityById", p);
            if (result is null)
                return NotFound(new { message = "Oportunidad no encontrada." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva oportunidad.
        /// </summary>
        /// <param name="request">Datos de la oportunidad.</param>
        /// <returns>200 con <see cref="CRM.SP_OpportunityResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.opportunities.create", "Crear oportunidades")]
        public IActionResult Insert([FromBody] CRM.OpportunityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",          request.ClientId);
            p.Add("@ContactId",         request.ContactId);
            p.Add("@Name",              request.Name.Trim());
            p.Add("@Stage",             request.Stage);
            p.Add("@Value",             request.Value);
            p.Add("@Probability",       request.Probability);
            p.Add("@ExpectedCloseDate", request.ExpectedCloseDate);
            p.Add("@OwnerId",           request.OwnerId);
            p.Add("@Notes",             request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_OpportunityResult>("crm.SP_InsertOpportunity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la oportunidad." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una oportunidad existente (incluye mover de etapa desde el Kanban).
        /// </summary>
        /// <param name="id">Identificador único de la oportunidad a actualizar.</param>
        /// <param name="request">Nuevos datos de la oportunidad.</param>
        /// <returns>200 con <see cref="CRM.SP_OpportunityResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.opportunities.update", "Editar oportunidades")]
        public IActionResult Update(Guid id, [FromBody] CRM.OpportunityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",                id);
            p.Add("@ClientId",          request.ClientId);
            p.Add("@ContactId",         request.ContactId);
            p.Add("@Name",              request.Name.Trim());
            p.Add("@Stage",             request.Stage);
            p.Add("@Value",             request.Value);
            p.Add("@Probability",       request.Probability);
            p.Add("@ExpectedCloseDate", request.ExpectedCloseDate);
            p.Add("@OwnerId",           request.OwnerId);
            p.Add("@Notes",             request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_OpportunityResult>("crm.SP_UpdateOpportunity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la oportunidad." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una oportunidad (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la oportunidad.</param>
        /// <returns>200 con <see cref="CRM.SP_OpportunityResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.opportunities.toggle", "Activar/desactivar oportunidades")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_OpportunityResult>("crm.SP_ToggleOpportunityStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la oportunidad." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una oportunidad (las actividades que la referencian quedan sin oportunidad).
        /// </summary>
        /// <param name="id">Identificador único de la oportunidad.</param>
        /// <returns>200 con <see cref="CRM.SP_OpportunityResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.opportunities.delete", "Eliminar oportunidades")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_OpportunityResult>("crm.SP_DeleteOpportunity", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la oportunidad." });

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
