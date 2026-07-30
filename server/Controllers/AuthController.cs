using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Services;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador de autenticación. Gestiona el ciclo de vida completo de la sesión:
    /// inicio de sesión, renovación de tokens, cierre de sesión, perfil y cambio de contraseña.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly ITokenService      _tokens;
        private readonly IConfiguration     _config;

        /// <summary>
        /// Inicializa el controlador con sus dependencias inyectadas.
        /// </summary>
        public AuthController(IGenericRepository repo, ITokenService tokens, IConfiguration config)
        {
            _repo   = repo;
            _tokens = tokens;
            _config = config;
        }

        /// <summary>
        /// Valida las credenciales del usuario y emite un par de tokens (access + refresh).
        /// </summary>
        /// <param name="request">Correo y contraseña del usuario.</param>
        /// <returns>
        /// 200 con <see cref="DBO.LoginResponse"/> si las credenciales son correctas.
        /// 401 si las credenciales son inválidas.
        /// </returns>
        [HttpPost("login")]
        [AllowAnonymous]
        public IActionResult Login([FromBody] DBO.LoginRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Email",    request.Email);
            p.Add("@Password", request.Password);

            // SP valida email + hash SHA2_512 de la contraseña y devuelve los datos del usuario.
            var user = _repo.Get<DBO.SP_GetCredentials>("dbo.SP_GetCredentials", p);

            if (user is null || user.Success == 0)
                return Unauthorized(new { message = user?.Message ?? "Credenciales inválidas" });

            var accessToken  = _tokens.GenerateAccessToken(user);
            var refreshToken = _tokens.GenerateRefreshToken();
            var expiry       = DateTime.UtcNow.AddDays(
                Convert.ToDouble(_config["JwtSettings:RefreshTokenExpirationDays"]));

            // Persistir el refresh token; el SP también limpia los tokens expirados o revocados del usuario.
            var sp = new DynamicParameters();
            sp.Add("@UserId",    user.UserId);
            sp.Add("@Token",     refreshToken);
            sp.Add("@ExpiresAt", expiry);
            _repo.Execute("dbo.SP_SaveRefreshToken", sp);

            return Ok(new DBO.LoginResponse { AccessToken = accessToken, RefreshToken = refreshToken });
        }

        /// <summary>
        /// Renueva el access token a partir de un refresh token válido.
        /// Implementa rotación: el token usado se revoca y se emite uno nuevo.
        /// </summary>
        /// <param name="request">Refresh token actual del cliente.</param>
        /// <returns>
        /// 200 con un nuevo par de tokens si el refresh token es válido y no ha expirado.
        /// 401 si el token es inválido, expirado o fue revocado.
        /// </returns>
        [HttpPost("refresh")]
        [AllowAnonymous]
        public IActionResult Refresh([FromBody] DBO.RefreshTokenRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Token", request.RefreshToken);

            var data = _repo.Get<DBO.SP_GetRefreshToken>("dbo.SP_GetRefreshToken", p);

            if (data is null || !data.IsValid)
                return Unauthorized(new { message = "Token de refresco inválido o expirado" });

            // Revocar el token usado antes de emitir el nuevo par (rotación de tokens).
            var rev = new DynamicParameters();
            rev.Add("@Token", request.RefreshToken);
            _repo.Execute("dbo.SP_RevokeRefreshToken", rev);

            // Reconstruir el objeto de usuario a partir de los datos del token almacenado en BD.
            var userForToken = new DBO.SP_GetCredentials
            {
                Success  = 1,
                UserId   = data.UserId,
                Names    = data.Names,
                Email    = data.Email,
                RoleId   = data.RoleId,
                RoleName = data.RoleName,
                Modules  = data.Modules,
                Permissions = data.Permissions,
                EmployeeId = data.EmployeeId
            };

            var newAccess  = _tokens.GenerateAccessToken(userForToken);
            var newRefresh = _tokens.GenerateRefreshToken();
            var expiry     = DateTime.UtcNow.AddDays(
                Convert.ToDouble(_config["JwtSettings:RefreshTokenExpirationDays"]));

            var sp = new DynamicParameters();
            sp.Add("@UserId",    data.UserId);
            sp.Add("@Token",     newRefresh);
            sp.Add("@ExpiresAt", expiry);
            _repo.Execute("dbo.SP_SaveRefreshToken", sp);

            return Ok(new DBO.LoginResponse { AccessToken = newAccess, RefreshToken = newRefresh });
        }

        /// <summary>
        /// Cierra la sesión revocando el refresh token activo del cliente.
        /// Requiere autenticación activa (Bearer token válido).
        /// </summary>
        /// <param name="request">Refresh token a revocar.</param>
        /// <returns>204 sin contenido al completar la revocación.</returns>
        [HttpPost("logout")]
        [Authorize]
        public IActionResult Logout([FromBody] DBO.RefreshTokenRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Token", request.RefreshToken);
            _repo.Execute("dbo.SP_RevokeRefreshToken", p);
            return NoContent();
        }

        /// <summary>
        /// Devuelve el perfil del usuario autenticado construido desde los claims del JWT.
        /// No realiza ninguna consulta a la base de datos.
        /// </summary>
        /// <returns>200 con <see cref="DBO.UserProfileResponse"/> del usuario en sesión.</returns>
        [HttpGet("me")]
        [Authorize]
        public IActionResult Me()
        {
            return Ok(new DBO.UserProfileResponse
            {
                UserId   = User.FindFirst("sub")?.Value       ?? "",
                Names    = User.FindFirst("name")?.Value      ?? "",
                Email    = User.FindFirst("email")?.Value     ?? "",
                RoleName = User.FindFirst("role_name")?.Value ?? "",
                Modules  = (User.FindFirst("modules")?.Value  ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .ToList(),
                Permissions = (User.FindFirst("permissions")?.Value ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .ToList(),
                EmployeeId = string.IsNullOrEmpty(User.FindFirst("employee_id")?.Value) ? null : User.FindFirst("employee_id")!.Value
            });
        }

        /// <summary>
        /// Actualiza el nombre y correo de acceso del usuario autenticado.
        /// El correo debe seguir siendo único; el rol y el empleado vinculado no se modifican por esta vía.
        /// </summary>
        /// <param name="request">Nuevo nombre y correo del usuario.</param>
        /// <returns>
        /// 200 con <see cref="DBO.SP_UpdateProfile"/> si se actualizó correctamente.
        /// 400 si el correo ya está en uso por otro usuario.
        /// 401 si no hay sesión activa.
        /// </returns>
        [HttpPatch("me")]
        [Authorize]
        public IActionResult UpdateProfile([FromBody] DBO.UpdateProfileRequest request)
        {
            var userId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var p = new DynamicParameters();
            p.Add("@UserId", Guid.Parse(userId));
            p.Add("@Names",  request.Names.Trim());
            p.Add("@Email",  request.Email.Trim().ToLower());

            var result = _repo.Get<DBO.SP_UpdateProfile>("dbo.SP_UpdateProfile", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el perfil." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia la contraseña del usuario autenticado previa verificación de la contraseña actual.
        /// </summary>
        /// <param name="request">Contraseña actual, nueva contraseña y su confirmación.</param>
        /// <returns>
        /// 200 con mensaje de éxito si la contraseña se actualizó.
        /// 400 si la contraseña actual no coincide.
        /// 401 si no hay sesión activa.
        /// </returns>
        [HttpPost("change-password")]
        [Authorize]
        public IActionResult ChangePassword([FromBody] DBO.ChangePasswordRequest request)
        {
            var userId = User.FindFirst("sub")?.Value;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var p = new DynamicParameters();
            p.Add("@UserId",          Guid.Parse(userId));
            p.Add("@CurrentPassword", request.CurrentPassword);
            p.Add("@NewPassword",     request.NewPassword);

            var result = _repo.Get<DBO.SP_ChangePassword>("dbo.SP_ChangePassword", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar la contraseña" });

            return Ok(new { message = result.Message });
        }
    }
}
