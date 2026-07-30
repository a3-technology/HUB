using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Tipos de trabajo.
    /// Expone operaciones CRUD y cambio de estado para los tipos de trabajo
    /// que clasifican las horas registradas (ordinaria, extra, nocturna,
    /// feriado, por servicio…), cada uno con su multiplicador de tarifa.
    /// Todas las operaciones de base de datos se realizan a través de
    /// <see cref="IGenericRepository"/> usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/work-types")]
    [Authorize(Policy = "hr")]
    public class WorkTypesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public WorkTypesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de tipos de trabajo con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.WorkTypeResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.WorkTypeResponse>("hr.SP_GetWorkTypes", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un tipo de trabajo por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del tipo de trabajo.</param>
        /// <returns>200 con <see cref="HR.WorkTypeResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.WorkTypeResponse>("hr.SP_GetWorkTypeById", p);
            if (result is null)
                return NotFound(new { message = "Tipo de trabajo no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo tipo de trabajo validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre, descripción y multiplicador de tarifa.</param>
        /// <returns>200 con <see cref="HR.SP_WorkTypeResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("hr.work-types.create", "Crear tipos de trabajo")]
        public IActionResult Insert([FromBody] HR.WorkTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",           request.Name.Trim());
            p.Add("@Description",    string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim());
            p.Add("@RateMultiplier", request.RateMultiplier);

            var result = _repo.Get<HR.SP_WorkTypeResult>("hr.SP_InsertWorkType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el tipo de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza un tipo de trabajo existente validando unicidad del nombre.
        /// </summary>
        /// <param name="id">Identificador único del tipo de trabajo a actualizar.</param>
        /// <param name="request">Nuevos datos del tipo de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkTypeResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.work-types.update", "Editar tipos de trabajo")]
        public IActionResult Update(Guid id, [FromBody] HR.WorkTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",             id);
            p.Add("@Name",           request.Name.Trim());
            p.Add("@Description",    string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim());
            p.Add("@RateMultiplier", request.RateMultiplier);

            var result = _repo.Get<HR.SP_WorkTypeResult>("hr.SP_UpdateWorkType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el tipo de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un tipo de trabajo (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del tipo de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkTypeResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.work-types.toggle", "Activar/desactivar tipos de trabajo")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_WorkTypeResult>("hr.SP_ToggleWorkTypeStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del tipo de trabajo." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un tipo de trabajo.
        /// No se permite si tiene horas registradas.
        /// </summary>
        /// <param name="id">Identificador único del tipo de trabajo.</param>
        /// <returns>200 con <see cref="HR.SP_WorkTypeResult"/> o 400 si no existe o tiene horas.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.work-types.delete", "Eliminar tipos de trabajo")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_WorkTypeResult>("hr.SP_DeleteWorkType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el tipo de trabajo." });

            return Ok(result);
        }
    }
}
