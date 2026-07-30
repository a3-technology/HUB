using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Tipos de identificación.
    /// Expone operaciones CRUD y cambio de estado para los tipos de identificación
    /// usados por los empleados (cédula, pasaporte, etc.).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/identification-types")]
    [Authorize(Policy = "hr")]
    public class IdentificationTypesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public IdentificationTypesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de tipos de identificación con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.IdentificationTypeResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.IdentificationTypeResponse>("hr.SP_GetIdentificationTypes", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un tipo de identificación por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del tipo de identificación.</param>
        /// <returns>200 con <see cref="HR.IdentificationTypeResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.IdentificationTypeResponse>("hr.SP_GetIdentificationTypeById", p);
            if (result is null)
                return NotFound(new { message = "Tipo de identificación no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo tipo de identificación validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del tipo de identificación.</param>
        /// <returns>200 con <see cref="HR.SP_IdentificationTypeResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.identification-types.create", "Crear tipos de identificación")]
        public IActionResult Insert([FromBody] HR.IdentificationTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_IdentificationTypeResult>("hr.SP_InsertIdentificationType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el tipo de identificación." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un tipo de identificación existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del tipo de identificación a actualizar.</param>
        /// <param name="request">Nuevos datos del tipo de identificación.</param>
        /// <returns>200 con <see cref="HR.SP_IdentificationTypeResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.identification-types.update", "Editar tipos de identificación")]
        public IActionResult Update(Guid id, [FromBody] HR.IdentificationTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_IdentificationTypeResult>("hr.SP_UpdateIdentificationType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el tipo de identificación." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un tipo de identificación (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del tipo de identificación.</param>
        /// <returns>200 con <see cref="HR.SP_IdentificationTypeResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.identification-types.toggle", "Activar/desactivar tipos de identificación")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_IdentificationTypeResult>("hr.SP_ToggleIdentificationTypeStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del tipo de identificación." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un tipo de identificación.
        /// No se permite si tiene empleados asociados.
        /// </summary>
        /// <param name="id">Identificador único del tipo de identificación.</param>
        /// <returns>200 con <see cref="HR.SP_IdentificationTypeResult"/> o 400 si no existe o tiene empleados.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.identification-types.delete", "Eliminar tipos de identificación")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_IdentificationTypeResult>("hr.SP_DeleteIdentificationType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el tipo de identificación." });

            return Ok(result);
        }
    }
}
