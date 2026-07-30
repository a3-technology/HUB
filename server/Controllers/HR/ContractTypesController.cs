using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Tipos de contrato.
    /// Expone operaciones CRUD y cambio de estado para los tipos de contrato
    /// laboral de los empleados (indefinido, plazo fijo, por obra o servicio…).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/contract-types")]
    [Authorize(Policy = "hr")]
    public class ContractTypesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ContractTypesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de tipos de contrato con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.ContractTypeResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.ContractTypeResponse>("hr.SP_GetContractTypes", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un tipo de contrato por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del tipo de contrato.</param>
        /// <returns>200 con <see cref="HR.ContractTypeResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.ContractTypeResponse>("hr.SP_GetContractTypeById", p);
            if (result is null)
                return NotFound(new { message = "Tipo de contrato no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo tipo de contrato validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del tipo de contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractTypeResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.contract-types.create", "Crear tipos de contrato")]
        public IActionResult Insert([FromBody] HR.ContractTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_ContractTypeResult>("hr.SP_InsertContractType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el tipo de contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un tipo de contrato existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del tipo de contrato a actualizar.</param>
        /// <param name="request">Nuevos datos del tipo de contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractTypeResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.contract-types.update", "Editar tipos de contrato")]
        public IActionResult Update(Guid id, [FromBody] HR.ContractTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_ContractTypeResult>("hr.SP_UpdateContractType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el tipo de contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un tipo de contrato (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del tipo de contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractTypeResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.contract-types.toggle", "Activar/desactivar tipos de contrato")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_ContractTypeResult>("hr.SP_ToggleContractTypeStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del tipo de contrato." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un tipo de contrato.
        /// No se permite si tiene empleados asociados.
        /// </summary>
        /// <param name="id">Identificador único del tipo de contrato.</param>
        /// <returns>200 con <see cref="HR.SP_ContractTypeResult"/> o 400 si no existe o tiene empleados.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.contract-types.delete", "Eliminar tipos de contrato")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_ContractTypeResult>("hr.SP_DeleteContractType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el tipo de contrato." });

            return Ok(result);
        }
    }
}
