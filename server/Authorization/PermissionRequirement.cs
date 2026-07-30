using Microsoft.AspNetCore.Authorization;

namespace server.Authorization
{
    /// <summary>Exige que el claim "permissions" del usuario contenga el código indicado.</summary>
    public class PermissionRequirement(string code) : IAuthorizationRequirement
    {
        public string Code { get; } = code;
    }
}
