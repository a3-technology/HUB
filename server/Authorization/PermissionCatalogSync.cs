using System.Reflection;
using System.Text.Json;
using Dapper;
using Microsoft.AspNetCore.Mvc;
using shared.Repositories;

namespace server.Authorization
{
    /// <summary>
    /// Descubre por reflexión todos los <see cref="RequirePermissionAttribute"/> aplicados
    /// a acciones de los controllers y sincroniza el catálogo dbo.Permissions con lo
    /// encontrado (dbo.SP_SyncPermissions). Se ejecuta una vez al iniciar el servidor —
    /// el catálogo en base de datos queda siempre reflejando el código, sin mantenimiento
    /// manual de filas.
    /// </summary>
    public static class PermissionCatalogSync
    {
        public static void Run(IGenericRepository repo)
        {
            var permissions = typeof(PermissionCatalogSync).Assembly
                .GetTypes()
                .Where(t => typeof(ControllerBase).IsAssignableFrom(t))
                .SelectMany(t => t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                .SelectMany(m => m.GetCustomAttributes<RequirePermissionAttribute>())
                .Select(a => new { Code = a.Policy!, ModuleCode = a.Policy!.Split('.')[0], Name = a.Description })
                .DistinctBy(p => p.Code)
                .ToList();

            var json = JsonSerializer.Serialize(permissions);

            var p = new DynamicParameters();
            p.Add("@PermissionsJson", json);
            repo.Execute("dbo.SP_SyncPermissions", p);
        }
    }
}
