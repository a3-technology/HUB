using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo CRM — Empresas.
    /// Expone operaciones CRUD y cambio de estado para las empresas cliente.
    /// Cada empresa puede tener varias sucursales (<see cref="BranchesController"/>).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema crm.
    /// </summary>
    [ApiController]
    [Route("api/crm/companies")]
    [Authorize(Policy = "crm")]
    public class CompaniesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public CompaniesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de empresas con filtro opcional por estado activo.
        /// </summary>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="CRM.CompanyResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<CRM.CompanyResponse>("crm.SP_GetCompanies", p).ToList();

            foreach (var c in result)
                c.OwnerPhotoUrl = await SignPhotoUrl(c.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una empresa por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la empresa.</param>
        /// <returns>200 con <see cref="CRM.CompanyResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.CompanyResponse>("crm.SP_GetCompanyById", p);
            if (result is null)
                return NotFound(new { message = "Empresa no encontrada." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva empresa.
        /// </summary>
        /// <param name="request">Datos de la empresa.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("crm.companies.create", "Crear empresas")]
        public IActionResult Insert([FromBody] CRM.CompanyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",           request.Name.Trim());
            p.Add("@TaxId",          request.TaxId?.Trim());
            p.Add("@IndustryId",     request.IndustryId);
            p.Add("@CountryId",      request.CountryId);
            p.Add("@Email",          request.Email?.Trim());
            p.Add("@Phone",          request.Phone?.Trim());
            p.Add("@Address",        request.Address?.Trim());
            p.Add("@OwnerId",        request.OwnerId);

            var result = _repo.Get<CRM.SP_CompanyResult>("crm.SP_InsertCompany", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la empresa." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una empresa existente.
        /// </summary>
        /// <param name="id">Identificador único de la empresa a actualizar.</param>
        /// <param name="request">Nuevos datos de la empresa.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("crm.companies.update", "Editar empresas")]
        public IActionResult Update(Guid id, [FromBody] CRM.CompanyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",             id);
            p.Add("@Name",           request.Name.Trim());
            p.Add("@TaxId",          request.TaxId?.Trim());
            p.Add("@IndustryId",     request.IndustryId);
            p.Add("@CountryId",      request.CountryId);
            p.Add("@Email",          request.Email?.Trim());
            p.Add("@Phone",          request.Phone?.Trim());
            p.Add("@Address",        request.Address?.Trim());
            p.Add("@OwnerId",        request.OwnerId);

            var result = _repo.Get<CRM.SP_CompanyResult>("crm.SP_UpdateCompany", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la empresa." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una empresa (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la empresa.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("crm.companies.toggle", "Activar/desactivar empresas")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_CompanyResult>("crm.SP_ToggleCompanyStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la empresa." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una empresa (sus sucursales se eliminan en cascada).
        /// </summary>
        /// <param name="id">Identificador único de la empresa.</param>
        /// <returns>200 con <see cref="CRM.SP_CompanyResult"/> o 400 si no existe.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("crm.companies.delete", "Eliminar empresas")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<CRM.SP_CompanyResult>("crm.SP_DeleteCompany", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la empresa." });

            return Ok(result);
        }

        /// <summary>
        /// Convierte la ruta de blob de la foto del ejecutivo asignado en una URL firmada
        /// temporal (60 minutos). Retorna null si no tiene foto.
        /// </summary>
        private async Task<string?> SignPhotoUrl(string? photoPath)
        {
            if (string.IsNullOrWhiteSpace(photoPath))
                return null;

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return url.ToString();
        }
    }
}
