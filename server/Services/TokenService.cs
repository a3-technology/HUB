using Microsoft.IdentityModel.Tokens;
using shared.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace server.Services
{
    /// <summary>
    /// Contrato para la generación de tokens de autenticación.
    /// </summary>
    public interface ITokenService
    {
        /// <summary>
        /// Genera un JWT de corta duración con los datos del usuario como claims.
        /// </summary>
        /// <param name="user">Datos del usuario devueltos por SP_GetCredentials.</param>
        /// <returns>Token JWT firmado con HMAC-SHA256 en formato Base64Url.</returns>
        string GenerateAccessToken(DBO.SP_GetCredentials user);

        /// <summary>
        /// Genera un refresh token criptográficamente seguro.
        /// </summary>
        /// <returns>64 bytes aleatorios codificados en Base64 (512 bits de entropía).</returns>
        string GenerateRefreshToken();
    }

    /// <summary>
    /// Implementación de <see cref="ITokenService"/>.
    /// Lee la configuración de firma y expiración desde la sección JwtSettings de appsettings.
    /// </summary>
    public class TokenService : ITokenService
    {
        private readonly IConfiguration _config;

        /// <summary>
        /// Inicializa el servicio con la configuración de la aplicación.
        /// </summary>
        public TokenService(IConfiguration config) => _config = config;

        /// <inheritdoc/>
        public string GenerateAccessToken(DBO.SP_GetCredentials user)
        {
            var key    = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["JwtSettings:Key"]!));
            var expiry = DateTime.UtcNow.AddMinutes(Convert.ToDouble(_config["JwtSettings:ExpirationMinutes"]));

            // MapInboundClaims=false en Program.cs impide que el middleware renombre
            // "sub" → NameIdentifier, "email" → EmailAddress, etc. al leer el token.
            var claims = new[]
            {
                new Claim("sub",       user.UserId.ToString()),
                new Claim("name",      user.Names    ?? ""),
                new Claim("email",     user.Email    ?? ""),
                new Claim("role_id",   user.RoleId.ToString()),
                new Claim("role_name", user.RoleName ?? ""),
                // Códigos de módulos permitidos separados por coma; los evalúan
                // las políticas de autorización por módulo registradas en Program.cs.
                new Claim("modules",   user.Modules  ?? ""),
                // Códigos de permisos granulares separados por coma; los evalúa
                // PermissionAuthorizationHandler contra las policies dinámicas.
                new Claim("permissions", user.Permissions ?? ""),
                // Empleado vinculado (si tiene uno), para que el cliente pueda
                // comparar "es mío" sin depender de una consulta al servidor.
                new Claim("employee_id", user.EmployeeId?.ToString() ?? "")
            };

            var token = new JwtSecurityToken(
                issuer:             _config["JwtSettings:Issuer"],
                audience:           _config["JwtSettings:Audience"],
                claims:             claims,
                expires:            expiry,
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        /// <inheritdoc/>
        public string GenerateRefreshToken()
        {
            // 64 bytes = 512 bits de entropía, suficiente para garantizar unicidad y seguridad.
            var bytes = new byte[64];
            RandomNumberGenerator.Fill(bytes);
            return Convert.ToBase64String(bytes);
        }
    }
}
