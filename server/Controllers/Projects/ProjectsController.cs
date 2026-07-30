using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Gestión de Proyectos — Proyectos.
    /// Expone operaciones CRUD y cambio de estado para los proyectos de la organización.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema pm.
    /// </summary>
    [ApiController]
    [Route("api/projects")]
    [Authorize(Policy = "projects")]
    public class ProjectsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ProjectsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de proyectos con filtros opcionales por estado activo y estado de flujo.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="status">Filtra por estado de flujo (Planned, InProgress, OnHold, Completed, Cancelled).</param>
        /// <returns>200 con la lista de <see cref="Projects.ProjectResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null, [FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Status", status);

            var result = _repo.GetAll<Projects.ProjectResponse>("pm.SP_GetProjects", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un proyecto por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del proyecto.</param>
        /// <returns>200 con <see cref="Projects.ProjectResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.ProjectResponse>("pm.SP_GetProjectById", p);
            if (result is null)
                return NotFound(new { message = "Proyecto no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo proyecto validando unicidad del código.
        /// </summary>
        /// <param name="request">Datos del proyecto.</param>
        /// <returns>200 con <see cref="Projects.SP_ProjectResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("projects.projects.create", "Crear proyectos")]
        public IActionResult Insert([FromBody] Projects.ProjectRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Code",        request.Code.Trim());
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());
            p.Add("@ManagerId",   request.ManagerId);
            p.Add("@StartDate",   request.StartDate);
            p.Add("@EndDate",     request.EndDate);
            p.Add("@Status",      request.Status);
            p.Add("@Budget",      request.Budget);

            var result = _repo.Get<Projects.SP_ProjectResult>("pm.SP_InsertProject", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el proyecto." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un proyecto existente.
        /// Valida unicidad del código excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del proyecto a actualizar.</param>
        /// <param name="request">Nuevos datos del proyecto.</param>
        /// <returns>200 con <see cref="Projects.SP_ProjectResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("projects.projects.update", "Editar proyectos")]
        public IActionResult Update(Guid id, [FromBody] Projects.ProjectRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Code",        request.Code.Trim());
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());
            p.Add("@ManagerId",   request.ManagerId);
            p.Add("@StartDate",   request.StartDate);
            p.Add("@EndDate",     request.EndDate);
            p.Add("@Status",      request.Status);
            p.Add("@Budget",      request.Budget);

            var result = _repo.Get<Projects.SP_ProjectResult>("pm.SP_UpdateProject", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el proyecto." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un proyecto (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del proyecto.</param>
        /// <returns>200 con <see cref="Projects.SP_ProjectResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("projects.projects.toggle", "Activar/desactivar proyectos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.SP_ProjectResult>("pm.SP_ToggleProjectStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del proyecto." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un proyecto (y en cascada sus tareas y recursos).
        /// </summary>
        /// <param name="id">Identificador único del proyecto.</param>
        /// <returns>200 con <see cref="Projects.SP_ProjectResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("projects.projects.delete", "Eliminar proyectos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Projects.SP_ProjectResult>("pm.SP_DeleteProject", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el proyecto." });

            return Ok(result);
        }
    }
}
