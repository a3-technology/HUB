using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Seguridad (roles, módulos y usuarios).
    /// </summary>
    public partial class DBO
    {
        // ── Módulos ───────────────────────────────────────────────────────────

        /// <summary>Módulo del sistema retornado por dbo.SP_GetModules.</summary>
        public class ModuleResponse
        {
            public Guid   Id   { get; set; }
            public string Code { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
        }

        // ── Permisos ──────────────────────────────────────────────────────────

        /// <summary>
        /// Permiso granular retornado por dbo.SP_GetPermissions.
        /// El catálogo se descubre automáticamente desde los atributos
        /// <c>[RequirePermission]</c> de los controllers al iniciar el servidor.
        /// </summary>
        public class PermissionResponse
        {
            public Guid   Id         { get; set; }
            public string Code       { get; set; } = string.Empty;
            public string ModuleCode { get; set; } = string.Empty;
            public string Name       { get; set; } = string.Empty;
        }

        // ── Roles ─────────────────────────────────────────────────────────────

        /// <summary>
        /// Rol retornado por los SPs de consulta.
        /// Mapea el resultado de dbo.SP_GetRoles y dbo.SP_GetRoleById.
        /// </summary>
        public class RoleResponse
        {
            public Guid      Id          { get; set; }
            public string    Name        { get; set; } = string.Empty;
            public string?   Description { get; set; }
            public bool      IsActive    { get; set; }
            public int       UserCount   { get; set; }

            /// <summary>Nombres de los módulos permitidos, separados por coma (para mostrar).</summary>
            public string    ModuleNames { get; set; } = string.Empty;

            /// <summary>GUIDs de los módulos permitidos, separados por coma (para editar).</summary>
            public string    ModuleIds   { get; set; } = string.Empty;

            /// <summary>GUIDs de los permisos granulares del rol, separados por coma (para editar).</summary>
            public string    PermissionIds { get; set; } = string.Empty;
            public DateTime  CreatedAt   { get; set; }
            public DateTime? UpdatedAt   { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un rol.</summary>
        public class RoleRequest
        {
            [Required(ErrorMessage = "El nombre del rol es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }

            /// <summary>GUIDs de los módulos permitidos para el rol.</summary>
            public List<Guid> ModuleIds { get; set; } = [];

            /// <summary>GUIDs de los permisos granulares del rol.</summary>
            public List<Guid> PermissionIds { get; set; } = [];
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de roles.
        /// Usado por dbo.SP_InsertRole, dbo.SP_UpdateRole y dbo.SP_ToggleRoleStatus.
        /// </summary>
        public class SP_RoleResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Usuarios ──────────────────────────────────────────────────────────

        /// <summary>
        /// Usuario retornado por dbo.SP_GetUsers.
        /// </summary>
        public class UserResponse
        {
            public Guid     Id           { get; set; }
            public string   Names        { get; set; } = string.Empty;
            public string   Email        { get; set; } = string.Empty;
            public Guid     RoleId       { get; set; }
            public string   RoleName     { get; set; } = string.Empty;
            public Guid?    EmployeeId   { get; set; }
            public string?  EmployeeName { get; set; }
            public bool     IsActive     { get; set; }
            public DateTime CreatedAt    { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un usuario (incluye contraseña inicial).</summary>
        public class UserCreateRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(150, ErrorMessage = "El nombre no puede superar 150 caracteres.")]
            public string Names { get; set; } = string.Empty;

            [Required(ErrorMessage = "El correo es requerido.")]
            [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
            [MaxLength(150, ErrorMessage = "El correo no puede superar 150 caracteres.")]
            public string Email { get; set; } = string.Empty;

            [Required(ErrorMessage = "La contraseña es requerida.")]
            [MinLength(6, ErrorMessage = "La contraseña debe tener al menos 6 caracteres.")]
            public string Password { get; set; } = string.Empty;

            [Required(ErrorMessage = "El rol es requerido.")]
            public Guid RoleId { get; set; }

            /// <summary>Empleado vinculado (opcional): un usuario puede no ser empleado.</summary>
            public Guid? EmployeeId { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para actualizar un usuario (sin contraseña).</summary>
        public class UserUpdateRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(150, ErrorMessage = "El nombre no puede superar 150 caracteres.")]
            public string Names { get; set; } = string.Empty;

            [Required(ErrorMessage = "El correo es requerido.")]
            [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
            [MaxLength(150, ErrorMessage = "El correo no puede superar 150 caracteres.")]
            public string Email { get; set; } = string.Empty;

            [Required(ErrorMessage = "El rol es requerido.")]
            public Guid RoleId { get; set; }

            /// <summary>Empleado vinculado (opcional): un usuario puede no ser empleado.</summary>
            public Guid? EmployeeId { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para restablecer la contraseña de un usuario.</summary>
        public class UserResetPasswordRequest
        {
            [Required(ErrorMessage = "La nueva contraseña es requerida.")]
            [MinLength(6, ErrorMessage = "La contraseña debe tener al menos 6 caracteres.")]
            public string NewPassword { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de usuarios.
        /// Usado por dbo.SP_InsertUser, dbo.SP_UpdateUser, dbo.SP_ToggleUserStatus,
        /// dbo.SP_ResetUserPassword y dbo.SP_DeleteUser.
        /// </summary>
        public class SP_UserResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
