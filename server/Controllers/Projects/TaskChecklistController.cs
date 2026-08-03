using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Checklist de tarea.
    /// Expone una lista simple de pendientes (texto + check) dentro de una tarea,
    /// sin fecha ni responsable propios — más liviana que crear tareas o dependencias.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects/tasks/checklist")]
    [Authorize(Policy = "projects")]
    public class TaskChecklistController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TaskChecklistController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna los ítems del checklist de una tarea.
        /// </summary>
        /// <param name="taskId">Identificador de la tarea.</param>
        /// <returns>200 con la lista de <see cref="PM.ChecklistItemResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetByTask([FromQuery] Guid? taskId)
        {
            if (taskId is null)
                return BadRequest(new { message = "Debes indicar taskId." });

            var p = new DynamicParameters();
            p.Add("@TaskId", taskId);

            var result = _repo.GetAll<PM.ChecklistItemResponse>("pm.SP_GetTaskChecklist", p);
            return Ok(result);
        }

        /// <summary>
        /// Agrega un ítem al checklist de una tarea.
        /// </summary>
        /// <param name="taskId">Identificador de la tarea.</param>
        /// <param name="request">Texto del ítem.</param>
        /// <returns>200 con <see cref="PM.SP_ChecklistResult"/> o 400 si hay error.</returns>
        [HttpPost("{taskId:guid}")]
        [RequirePermission("projects.tasks.checklist-item-create", "Agregar ítems al checklist de tareas")]
        public IActionResult Insert(Guid taskId, [FromBody] PM.ChecklistItemRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@TaskId", taskId);
            p.Add("@Text",   request.Text.Trim());

            var result = _repo.Get<PM.SP_ChecklistResult>("pm.SP_InsertTaskChecklistItem", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al agregar el ítem." });

            return Ok(result);
        }

        /// <summary>
        /// Marca/desmarca un ítem del checklist.
        /// </summary>
        /// <param name="id">Identificador único del ítem.</param>
        /// <returns>200 con <see cref="PM.SP_ChecklistResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("projects.tasks.checklist-item-toggle", "Marcar/desmarcar ítems del checklist de tareas")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.SP_ChecklistResult>("pm.SP_ToggleTaskChecklistItem", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el ítem." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina un ítem del checklist.
        /// </summary>
        /// <param name="id">Identificador único del ítem.</param>
        /// <returns>200 con <see cref="PM.SP_ChecklistResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.tasks.checklist-item-delete", "Eliminar ítems del checklist de tareas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<PM.SP_ChecklistResult>("pm.SP_DeleteTaskChecklistItem", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el ítem." });

            return Ok(result);
        }
    }
}
