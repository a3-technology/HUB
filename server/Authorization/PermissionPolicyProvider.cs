using System.Collections.Concurrent;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

namespace server.Authorization
{
    /// <summary>
    /// Resuelve policies de permiso granular (ej. "hr.employees.create") en tiempo de
    /// ejecución, sin necesidad de pre-registrarlas una por una en Program.cs — el
    /// catálogo puede crecer con el código (ver <see cref="PermissionCatalogSync"/>)
    /// sin tocar la configuración de autorización.
    /// Las policies "reales" (los 6 módulos, registradas explícitamente) se resuelven
    /// igual que siempre delegando al <see cref="DefaultAuthorizationPolicyProvider"/>
    /// envuelto; cualquier otro nombre con forma de código de permiso (contiene un
    /// punto) se construye y cachea dinámicamente con un <see cref="PermissionRequirement"/>.
    /// </summary>
    public class PermissionPolicyProvider : IAuthorizationPolicyProvider
    {
        private readonly DefaultAuthorizationPolicyProvider _fallback;
        private readonly ConcurrentDictionary<string, AuthorizationPolicy> _dynamicPolicies = new();

        public PermissionPolicyProvider(IOptions<AuthorizationOptions> options)
        {
            _fallback = new DefaultAuthorizationPolicyProvider(options);
        }

        public async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
        {
            var existing = await _fallback.GetPolicyAsync(policyName);
            if (existing is not null) return existing;

            if (!policyName.Contains('.')) return null;

            return _dynamicPolicies.GetOrAdd(policyName, code =>
                new AuthorizationPolicyBuilder()
                    .AddRequirements(new PermissionRequirement(code))
                    .Build());
        }

        public Task<AuthorizationPolicy> GetDefaultPolicyAsync() => _fallback.GetDefaultPolicyAsync();

        public Task<AuthorizationPolicy?> GetFallbackPolicyAsync() => _fallback.GetFallbackPolicyAsync();
    }
}
