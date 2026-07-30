using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Departamentos.
    /// Expone operaciones CRUD y cambio de estado para los departamentos de la organización.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/departments")]
    [Authorize(Policy = "hr")]
    public class DepartmentsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public DepartmentsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de departamentos con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.DepartmentResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.DepartmentResponse>("hr.SP_GetDepartments", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un departamento por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del departamento.</param>
        /// <returns>200 con <see cref="HR.DepartmentResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.DepartmentResponse>("hr.SP_GetDepartmentById", p);
            if (result is null)
                return NotFound(new { message = "Departamento no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo departamento validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del departamento.</param>
        /// <returns>200 con <see cref="HR.SP_DepartmentResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.departments.create", "Crear departamentos")]
        public IActionResult Insert([FromBody] HR.DepartmentRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_DepartmentResult>("hr.SP_InsertDepartment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el departamento." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un departamento existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del departamento a actualizar.</param>
        /// <param name="request">Nuevos datos del departamento.</param>
        /// <returns>200 con <see cref="HR.SP_DepartmentResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.departments.update", "Editar departamentos")]
        public IActionResult Update(Guid id, [FromBody] HR.DepartmentRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_DepartmentResult>("hr.SP_UpdateDepartment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el departamento." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un departamento (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del departamento.</param>
        /// <returns>200 con <see cref="HR.SP_DepartmentResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.departments.toggle", "Activar/desactivar departamentos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_DepartmentResult>("hr.SP_ToggleDepartmentStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del departamento." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un departamento.
        /// </summary>
        /// <param name="id">Identificador único del departamento.</param>
        /// <returns>200 con <see cref="HR.SP_DepartmentResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.departments.delete", "Eliminar departamentos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_DepartmentResult>("hr.SP_DeleteDepartment", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el departamento." });

            return Ok(result);
        }
    }
}
