using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo CRM — Sucursales.
    /// Expone operaciones CRUD y cambio de estado para las sucursales de una empresa.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/branches")]
    [Authorize(Policy = "crm")]
    public class BranchesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public BranchesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de sucursales con filtros opcionales por empresa y estado activo.
        /// </summary>
        /// <param name="companyId">Filtra las sucursales de una empresa específica.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="CRM.BranchResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] Guid? companyId = null, [FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@CompanyId", companyId);
            p.Add("@IsActive",  active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<CRM.BranchResponse>("crm.SP_GetBranches", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una sucursal por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la sucursal.</param>
        /// <returns>200 con <see cref="CRM.BranchResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.BranchResponse>("crm.SP_GetBranchById", p);
            if (result is null)
                return NotFound(new { message = "Sucursal no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva sucursal asociada a una empresa.
        /// </summary>
        /// <param name="request">Datos de la sucursal.</param>
        /// <returns>200 con <see cref="CRM.SP_BranchResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.branches.create", "Crear sucursales")]
        public IActionResult Insert([FromBody] CRM.BranchRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@CompanyId", request.CompanyId);
            p.Add("@Name",      request.Name.Trim());
            p.Add("@TaxId",     request.TaxId?.Trim());
            p.Add("@Address",   request.Address?.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@Email",     request.Email?.Trim());
            p.Add("@IsMain",    request.IsMain);

            var result = _repo.Get<CRM.SP_BranchResult>("crm.SP_InsertBranch", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la sucursal." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una sucursal existente.
        /// </summary>
        /// <param name="id">Identificador único de la sucursal a actualizar.</param>
        /// <param name="request">Nuevos datos de la sucursal.</param>
        /// <returns>200 con <see cref="CRM.SP_BranchResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.branches.update", "Editar sucursales")]
        public IActionResult Update(Guid id, [FromBody] CRM.BranchRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",        id);
            p.Add("@CompanyId", request.CompanyId);
            p.Add("@Name",      request.Name.Trim());
            p.Add("@TaxId",     request.TaxId?.Trim());
            p.Add("@Address",   request.Address?.Trim());
            p.Add("@Phone",     request.Phone?.Trim());
            p.Add("@Email",     request.Email?.Trim());
            p.Add("@IsMain",    request.IsMain);

            var result = _repo.Get<CRM.SP_BranchResult>("crm.SP_UpdateBranch", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la sucursal." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una sucursal (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la sucursal.</param>
        /// <returns>200 con <see cref="CRM.SP_BranchResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.branches.toggle", "Activar/desactivar sucursales")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_BranchResult>("crm.SP_ToggleBranchStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la sucursal." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una sucursal.
        /// </summary>
        /// <param name="id">Identificador único de la sucursal.</param>
        /// <returns>200 con <see cref="CRM.SP_BranchResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.branches.delete", "Eliminar sucursales")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_BranchResult>("crm.SP_DeleteBranch", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la sucursal." });

            return Ok(result);
        }
    }
}
