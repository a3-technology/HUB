using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Dependencias entre tareas.
    /// Expone la consulta y gestión de relaciones finish-to-start (una tarea no
    /// puede iniciar hasta que su predecesora termine).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects/tasks/dependencies")]
    [Authorize(Policy = "projects")]
    public class TaskDependenciesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TaskDependenciesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna los predecesores de una tarea específica.
        /// </summary>
        /// <param name="taskId">Identificador de la tarea.</param>
        /// <returns>200 con la lista de <see cref="PM.DependencyResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetByTask([FromQuery] Guid? taskId)
        {
            if (taskId is null)
                return BadRequest(new { message = "Debes indicar taskId." });

            var p = new DynamicParameters();
            p.Add("@TaskId", taskId);

            var result = _repo.GetAll<PM.DependencyResponse>("pm.SP_GetTaskDependencies", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna todas las relaciones de dependencia de un proyecto (usado por el Gantt del Cronograma).
        /// </summary>
        /// <param name="projectId">Identificador del proyecto.</param>
        /// <returns>200 con la lista de <see cref="PM.ProjectDependencyResponse"/>.</returns>
        [HttpGet("by-project")]
        public IActionResult GetByProject([FromQuery] Guid? projectId)
        {
            if (projectId is null)
                return BadRequest(new { message = "Debes indicar projectId." });

            var p = new DynamicParameters();
            p.Add("@ProjectId", projectId);

            var result = _repo.GetAll<PM.ProjectDependencyResponse>("pm.SP_GetProjectDependencies", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea una dependencia finish-to-start entre dos tareas del mismo proyecto.
        /// </summary>
        /// <param name="request">Tarea y su predecesora.</param>
        /// <returns>200 con <see cref="PM.SP_DependencyResult"/> o 400 si hay error (duplicado, ciclo, distinto proyecto).</returns>
        [HttpPost]
        [RequirePermission("projects.tasks.dependency-create", "Agregar dependencias entre tareas")]
        public IActionResult Insert([FromBody] PM.DependencyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@TaskId",          request.TaskId);
            p.Add("@DependsOnTaskId", request.DependsOnTaskId);

            var result = _repo.Get<PM.SP_DependencyResult>("pm.SP_InsertTaskDependency", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al agregar la dependencia." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina una relación de dependencia entre tareas.
        /// </summary>
        /// <param name="id">Identificador único de la dependencia.</param>
        /// <returns>200 con <see cref="PM.SP_DependencyResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.tasks.dependency-delete", "Eliminar dependencias entre tareas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.SP_DependencyResult>("pm.SP_DeleteTaskDependency", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la dependencia." });

            return Ok(result);
        }
    }
}
