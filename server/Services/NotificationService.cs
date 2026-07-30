using Dapper;
using shared.Models;
using shared.Repositories;

namespace server.Services
{
    /// <summary>
    /// Crea notificaciones para usuarios. Diseñado para ser genérico y reutilizable
    /// por cualquier módulo (hoy solo Helpdesk lo usa): el "tipo" va namespaced por
    /// módulo (ej. "helpdesk.ticket-created") y la entidad de origen se referencia
    /// sin FK (<c>entityType</c>/<c>entityId</c>), así un módulo nuevo puede emitir
    /// sus propias notificaciones sin tocar el esquema de <c>dbo.Notifications</c>.
    /// </summary>
    public interface INotificationService
    {
        /// <summary>Notifica a un usuario específico.</summary>
        void NotifyUser(Guid userId, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null);

        /// <summary>Notifica a todos los usuarios activos con acceso a un módulo (ej. agentes de Helpdesk).</summary>
        void NotifyUsersWithModule(string moduleCode, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null, Guid? excludeUserId = null);

        /// <summary>Notifica a todos los usuarios activos que tengan un permiso específico (ej. supervisores con manage-all).</summary>
        void NotifyUsersWithPermission(string permissionCode, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null, Guid? excludeUserId = null);

        /// <summary>Resuelve el usuario vinculado a un empleado (null si no tiene uno o está inactivo).</summary>
        Guid? GetUserIdByEmployeeId(Guid employeeId);

        /// <summary>
        /// Elimina las notificaciones que referencian una entidad (ej. un ticket borrado).
        /// dbo.Notifications no tiene FK hacia las tablas de cada módulo (para no acoplarlas),
        /// así que esta limpieza debe invocarse explícitamente al borrar la entidad de origen.
        /// </summary>
        void DeleteNotificationsForEntity(string entityType, Guid entityId);
    }

    /// <inheritdoc/>
    public class NotificationService : INotificationService
    {
        private readonly IGenericRepository _repo;

        public NotificationService(IGenericRepository repo)
        {
            _repo = repo;
        }

        public void NotifyUser(Guid userId, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null)
        {
            var p = new DynamicParameters();
            p.Add("@UserId",     userId);
            p.Add("@Type",       type);
            p.Add("@Title",      title);
            p.Add("@Message",    message);
            p.Add("@EntityType", entityType);
            p.Add("@EntityId",   entityId);
            _repo.Execute("dbo.SP_InsertNotification", p);
        }

        public void NotifyUsersWithModule(string moduleCode, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null, Guid? excludeUserId = null)
        {
            var p = new DynamicParameters();
            p.Add("@ModuleCode", moduleCode);
            var userIds = _repo.GetAll<DBO.UserIdResult>("dbo.SP_GetUserIdsByModule", p);

            foreach (var u in userIds)
            {
                if (excludeUserId is not null && u.UserId == excludeUserId) continue;
                NotifyUser(u.UserId, type, title, message, entityType, entityId);
            }
        }

        public void NotifyUsersWithPermission(string permissionCode, string type, string title, string? message = null, string? entityType = null, Guid? entityId = null, Guid? excludeUserId = null)
        {
            var p = new DynamicParameters();
            p.Add("@PermissionCode", permissionCode);
            var userIds = _repo.GetAll<DBO.UserIdResult>("dbo.SP_GetUserIdsByPermission", p);

            foreach (var u in userIds)
            {
                if (excludeUserId is not null && u.UserId == excludeUserId) continue;
                NotifyUser(u.UserId, type, title, message, entityType, entityId);
            }
        }

        public Guid? GetUserIdByEmployeeId(Guid employeeId)
        {
            var p = new DynamicParameters();
            p.Add("@EmployeeId", employeeId);
            return _repo.Get<DBO.UserIdResult>("dbo.SP_GetUserIdByEmployeeId", p)?.UserId;
        }

        public void DeleteNotificationsForEntity(string entityType, Guid entityId)
        {
            var p = new DynamicParameters();
            p.Add("@EntityType", entityType);
            p.Add("@EntityId",   entityId);
            _repo.Execute("dbo.SP_DeleteNotificationsByEntity", p);
        }
    }
}
