using Microsoft.AspNetCore.Authorization;

namespace server.Authorization
{
    /// <summary>
    /// Exige un permiso granular específico (ej. "hr.employees.create") además del
    /// acceso al módulo ya exigido a nivel de clase por <see cref="AuthorizeAttribute"/>.
    /// El código se usa como nombre de policy: <see cref="PermissionPolicyProvider"/> la
    /// resuelve dinámicamente en tiempo de ejecución sin necesidad de pre-registrarla.
    /// La descripción se usa únicamente para poblar el catálogo dbo.Permissions
    /// (ver <see cref="PermissionCatalogSync"/>), no afecta la autorización.
    /// </summary>
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
    public class RequirePermissionAttribute : AuthorizeAttribute
    {
        /// <summary>Descripción legible en español del permiso, para el catálogo.</summary>
        public string Description { get; }

        public RequirePermissionAttribute(string code, string description) : base(policy: code)
        {
            Description = description;
        }
    }
}
