using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Seguridad — Roles.
    /// Expone operaciones CRUD, cambio de estado y asignación de módulos para los roles.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/security/roles")]
    [Authorize(Policy = "security")]
    public class RolesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public RolesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de roles con filtro opcional por estado.
        /// Incluye la cantidad de usuarios y los módulos permitidos de cada rol.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="DBO.RoleResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<DBO.RoleResponse>("dbo.SP_GetRoles", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un rol por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del rol.</param>
        /// <returns>200 con <see cref="DBO.RoleResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.RoleResponse>("dbo.SP_GetRoleById", p);
            if (result is null)
                return NotFound(new { message = "Rol no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo rol con sus módulos permitidos, validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre, descripción y módulos del rol.</param>
        /// <returns>200 con <see cref="DBO.SP_RoleResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("security.roles.create", "Crear roles")]
        public IActionResult Insert([FromBody] DBO.RoleRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",          request.Name.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@ModuleIds",     string.Join(",", request.ModuleIds));
            p.Add("@PermissionIds", string.Join(",", request.PermissionIds));

            var result = _repo.Get<DBO.SP_RoleResult>("dbo.SP_InsertRole", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el rol." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos y módulos de un rol existente.
        /// Los módulos recibidos reemplazan por completo a los actuales.
        /// </summary>
        /// <param name="id">Identificador único del rol a actualizar.</param>
        /// <param name="request">Nuevos datos del rol.</param>
        /// <returns>200 con <see cref="DBO.SP_RoleResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("security.roles.update", "Editar roles")]
        public IActionResult Update(Guid id, [FromBody] DBO.RoleRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",            id);
            p.Add("@Name",          request.Name.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@ModuleIds",     string.Join(",", request.ModuleIds));
            p.Add("@PermissionIds", string.Join(",", request.PermissionIds));

            var result = _repo.Get<DBO.SP_RoleResult>("dbo.SP_UpdateRole", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el rol." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un rol (eliminación lógica).
        /// Un rol inactivo deja a sus usuarios sin módulos (solo dashboard).
        /// </summary>
        /// <param name="id">Identificador único del rol.</param>
        /// <returns>200 con <see cref="DBO.SP_RoleResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("security.roles.toggle", "Activar/desactivar roles")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_RoleResult>("dbo.SP_ToggleRoleStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del rol." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un rol.
        /// No se permite si tiene usuarios asociados.
        /// </summary>
        /// <param name="id">Identificador único del rol.</param>
        /// <returns>200 con <see cref="DBO.SP_RoleResult"/> o 400 si no existe o tiene usuarios.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("security.roles.delete", "Eliminar roles")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_RoleResult>("dbo.SP_DeleteRole", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el rol." });

            return Ok(result);
        }
    }
}
