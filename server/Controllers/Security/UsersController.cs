using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Seguridad — Usuarios.
    /// Permite al administrador crear usuarios (opcionalmente vinculados a un empleado),
    /// asignar roles, restablecer contraseñas y activar/desactivar cuentas.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/security/users")]
    [Authorize(Policy = "security")]
    public class UsersController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public UsersController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>Identificador del usuario autenticado, extraído del claim "sub" del JWT.</summary>
        private Guid CurrentUserId =>
            Guid.TryParse(User.FindFirst("sub")?.Value, out var id) ? id : Guid.Empty;

        /// <summary>
        /// Retorna la lista de usuarios con su rol y empleado vinculado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="roleId">Filtra por rol (ej. desde el badge de usuarios en RolesPage).</param>
        /// <returns>200 con la lista de <see cref="DBO.UserResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null, [FromQuery] Guid? roleId = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@RoleId", roleId);

            var result = _repo.GetAll<DBO.UserResponse>("dbo.SP_GetUsers", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo usuario con contraseña inicial y rol asignado.
        /// Si se indica un empleado, valida que no tenga ya un usuario.
        /// </summary>
        /// <param name="request">Nombre, correo, contraseña, rol y empleado opcional.</param>
        /// <returns>200 con <see cref="DBO.SP_UserResult"/> o 400 si hay conflicto.</returns>
        [HttpPost]
        [RequirePermission("security.users.create", "Crear usuarios")]
        public IActionResult Insert([FromBody] DBO.UserCreateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Names",      request.Names.Trim());
            p.Add("@Email",      request.Email.Trim().ToLower());
            p.Add("@Password",   request.Password);
            p.Add("@RoleId",     request.RoleId);
            p.Add("@EmployeeId", request.EmployeeId);

            var result = _repo.Get<DBO.SP_UserResult>("dbo.SP_InsertUser", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el usuario." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos, rol y empleado vinculado de un usuario existente.
        /// La contraseña no se modifica por esta vía (ver restablecer contraseña).
        /// </summary>
        /// <param name="id">Identificador único del usuario a actualizar.</param>
        /// <param name="request">Nuevos datos del usuario.</param>
        /// <returns>200 con <see cref="DBO.SP_UserResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("security.users.update", "Editar usuarios")]
        public IActionResult Update(Guid id, [FromBody] DBO.UserUpdateRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",         id);
            p.Add("@Names",      request.Names.Trim());
            p.Add("@Email",      request.Email.Trim().ToLower());
            p.Add("@RoleId",     request.RoleId);
            p.Add("@EmployeeId", request.EmployeeId);

            var result = _repo.Get<DBO.SP_UserResult>("dbo.SP_UpdateUser", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el usuario." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un usuario.
        /// Al desactivar se revocan sus sesiones activas. No permite desactivarse a sí mismo.
        /// </summary>
        /// <param name="id">Identificador único del usuario.</param>
        /// <returns>200 con <see cref="DBO.SP_UserResult"/> o 400 si no existe o es el propio usuario.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("security.users.toggle", "Activar/desactivar usuarios")]
        public IActionResult Toggle(Guid id)
        {
            if (id == CurrentUserId)
                return BadRequest(new { message = "No puedes desactivar tu propio usuario." });

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_UserResult>("dbo.SP_ToggleUserStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del usuario." });

            return Ok(result);
        }

        /// <summary>
        /// Restablece la contraseña de un usuario y revoca sus sesiones activas.
        /// </summary>
        /// <param name="id">Identificador único del usuario.</param>
        /// <param name="request">Nueva contraseña.</param>
        /// <returns>200 con <see cref="DBO.SP_UserResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/reset-password")]
        [RequirePermission("security.users.reset-password", "Restablecer la contraseña de usuarios")]
        public IActionResult ResetPassword(Guid id, [FromBody] DBO.UserResetPasswordRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@NewPassword", request.NewPassword);

            var result = _repo.Get<DBO.SP_UserResult>("dbo.SP_ResetUserPassword", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al restablecer la contraseña." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un usuario junto con sus refresh tokens.
        /// No permite eliminarse a sí mismo.
        /// </summary>
        /// <param name="id">Identificador único del usuario.</param>
        /// <returns>200 con <see cref="DBO.SP_UserResult"/> o 400 si no existe o es el propio usuario.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("security.users.delete", "Eliminar usuarios")]
        public IActionResult Delete(Guid id)
        {
            if (id == CurrentUserId)
                return BadRequest(new { message = "No puedes eliminar tu propio usuario." });

            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<DBO.SP_UserResult>("dbo.SP_DeleteUser", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el usuario." });

            return Ok(result);
        }
    }
}
