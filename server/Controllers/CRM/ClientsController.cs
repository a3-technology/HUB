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
    /// Controlador del módulo CRM — Clientes.
    /// Expone operaciones CRUD y cambio de estado para las empresas cliente.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/clients")]
    [Authorize(Policy = "crm")]
    public class ClientsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public ClientsController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de clientes con filtros opcionales por estado activo y estado de negocio.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="status">Filtra por estado de negocio (Prospect, Active, Inactive).</param>
        /// <returns>200 con la lista de <see cref="CRM.ClientResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool? active = null, [FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Status",   status);

            var result = _repo.GetAll<CRM.ClientResponse>("crm.SP_GetClients", p).ToList();

            foreach (var c in result)
                c.OwnerPhotoUrl = await SignPhotoUrl(c.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna un cliente por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del cliente.</param>
        /// <returns>200 con <see cref="CRM.ClientResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.ClientResponse>("crm.SP_GetClientById", p);
            if (result is null)
                return NotFound(new { message = "Cliente no encontrado." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo cliente.
        /// </summary>
        /// <param name="request">Datos del cliente.</param>
        /// <returns>200 con <see cref="CRM.SP_ClientResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.clients.create", "Crear clientes")]
        public IActionResult Insert([FromBody] CRM.ClientRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",           request.Name.Trim());
            p.Add("@Sector",         request.Sector?.Trim());
            p.Add("@Email",          request.Email?.Trim());
            p.Add("@Phone",          request.Phone?.Trim());
            p.Add("@Website",        request.Website?.Trim());
            p.Add("@Address",        request.Address?.Trim());
            p.Add("@Status",         request.Status);
            p.Add("@EstimatedValue", request.EstimatedValue);
            p.Add("@OwnerId",        request.OwnerId);
            p.Add("@Notes",          request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_ClientResult>("crm.SP_InsertClient", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el cliente." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un cliente existente.
        /// </summary>
        /// <param name="id">Identificador único del cliente a actualizar.</param>
        /// <param name="request">Nuevos datos del cliente.</param>
        /// <returns>200 con <see cref="CRM.SP_ClientResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.clients.update", "Editar clientes")]
        public IActionResult Update(Guid id, [FromBody] CRM.ClientRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",             id);
            p.Add("@Name",           request.Name.Trim());
            p.Add("@Sector",         request.Sector?.Trim());
            p.Add("@Email",          request.Email?.Trim());
            p.Add("@Phone",          request.Phone?.Trim());
            p.Add("@Website",        request.Website?.Trim());
            p.Add("@Address",        request.Address?.Trim());
            p.Add("@Status",         request.Status);
            p.Add("@EstimatedValue", request.EstimatedValue);
            p.Add("@OwnerId",        request.OwnerId);
            p.Add("@Notes",          request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_ClientResult>("crm.SP_UpdateClient", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el cliente." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un cliente (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del cliente.</param>
        /// <returns>200 con <see cref="CRM.SP_ClientResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.clients.toggle", "Activar/desactivar clientes")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ClientResult>("crm.SP_ToggleClientStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del cliente." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un cliente (sus contactos se eliminan en cascada).
        /// </summary>
        /// <param name="id">Identificador único del cliente.</param>
        /// <returns>200 con <see cref="CRM.SP_ClientResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.clients.delete", "Eliminar clientes")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ClientResult>("crm.SP_DeleteClient", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el cliente." });

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
