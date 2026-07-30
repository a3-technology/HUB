using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Modalidades de trabajo.
    /// Expone operaciones CRUD y cambio de estado para las modalidades de trabajo
    /// de los empleados (presencial, remoto, híbrido).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/work-modalities")]
    [Authorize(Policy = "hr")]
    public class WorkModalitiesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public WorkModalitiesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de modalidades de trabajo con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="HR.WorkModalityResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.WorkModalityResponse>("hr.SP_GetWorkModalities", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una modalidad de trabajo por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la modalidad de trabajo.</param>
        /// <returns>200 con <see cref="HR.WorkModalityResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.WorkModalityResponse>("hr.SP_GetWorkModalityById", p);
            if (result is null)
                return NotFound(new { message = "Modalidad de trabajo no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva modalidad de trabajo validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción de la modalidad de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkModalityResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.work-modalities.create", "Crear modalidades de trabajo")]
        public IActionResult Insert([FromBody] HR.WorkModalityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_WorkModalityResult>("hr.SP_InsertWorkModality", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la modalidad de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una modalidad de trabajo existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único de la modalidad de trabajo a actualizar.</param>
        /// <param name="request">Nuevos datos de la modalidad de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkModalityResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.work-modalities.update", "Editar modalidades de trabajo")]
        public IActionResult Update(Guid id, [FromBody] HR.WorkModalityRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_WorkModalityResult>("hr.SP_UpdateWorkModality", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la modalidad de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una modalidad de trabajo (eliminación lógica).
        /// Si estaba activa la desactiva; si estaba inactiva la reactiva.
        /// </summary>
        /// <param name="id">Identificador único de la modalidad de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkModalityResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.work-modalities.toggle", "Activar/desactivar modalidades de trabajo")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_WorkModalityResult>("hr.SP_ToggleWorkModalityStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la modalidad de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una modalidad de trabajo.
        /// No se permite si tiene empleados asociados.
        /// </summary>
        /// <param name="id">Identificador único de la modalidad de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkModalityResult"/> o 400 si no existe o tiene empleados.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.work-modalities.delete", "Eliminar modalidades de trabajo")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_WorkModalityResult>("hr.SP_DeleteWorkModality", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la modalidad de trabajo." });

            return Ok(result);
        }
    }
}
