using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Cargos.
    /// Expone operaciones CRUD y cambio de estado para los cargos de la organización.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/positions")]
    [Authorize(Policy = "hr")]
    public class PositionsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public PositionsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de cargos con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.PositionResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.PositionResponse>("hr.SP_GetPositions", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un cargo por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del cargo.</param>
        /// <returns>200 con <see cref="HR.PositionResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.PositionResponse>("hr.SP_GetPositionById", p);
            if (result is null)
                return NotFound(new { message = "Cargo no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo cargo validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del cargo.</param>
        /// <returns>200 con <see cref="HR.SP_PositionResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.positions.create", "Crear cargos")]
        public IActionResult Insert([FromBody] HR.PositionRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_PositionResult>("hr.SP_InsertPosition", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el cargo." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un cargo existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del cargo a actualizar.</param>
        /// <param name="request">Nuevos datos del cargo.</param>
        /// <returns>200 con <see cref="HR.SP_PositionResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.positions.update", "Editar cargos")]
        public IActionResult Update(Guid id, [FromBody] HR.PositionRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_PositionResult>("hr.SP_UpdatePosition", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el cargo." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un cargo (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del cargo.</param>
        /// <returns>200 con <see cref="HR.SP_PositionResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.positions.toggle", "Activar/desactivar cargos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PositionResult>("hr.SP_TogglePositionStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del cargo." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un cargo.
        /// No se permite si tiene empleados asociados.
        /// </summary>
        /// <param name="id">Identificador único del cargo.</param>
        /// <returns>200 con <see cref="HR.SP_PositionResult"/> o 400 si no existe o tiene empleados.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.positions.delete", "Eliminar cargos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_PositionResult>("hr.SP_DeletePosition", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el cargo." });

            return Ok(result);
        }
    }
}
