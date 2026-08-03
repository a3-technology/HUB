using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Recursos.
    /// Expone operaciones CRUD y cambio de estado para las asignaciones de
    /// empleados (recursos) a proyectos.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects/resources")]
    [Authorize(Policy = "projects")]
    public class ResourcesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ResourcesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de asignaciones de recursos con filtros opcionales por proyecto y estado activo.
        /// </summary>
        /// <param name="projectId">Filtra las asignaciones de un proyecto específico.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="PM.ResourceResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] Guid? projectId = null, [FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@ProjectId", projectId);
            p.Add("@IsActive",  active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<PM.ResourceResponse>("pm.SP_GetResources", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una asignación de recurso por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la asignación.</param>
        /// <returns>200 con <see cref="PM.ResourceResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.ResourceResponse>("pm.SP_GetResourceById", p);
            if (result is null)
                return NotFound(new { message = "Asignación no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Asigna un empleado como recurso de un proyecto.
        /// </summary>
        /// <param name="request">Datos de la asignación.</param>
        /// <returns>200 con <see cref="PM.SP_ResourceResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("projects.resources.create", "Asignar recursos a proyectos")]
        public IActionResult Insert([FromBody] PM.ResourceRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ProjectId",  request.ProjectId);
            p.Add("@EmployeeId", request.EmployeeId);

            var result = _repo.Get<PM.SP_ResourceResult>("pm.SP_InsertResource", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al asignar el recurso." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una asignación de recurso existente.
        /// </summary>
        /// <param name="id">Identificador único de la asignación a actualizar.</param>
        /// <param name="request">Nuevos datos de la asignación.</param>
        /// <returns>200 con <see cref="PM.SP_ResourceResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("projects.resources.update", "Editar asignaciones de recursos")]
        public IActionResult Update(Guid id, [FromBody] PM.ResourceRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",         id);
            p.Add("@ProjectId",  request.ProjectId);
            p.Add("@EmployeeId", request.EmployeeId);

            var result = _repo.Get<PM.SP_ResourceResult>("pm.SP_UpdateResource", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la asignación." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una asignación de recurso (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la asignación.</param>
        /// <returns>200 con <see cref="PM.SP_ResourceResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("projects.resources.toggle", "Activar/desactivar asignaciones de recursos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.SP_ResourceResult>("pm.SP_ToggleResourceStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la asignación." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una asignación de recurso.
        /// </summary>
        /// <param name="id">Identificador único de la asignación.</param>
        /// <returns>200 con <see cref="PM.SP_ResourceResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.resources.delete", "Eliminar asignaciones de recursos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.SP_ResourceResult>("pm.SP_DeleteResource", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la asignación." });

            return Ok(result);
        }
    }
}
