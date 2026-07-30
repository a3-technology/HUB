using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo CRM — Contactos.
    /// Expone operaciones CRUD y cambio de estado para las personas de contacto de un cliente.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/contacts")]
    [Authorize(Policy = "crm")]
    public class ContactsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ContactsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de contactos con filtros opcionales por cliente y estado activo.
        /// </summary>
        /// <param name="clientId">Filtra los contactos de un cliente específico.</param>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="CRM.ContactResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] Guid? clientId = null, [FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId", clientId);
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<CRM.ContactResponse>("crm.SP_GetContacts", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un contacto por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del contacto.</param>
        /// <returns>200 con <see cref="CRM.ContactResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.ContactResponse>("crm.SP_GetContactById", p);
            if (result is null)
                return NotFound(new { message = "Contacto no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo contacto asociado a un cliente.
        /// </summary>
        /// <param name="request">Datos del contacto.</param>
        /// <returns>200 con <see cref="CRM.SP_ContactResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.contacts.create", "Crear contactos")]
        public IActionResult Insert([FromBody] CRM.ContactRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",  request.ClientId);
            p.Add("@FirstName", request.FirstName.Trim());
            p.Add("@LastName",  request.LastName.Trim());
            p.Add("@Position",  request.Position?.Trim());
            p.Add("@Email",     request.Email?.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@IsPrimary", request.IsPrimary);
            p.Add("@Notes",     request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_ContactResult>("crm.SP_InsertContact", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el contacto." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un contacto existente.
        /// </summary>
        /// <param name="id">Identificador único del contacto a actualizar.</param>
        /// <param name="request">Nuevos datos del contacto.</param>
        /// <returns>200 con <see cref="CRM.SP_ContactResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.contacts.update", "Editar contactos")]
        public IActionResult Update(Guid id, [FromBody] CRM.ContactRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",        id);
            p.Add("@ClientId",  request.ClientId);
            p.Add("@FirstName", request.FirstName.Trim());
            p.Add("@LastName",  request.LastName.Trim());
            p.Add("@Position",  request.Position?.Trim());
            p.Add("@Email",     request.Email?.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@IsPrimary", request.IsPrimary);
            p.Add("@Notes",     request.Notes?.Trim());

            var result = _repo.Get<CRM.SP_ContactResult>("crm.SP_UpdateContact", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el contacto." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un contacto (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del contacto.</param>
        /// <returns>200 con <see cref="CRM.SP_ContactResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.contacts.toggle", "Activar/desactivar contactos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ContactResult>("crm.SP_ToggleContactStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del contacto." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un contacto.
        /// </summary>
        /// <param name="id">Identificador único del contacto.</param>
        /// <returns>200 con <see cref="CRM.SP_ContactResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.contacts.delete", "Eliminar contactos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_ContactResult>("crm.SP_DeleteContact", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el contacto." });

            return Ok(result);
        }
    }
}
