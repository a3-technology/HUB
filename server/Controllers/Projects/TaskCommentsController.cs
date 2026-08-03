using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Comentarios de tarea.
    /// Expone la consulta y gestión de comentarios de colaboración por tarea.
    /// La autoría se toma del claim "sub" del JWT (la cuenta autenticada), no
    /// del empleado — igual que <c>hr.LeavesController.CurrentUserId</c>.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects/tasks/comments")]
    [Authorize(Policy = "projects")]
    public class TaskCommentsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public TaskCommentsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna los comentarios de una tarea, del más antiguo al más reciente.
        /// </summary>
        /// <param name="taskId">Identificador de la tarea.</param>
        /// <returns>200 con la lista de <see cref="PM.CommentResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetByTask([FromQuery] Guid? taskId)
        {
            if (taskId is null)
                return BadRequest(new { message = "Debes indicar taskId." });

            var p = new DynamicParameters();
            p.Add("@TaskId", taskId);

            var result = _repo.GetAll<PM.CommentResponse>("pm.SP_GetTaskComments", p);
            return Ok(result);
        }

        /// <summary>
        /// Agrega un comentario a una tarea, con autoría del usuario autenticado.
        /// </summary>
        /// <param name="taskId">Identificador de la tarea comentada.</param>
        /// <param name="request">Texto del comentario.</param>
        /// <returns>200 con <see cref="PM.SP_CommentResult"/> o 400 si hay error.</returns>
        [HttpPost("{taskId:guid}")]
        [RequirePermission("projects.tasks.comment-create", "Comentar tareas")]
        public IActionResult Insert(Guid taskId, [FromBody] PM.CommentRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@TaskId", taskId);
            p.Add("@UserId", CurrentUserId);
            p.Add("@Text",   request.Text.Trim());

            var result = _repo.Get<PM.SP_CommentResult>("pm.SP_InsertTaskComment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al agregar el comentario." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina un comentario, solo si pertenece al usuario autenticado.
        /// </summary>
        /// <param name="id">Identificador único del comentario.</param>
        /// <returns>200 con <see cref="PM.SP_CommentResult"/> o 400 si no existe o no es el autor.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.tasks.comment-delete", "Eliminar comentarios de tareas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@UserId", CurrentUserId);

            var result = _repo.Get<PM.SP_CommentResult>("pm.SP_DeleteTaskComment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el comentario." });

            return Ok(result);
        }
    }
}
