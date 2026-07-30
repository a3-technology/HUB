using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Gestión de Proyectos.
    /// </summary>
    public partial class Projects
    {
        // ── Proyectos ─────────────────────────────────────────────────────────

        /// <summary>
        /// Proyecto retornado por los SPs de consulta.
        /// Mapea el resultado de projects.SP_GetProjects y projects.SP_GetProjectById.
        /// </summary>
        public class ProjectResponse
        {
            public Guid      Id          { get; set; }
            public string    Code        { get; set; } = string.Empty;
            public string    Name        { get; set; } = string.Empty;
            public string?   Description { get; set; }
            public Guid?     ManagerId   { get; set; }
            public string?   ManagerName { get; set; }
            public DateTime  StartDate   { get; set; }
            public DateTime? EndDate     { get; set; }
            public string    Status      { get; set; } = string.Empty;
            public decimal?  Budget      { get; set; }
            public bool      IsActive    { get; set; }
            public int       TaskCount   { get; set; }
            public DateTime  CreatedAt   { get; set; }
            public DateTime? UpdatedAt   { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un proyecto.</summary>
        public class ProjectRequest
        {
            [Required(ErrorMessage = "El código del proyecto es requerido.")]
            [MaxLength(20, ErrorMessage = "El código no puede superar 20 caracteres.")]
            public string Code { get; set; } = string.Empty;

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(1000, ErrorMessage = "La descripción no puede superar 1000 caracteres.")]
            public string? Description { get; set; }

            /// <summary>Empleado líder del proyecto (opcional).</summary>
            public Guid? ManagerId { get; set; }

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            public DateTime? EndDate { get; set; }

            /// <summary>Estado del proyecto: Planned | InProgress | OnHold | Completed | Cancelled.</summary>
            [RegularExpression("^(Planned|InProgress|OnHold|Completed|Cancelled)$", ErrorMessage = "Estado de proyecto inválido.")]
            public string Status { get; set; } = "Planned";

            [Range(0, double.MaxValue, ErrorMessage = "El presupuesto no puede ser negativo.")]
            public decimal? Budget { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de proyectos.
        /// Usado por projects.SP_InsertProject, projects.SP_UpdateProject,
        /// projects.SP_ToggleProjectStatus y projects.SP_DeleteProject.
        /// </summary>
        public class SP_ProjectResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Tareas ────────────────────────────────────────────────────────────

        /// <summary>
        /// Tarea retornada por los SPs de consulta.
        /// Mapea el resultado de projects.SP_GetTasks y projects.SP_GetTaskById.
        /// </summary>
        public class TaskResponse
        {
            public Guid      Id               { get; set; }
            public Guid      ProjectId        { get; set; }
            public string    ProjectName      { get; set; } = string.Empty;
            public string    ProjectCode      { get; set; } = string.Empty;
            public string    Name             { get; set; } = string.Empty;
            public string?   Description      { get; set; }
            public Guid?     AssignedToId     { get; set; }
            public string?   AssignedToName   { get; set; }
            public string?   AssignedToPhotoUrl { get; set; }
            public DateTime? StartDate        { get; set; }
            public DateTime? DueDate          { get; set; }
            public string    Status           { get; set; } = string.Empty;
            public string    Priority         { get; set; } = string.Empty;
            public int       ProgressPercent  { get; set; }
            public bool      IsActive         { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una tarea.</summary>
        public class TaskRequest
        {
            [Required(ErrorMessage = "El proyecto es requerido.")]
            public Guid ProjectId { get; set; }

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(1000, ErrorMessage = "La descripción no puede superar 1000 caracteres.")]
            public string? Description { get; set; }

            /// <summary>Empleado responsable de la tarea (opcional).</summary>
            public Guid? AssignedToId { get; set; }

            public DateTime? StartDate { get; set; }
            public DateTime? DueDate   { get; set; }

            /// <summary>Estado de la tarea: Pending | InProgress | Blocked | Completed.</summary>
            [RegularExpression("^(Pending|InProgress|Blocked|Completed)$", ErrorMessage = "Estado de tarea inválido.")]
            public string Status { get; set; } = "Pending";

            /// <summary>Prioridad de la tarea: Low | Medium | High.</summary>
            [RegularExpression("^(Low|Medium|High)$", ErrorMessage = "Prioridad de tarea inválida.")]
            public string Priority { get; set; } = "Medium";

            [Range(0, 100, ErrorMessage = "El progreso debe estar entre 0 y 100.")]
            public int ProgressPercent { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de tareas.
        /// Usado por projects.SP_InsertTask, projects.SP_UpdateTask,
        /// projects.SP_ToggleTaskStatus y projects.SP_DeleteTask.
        /// </summary>
        public class SP_TaskResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        /// <summary>
        /// Tarea con fechas para pintar el Gantt del Cronograma.
        /// Mapea el resultado de projects.SP_GetProjectSchedule.
        /// </summary>
        public class ScheduleItemResponse
        {
            public Guid     Id              { get; set; }
            public Guid     ProjectId       { get; set; }
            public string   ProjectName     { get; set; } = string.Empty;
            public string   ProjectCode     { get; set; } = string.Empty;
            public string   Name            { get; set; } = string.Empty;
            public DateTime StartDate       { get; set; }
            public DateTime DueDate         { get; set; }
            public string   Status          { get; set; } = string.Empty;
            public string   Priority        { get; set; } = string.Empty;
            public int      ProgressPercent { get; set; }
        }

        // ── Recursos ──────────────────────────────────────────────────────────

        /// <summary>
        /// Asignación de recurso retornada por los SPs de consulta.
        /// Mapea el resultado de projects.SP_GetResources y projects.SP_GetResourceById.
        /// </summary>
        public class ResourceResponse
        {
            public Guid      Id                { get; set; }
            public Guid      ProjectId         { get; set; }
            public string    ProjectName       { get; set; } = string.Empty;
            public string    ProjectCode       { get; set; } = string.Empty;
            public Guid      EmployeeId        { get; set; }
            public string    EmployeeName      { get; set; } = string.Empty;
            public string    EmployeeCode      { get; set; } = string.Empty;
            public bool      IsActive          { get; set; }
            public DateTime  CreatedAt         { get; set; }
            public DateTime? UpdatedAt         { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear una asignación de recurso (membresía de proyecto).</summary>
        public class ResourceRequest
        {
            [Required(ErrorMessage = "El proyecto es requerido.")]
            public Guid ProjectId { get; set; }

            [Required(ErrorMessage = "El empleado es requerido.")]
            public Guid EmployeeId { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de recursos.
        /// Usado por projects.SP_InsertResource, projects.SP_UpdateResource,
        /// projects.SP_ToggleResourceStatus y projects.SP_DeleteResource.
        /// </summary>
        public class SP_ResourceResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Dependencias entre tareas ────────────────────────────────────────────

        /// <summary>
        /// Dependencia (finish-to-start) retornada por los SPs de consulta.
        /// Mapea el resultado de pm.SP_GetTaskDependencies.
        /// </summary>
        public class DependencyResponse
        {
            public Guid      Id                 { get; set; }
            public Guid      TaskId             { get; set; }
            public Guid      DependsOnTaskId    { get; set; }
            public string    DependsOnTaskName  { get; set; } = string.Empty;
            public DateTime? DependsOnStartDate { get; set; }
            public DateTime? DependsOnDueDate   { get; set; }
            public string?   DependsOnStatus    { get; set; }
        }

        /// <summary>
        /// Relación de dependencia dentro de un proyecto, sin datos de la tarea.
        /// Mapea el resultado de pm.SP_GetProjectDependencies (usada por el Gantt).
        /// </summary>
        public class ProjectDependencyResponse
        {
            public Guid Id              { get; set; }
            public Guid TaskId          { get; set; }
            public Guid DependsOnTaskId { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear una dependencia entre dos tareas.</summary>
        public class DependencyRequest
        {
            [Required(ErrorMessage = "La tarea es requerida.")]
            public Guid TaskId { get; set; }

            [Required(ErrorMessage = "La tarea predecesora es requerida.")]
            public Guid DependsOnTaskId { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de dependencias.
        /// Usado por pm.SP_InsertTaskDependency y pm.SP_DeleteTaskDependency.
        /// </summary>
        public class SP_DependencyResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Comentarios de tarea ─────────────────────────────────────────────────

        /// <summary>
        /// Comentario retornado por los SPs de consulta.
        /// Mapea el resultado de pm.SP_GetTaskComments.
        /// </summary>
        public class CommentResponse
        {
            public Guid     Id         { get; set; }
            public Guid     TaskId     { get; set; }
            public Guid     UserId     { get; set; }
            public string   AuthorName { get; set; } = string.Empty;
            public string   Text       { get; set; } = string.Empty;
            public DateTime CreatedAt  { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un comentario en una tarea.</summary>
        public class CommentRequest
        {
            [Required(ErrorMessage = "El comentario no puede estar vacío.")]
            [MaxLength(2000, ErrorMessage = "El comentario no puede superar 2000 caracteres.")]
            public string Text { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de comentarios.
        /// Usado por pm.SP_InsertTaskComment y pm.SP_DeleteTaskComment.
        /// </summary>
        public class SP_CommentResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Adjuntos de tarea ─────────────────────────────────────────────────────

        /// <summary>
        /// Adjunto retornado por los SPs de consulta.
        /// Mapea el resultado de pm.SP_GetTaskAttachments.
        /// </summary>
        public class AttachmentResponse
        {
            public Guid     Id               { get; set; }
            public Guid     TaskId           { get; set; }
            public string   FileName         { get; set; } = string.Empty;
            /// <summary>Ruta del archivo en Blob Storage (pm/tasks/{id}/attachments/{archivo}).</summary>
            public string   BlobPath         { get; set; } = string.Empty;
            public long?    FileSize         { get; set; }
            public Guid     UploadedByUserId { get; set; }
            public string   UploadedByName   { get; set; } = string.Empty;
            public DateTime CreatedAt        { get; set; }
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura de adjuntos.
        /// Usado por pm.SP_InsertTaskAttachment y pm.SP_DeleteTaskAttachment.
        /// </summary>
        public class SP_AttachmentResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Checklist de tarea ───────────────────────────────────────────────────

        /// <summary>
        /// Ítem de checklist retornado por los SPs de consulta.
        /// Mapea el resultado de pm.SP_GetTaskChecklist.
        /// </summary>
        public class ChecklistItemResponse
        {
            public Guid     Id        { get; set; }
            public Guid     TaskId    { get; set; }
            public string   Text      { get; set; } = string.Empty;
            public bool     IsChecked { get; set; }
            public DateTime CreatedAt { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un ítem de checklist.</summary>
        public class ChecklistItemRequest
        {
            [Required(ErrorMessage = "El texto del ítem es requerido.")]
            [MaxLength(500, ErrorMessage = "El texto no puede superar 500 caracteres.")]
            public string Text { get; set; } = string.Empty;
        }

        /// <summary>
        /// Resultado estándar de los SPs de escritura del checklist.
        /// Usado por pm.SP_InsertTaskChecklistItem, pm.SP_ToggleTaskChecklistItem y pm.SP_DeleteTaskChecklistItem.
        /// </summary>
        public class SP_ChecklistResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
