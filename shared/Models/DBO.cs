
using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    public partial class DBO
    {
        /// <summary>Resultado de SP_GetEmployeeIdByUserId: empleado vinculado a un usuario, si existe.</summary>
        public class EmployeeLookupResult
        {
            public Guid? EmployeeId { get; set; }
        }

        /// <summary>
        /// Empleado retornado por dbo.SP_GetEmployeeDirectory — directorio básico
        /// (nombre, foto, correo), transversal a todos los módulos, para combos de
        /// "elegí un empleado" (solicitante, responsable, owner…) que no requieren
        /// el módulo hr. No incluye datos sensibles (salario, banco, identificación).
        /// </summary>
        public class EmployeeDirectoryResponse
        {
            public Guid    Id        { get; set; }
            public string  FirstName { get; set; } = string.Empty;
            public string  LastName  { get; set; } = string.Empty;
            public string  Email     { get; set; } = string.Empty;
            public string? PhotoUrl  { get; set; }
        }

        /// <summary>Resultado de SP_GetUserIdByEmployeeId / SP_GetUserIdsByModule.</summary>
        public class UserIdResult
        {
            public Guid UserId { get; set; }
        }

        // ── Notificaciones ───────────────────────────────────────────────────

        /// <summary>
        /// Notificación retornada por dbo.SP_GetNotifications. Genérica para cualquier
        /// módulo: <see cref="Type"/> va namespaced (ej. "helpdesk.ticket-created") y
        /// <see cref="EntityType"/>/<see cref="EntityId"/> son una referencia sin FK a la
        /// entidad de origen (cada módulo tiene su propia tabla), para poder escalar a
        /// notificaciones de otros módulos sin cambios de esquema.
        /// </summary>
        public class NotificationResponse
        {
            public Guid      Id         { get; set; }
            public string    Type       { get; set; } = string.Empty;
            public string    Title      { get; set; } = string.Empty;
            public string?   Message    { get; set; }
            public string?   EntityType { get; set; }
            public Guid?     EntityId   { get; set; }
            public bool      IsRead     { get; set; }
            public DateTime  CreatedAt  { get; set; }
        }

        /// <summary>Conteo de notificaciones no leídas de dbo.SP_GetUnreadNotificationCount.</summary>
        public class UnreadNotificationCountResponse
        {
            public int UnreadCount { get; set; }
        }

        // ── Autenticación ────────────────────────────────────────────────────

        /// <summary>Resultado de SP_GetCredentials: datos del usuario autenticado.</summary>
        public partial class SP_GetCredentials
        {
            public int     Success  { get; set; }
            public string? Message  { get; set; }
            public Guid    UserId   { get; set; }
            public string? Names    { get; set; }
            public string? Email    { get; set; }
            public Guid    RoleId   { get; set; }
            public string? RoleName { get; set; }

            /// <summary>Códigos de los módulos permitidos por el rol, separados por coma (ej. "crm,hr").</summary>
            public string? Modules  { get; set; }

            /// <summary>Códigos de los permisos granulares del rol, separados por coma (ej. "hr.employees.create").</summary>
            public string? Permissions { get; set; }

            /// <summary>Empleado vinculado al usuario, si tiene uno.</summary>
            public Guid? EmployeeId { get; set; }
        }

        /// <summary>Cuerpo de la solicitud de inicio de sesión.</summary>
        public class LoginRequest
        {
            [Required(ErrorMessage = "El correo es requerido.")]
            [EmailAddress(ErrorMessage = "El formato del correo no es válido.")]
            public string Email { get; set; } = string.Empty;

            [Required(ErrorMessage = "La contraseña es requerida.")]
            public string Password { get; set; } = string.Empty;
        }

        /// <summary>
        /// Respuesta del login. Solo retorna los tokens — el cliente
        /// decodifica el JWT para leer los claims del usuario (nombre, rol, permisos).
        /// </summary>
        public class LoginResponse
        {
            public string AccessToken { get; set; } = string.Empty;
            public string RefreshToken { get; set; } = string.Empty;
        }

        /// <summary>
        /// Perfil del usuario autenticado construido a partir de los claims del JWT.
        /// Se retorna desde GET /api/auth/me sin necesidad de consultar la base de datos.
        /// </summary>
        public class UserProfileResponse
        {
            public string UserId { get; set; } = string.Empty;
            public string Names { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string RoleName { get; set; } = string.Empty;

            /// <summary>Códigos de los módulos a los que el usuario tiene acceso.</summary>
            public List<string> Modules { get; set; } = [];

            /// <summary>Códigos de los permisos granulares del usuario (ej. "hr.employees.create").</summary>
            public List<string> Permissions { get; set; } = [];

            /// <summary>Empleado vinculado al usuario, si tiene uno (para comparaciones de "es mío" en el cliente).</summary>
            public string? EmployeeId { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para renovar el access token.</summary>
        public class RefreshTokenRequest
        {
            [Required(ErrorMessage = "El token de refresco es requerido.")]
            public string RefreshToken { get; set; } = string.Empty;
        }

        /// <summary>Cuerpo de la solicitud para actualizar el nombre y correo del usuario autenticado.</summary>
        public class UpdateProfileRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(150, ErrorMessage = "El nombre no puede superar 150 caracteres.")]
            public string Names { get; set; } = string.Empty;

            [Required(ErrorMessage = "El correo es requerido.")]
            [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
            [MaxLength(150, ErrorMessage = "El correo no puede superar 150 caracteres.")]
            public string Email { get; set; } = string.Empty;
        }

        /// <summary>Resultado de SP_UpdateProfile.</summary>
        public class SP_UpdateProfile
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
        }

        /// <summary>Resultado de SP_UpdateUserPhoto.</summary>
        public class SP_UpdateUserPhoto
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para cambiar la contraseña del usuario autenticado.</summary>
        public class ChangePasswordRequest
        {
            [Required(ErrorMessage = "La contraseña actual es requerida.")]
            public string CurrentPassword { get; set; } = string.Empty;

            [Required(ErrorMessage = "La nueva contraseña es requerida.")]
            [MinLength(6, ErrorMessage = "La nueva contraseña debe tener al menos 6 caracteres.")]
            public string NewPassword { get; set; } = string.Empty;

            [Required(ErrorMessage = "La confirmación de contraseña es requerida.")]
            [Compare("NewPassword", ErrorMessage = "Las contraseñas no coinciden.")]
            public string ConfirmPassword { get; set; } = string.Empty;
        }

        /// <summary>Resultado de SP_ChangePassword.</summary>
        public class SP_ChangePassword
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
        }

        /// <summary>Resultado de SP_GetRefreshToken: datos del usuario + validez del token.</summary>
        public class SP_GetRefreshToken
        {
            public Guid   UserId   { get; set; }
            public string Names    { get; set; } = string.Empty;
            public string Email    { get; set; } = string.Empty;
            public Guid   RoleId   { get; set; }
            public string RoleName { get; set; } = string.Empty;

            /// <summary>Códigos de los módulos permitidos por el rol, separados por coma.</summary>
            public string Modules  { get; set; } = string.Empty;

            /// <summary>Códigos de los permisos granulares del rol, separados por coma.</summary>
            public string Permissions { get; set; } = string.Empty;

            /// <summary>Empleado vinculado al usuario, si tiene uno.</summary>
            public Guid? EmployeeId { get; set; }
            public bool   IsValid  { get; set; }
        }

        // ── Monedas (catálogo general) ────────────────────────────────────────

        /// <summary>
        /// Moneda retornada por los SPs de consulta.
        /// Mapea el resultado de dbo.SP_GetCurrencies y dbo.SP_GetCurrencyById.
        /// </summary>
        public class CurrencyResponse
        {
            public Guid      Id            { get; set; }
            public string    Code          { get; set; } = string.Empty;
            public string    Name          { get; set; } = string.Empty;
            public string    Symbol        { get; set; } = string.Empty;
            public bool      IsActive      { get; set; }
            public int       EmployeeCount { get; set; }
            public DateTime  CreatedAt     { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una moneda.</summary>
        public class CurrencyRequest
        {
            [Required(ErrorMessage = "El código de la moneda es requerido.")]
            [StringLength(3, MinimumLength = 3, ErrorMessage = "El código debe tener exactamente 3 letras (ISO 4217).")]
            public string Code { get; set; } = string.Empty;

            [Required(ErrorMessage = "El nombre de la moneda es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "El símbolo de la moneda es requerido.")]
            [MaxLength(5, ErrorMessage = "El símbolo no puede superar 5 caracteres.")]
            public string Symbol { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de monedas.
        /// Usado por dbo.SP_InsertCurrency, dbo.SP_UpdateCurrency,
        /// dbo.SP_ToggleCurrencyStatus y dbo.SP_DeleteCurrency.
        /// </summary>
        public class SP_CurrencyResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

    }
}
