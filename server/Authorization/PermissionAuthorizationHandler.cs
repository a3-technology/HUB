using Microsoft.AspNetCore.Authorization;

namespace server.Authorization
{
    /// <summary>
    /// Autoriza un <see cref="PermissionRequirement"/> comprobando que el claim
    /// "permissions" del JWT (códigos separados por coma) contenga el código exigido.
    /// </summary>
    public class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
    {
        protected override Task HandleRequirementAsync(
            AuthorizationHandlerContext context, PermissionRequirement requirement)
        {
            var permissions = (context.User.FindFirst("permissions")?.Value ?? "")
                .Split(',', StringSplitOptions.RemoveEmptyEntries);

            if (permissions.Contains(requirement.Code))
                context.Succeed(requirement);

            return Task.CompletedTask;
        }
    }
}
