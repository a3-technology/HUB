using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Helpdesk (schema hd). Solicitante y responsable de un
    /// ticket son empleados (ver <see cref="HR"/>).
    /// </summary>
    public partial class Helpdesk
    {
        // ── Categorías ────────────────────────────────────────────────────────

        /// <summary>Categoría retornada por hd.SP_GetTicketCategories y hd.SP_GetTicketCategoryById.</summary>
        public class CategoryResponse
        {
            public Guid      Id          { get; set; }
            public string    Name        { get; set; } = string.Empty;
            public string?   Description { get; set; }
            public bool      IsActive    { get; set; }
            public DateTime  CreatedAt   { get; set; }
            public DateTime? UpdatedAt   { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una categoría.</summary>
        public class CategoryRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de categorías.</summary>
        public class SP_CategoryResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Prioridades ───────────────────────────────────────────────────────

        /// <summary>Prioridad retornada por hd.SP_GetPriorities y hd.SP_GetPriorityById.</summary>
        public class PriorityResponse
        {
            public Guid      Id        { get; set; }
            public string    Name      { get; set; } = string.Empty;
            public int       Level     { get; set; }
            public string    ColorHex  { get; set; } = string.Empty;
            /// <summary>Minutos objetivo para la primera respuesta del agente asignado (null = sin objetivo de SLA).</summary>
            public int?      ResponseTargetMinutes   { get; set; }
            /// <summary>Minutos objetivo para resolver el ticket (null = sin objetivo de SLA).</summary>
            public int?      ResolutionTargetMinutes { get; set; }
            public bool      IsActive  { get; set; }
            public DateTime  CreatedAt { get; set; }
            public DateTime? UpdatedAt { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una prioridad.</summary>
        public class PriorityRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(50, ErrorMessage = "El nombre no puede superar 50 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "El nivel es requerido.")]
            public int Level { get; set; }

            [RegularExpression("^#[0-9A-Fa-f]{6}$", ErrorMessage = "El color debe ser un valor hexadecimal (#RRGGBB).")]
            public string ColorHex { get; set; } = "#64748B";

            [Range(1, int.MaxValue, ErrorMessage = "El objetivo de primera respuesta debe ser mayor a cero.")]
            public int? ResponseTargetMinutes { get; set; }

            [Range(1, int.MaxValue, ErrorMessage = "El objetivo de resolución debe ser mayor a cero.")]
            public int? ResolutionTargetMinutes { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de prioridades.</summary>
        public class SP_PriorityResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Estados de ticket ────────────────────────────────────────────────

        /// <summary>Estado retornado por hd.SP_GetTicketStatuses y hd.SP_GetTicketStatusById.</summary>
        public class TicketStatusResponse
        {
            public Guid      Id                 { get; set; }
            public string    Name               { get; set; } = string.Empty;
            public string    ColorHex           { get; set; } = string.Empty;
            public int       SortOrder          { get; set; }
            public bool      IsInitial          { get; set; }
            public bool      IsFinal            { get; set; }
            public bool      RequiresResolution { get; set; }
            public bool      IsActive           { get; set; }
            public DateTime  CreatedAt          { get; set; }
            public DateTime? UpdatedAt          { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un estado de ticket.</summary>
        public class TicketStatusRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(50, ErrorMessage = "El nombre no puede superar 50 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [RegularExpression("^#[0-9A-Fa-f]{6}$", ErrorMessage = "El color debe ser un valor hexadecimal (#RRGGBB).")]
            public string ColorHex { get; set; } = "#64748B";

            public int SortOrder { get; set; }

            public bool IsInitial { get; set; }
            public bool IsFinal { get; set; }
            public bool RequiresResolution { get; set; }

            /// <summary>Ids de los estados a los que se permite transicionar desde este.</summary>
            public List<Guid> AllowedTransitionIds { get; set; } = new();
        }

        /// <summary>Resultado estándar de los SPs de escritura de estados de ticket.</summary>
        public class SP_TicketStatusResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        /// <summary>Transición permitida, retornada por hd.SP_GetTicketStatusTransitions.</summary>
        public class TicketStatusTransitionResponse
        {
            public Guid FromStatusId { get; set; }
            public Guid ToStatusId   { get; set; }
        }

        // ── Tickets ───────────────────────────────────────────────────────────

        /// <summary>Ticket retornado por hd.SP_GetTickets y hd.SP_GetTicketById.</summary>
        public class TicketResponse
        {
            public Guid      Id                   { get; set; }
            public string    Code                 { get; set; } = string.Empty;
            public string    Subject              { get; set; } = string.Empty;
            public string?   Description          { get; set; }
            public Guid      RequesterId          { get; set; }
            public string    RequesterName        { get; set; } = string.Empty;
            public string?   RequesterPhotoUrl    { get; set; }
            public Guid?     AssignedToId         { get; set; }
            public string?   AssignedToName       { get; set; }
            public string?   AssignedToPhotoUrl   { get; set; }
            public Guid      CategoryId           { get; set; }
            public string    CategoryName         { get; set; } = string.Empty;
            public Guid      PriorityId           { get; set; }
            public string    PriorityName         { get; set; } = string.Empty;
            public int       PriorityLevel        { get; set; }
            public string    PriorityColor        { get; set; } = string.Empty;
            public Guid      StatusId             { get; set; }
            public string    Status               { get; set; } = string.Empty;
            public string    StatusColorHex       { get; set; } = string.Empty;
            public bool      StatusIsFinal        { get; set; }
            public bool      StatusRequiresResolution { get; set; }
            /// <summary>CSV de Ids de estado a los que se puede transicionar desde el estado actual.</summary>
            public string?   AllowedNextStatusIds { get; set; }
            /// <summary>Solución registrada al marcar el ticket como resuelto (null si nunca se resolvió o se reabrió).</summary>
            public string?   Resolution           { get; set; }
            public DateTime? ResolvedAt           { get; set; }
            public DateTime? ClosedAt             { get; set; }
            /// <summary>Vencimiento de la primera respuesta según el SLA de la prioridad (null = sin objetivo).</summary>
            public DateTime? FirstResponseDueAt   { get; set; }
            /// <summary>Vencimiento de resolución según el SLA de la prioridad (null = sin objetivo).</summary>
            public DateTime? ResolutionDueAt      { get; set; }
            /// <summary>Momento de la primera respuesta del agente asignado (comentario o cambio de estado).</summary>
            public DateTime? FirstRespondedAt     { get; set; }
            public bool      IsActive             { get; set; }
            public DateTime  CreatedAt            { get; set; }
            public DateTime? UpdatedAt            { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un ticket.</summary>
        public class TicketRequest
        {
            [Required(ErrorMessage = "El asunto es requerido.")]
            [MaxLength(200, ErrorMessage = "El asunto no puede superar 200 caracteres.")]
            public string Subject { get; set; } = string.Empty;

            [MaxLength(2000, ErrorMessage = "La descripción no puede superar 2000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "El solicitante es requerido.")]
            public Guid RequesterId { get; set; }

            [Required(ErrorMessage = "La categoría es requerida.")]
            public Guid CategoryId { get; set; }

            [Required(ErrorMessage = "La prioridad es requerida.")]
            public Guid PriorityId { get; set; }

            public Guid? AssignedToId { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud de autoservicio: cualquier usuario autenticado reporta un
        /// ticket para sí mismo, sin necesidad del módulo Helpdesk. El solicitante se resuelve
        /// en el servidor a partir del empleado vinculado al usuario en sesión.
        /// </summary>
        public class SelfTicketRequest
        {
            [Required(ErrorMessage = "El asunto es requerido.")]
            [MaxLength(200, ErrorMessage = "El asunto no puede superar 200 caracteres.")]
            public string Subject { get; set; } = string.Empty;

            [MaxLength(2000, ErrorMessage = "La descripción no puede superar 2000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "La categoría es requerida.")]
            public Guid CategoryId { get; set; }

            [Required(ErrorMessage = "La prioridad es requerida.")]
            public Guid PriorityId { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud para actualizar un ticket (no incluye el solicitante, el
        /// estado ni el responsable asignado — la asignación se maneja aparte con
        /// <see cref="TicketAssignRequest"/> vía hd.SP_AssignTicket/hd.SP_ClaimTicket).
        /// </summary>
        public class TicketUpdateRequest
        {
            [Required(ErrorMessage = "El asunto es requerido.")]
            [MaxLength(200, ErrorMessage = "El asunto no puede superar 200 caracteres.")]
            public string Subject { get; set; } = string.Empty;

            [MaxLength(2000, ErrorMessage = "La descripción no puede superar 2000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "La categoría es requerida.")]
            public Guid CategoryId { get; set; }

            [Required(ErrorMessage = "La prioridad es requerida.")]
            public Guid PriorityId { get; set; }
        }

        /// <summary>
        /// Cuerpo de la solicitud para reasignar un ticket a otro agente. Requiere
        /// el permiso helpdesk.tickets.manage-all — ver
        /// <see cref="server.Controllers.TicketsController.Assign"/>. Un ticket
        /// nunca queda sin responsable por esta vía (no existe "desasignar").
        /// </summary>
        public class TicketAssignRequest
        {
            public Guid? AssignedToId { get; set; }
        }

        /// <summary>Agente de soporte retornado por hd.SP_GetHelpdeskAgents, para el combo de responsable.</summary>
        public class AgentResponse
        {
            public Guid    Id        { get; set; }
            public string  FirstName { get; set; } = string.Empty;
            public string  LastName  { get; set; } = string.Empty;
            public string? PhotoUrl  { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para cambiar el estado de un ticket.</summary>
        public class TicketStatusChangeRequest
        {
            [Required(ErrorMessage = "El estado es requerido.")]
            public Guid StatusId { get; set; }

            /// <summary>Solución del ticket; requerida por hd.SP_ChangeTicketStatus cuando el estado destino la exige.</summary>
            [MaxLength(2000, ErrorMessage = "La solución no puede superar 2000 caracteres.")]
            public string? Resolution { get; set; }
        }

        /// <summary>Fila retornada por hd.SP_ProcessSlaEscalations: un ticket que necesita aviso de SLA.</summary>
        public class SlaEscalationResult
        {
            public Guid    TicketId     { get; set; }
            public string  Code         { get; set; } = string.Empty;
            public string  Subject      { get; set; } = string.Empty;
            public Guid?   AssignedToId { get; set; }
            /// <summary>"Warning" (aviso previo, 80% del tiempo consumido) o "Breach" (ya incumplido).</summary>
            public string  ActionType   { get; set; } = string.Empty;
        }

        /// <summary>Resultado estándar de los SPs de escritura de tickets.</summary>
        public class SP_TicketResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Comentarios de ticket ─────────────────────────────────────────────

        /// <summary>Comentario retornado por hd.SP_GetTicketComments.</summary>
        public class TicketCommentResponse
        {
            public Guid     Id         { get; set; }
            public Guid     TicketId   { get; set; }
            public Guid     UserId     { get; set; }
            public string   AuthorName { get; set; } = string.Empty;
            public string   Text       { get; set; } = string.Empty;
            public DateTime CreatedAt  { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear un comentario en un ticket.</summary>
        public class TicketCommentRequest
        {
            [Required(ErrorMessage = "El texto del comentario es requerido.")]
            [MaxLength(2000, ErrorMessage = "El comentario no puede superar 2000 caracteres.")]
            public string Text { get; set; } = string.Empty;
        }

        /// <summary>Resultado estándar de los SPs de escritura de comentarios.</summary>
        public class SP_TicketCommentResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Adjuntos de ticket ────────────────────────────────────────────────

        /// <summary>Adjunto retornado por hd.SP_GetTicketAttachments y hd.SP_GetTicketAttachmentById.</summary>
        public class TicketAttachmentResponse
        {
            public Guid     Id               { get; set; }
            public Guid     TicketId         { get; set; }
            public string   FileName         { get; set; } = string.Empty;
            /// <summary>Ruta del archivo en Blob Storage (hd/tickets/{id}/attachments/{archivo}).</summary>
            public string   BlobPath         { get; set; } = string.Empty;
            public long?    FileSize         { get; set; }
            public Guid     UploadedByUserId { get; set; }
            public string   UploadedByName   { get; set; } = string.Empty;
            public DateTime CreatedAt        { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de adjuntos.</summary>
        public class SP_TicketAttachmentResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Reportes ──────────────────────────────────────────────────────────

        /// <summary>Fila de volumen de tickets agrupado por estado, categoría o prioridad (hd.SP_GetTicketVolumeReport).</summary>
        public class VolumeByGroupResponse
        {
            public Guid    Id       { get; set; }
            public string  Label    { get; set; } = string.Empty;
            public string? ColorHex { get; set; }
            public int     Count    { get; set; }
        }

        /// <summary>Carga y resueltos por agente (hd.SP_GetAgentLoadReport).</summary>
        public class AgentLoadResponse
        {
            public Guid    AgentId         { get; set; }
            public string  AgentName       { get; set; } = string.Empty;
            public string? AgentPhotoUrl   { get; set; }
            public int     OpenAssigned    { get; set; }
            public int     ResolvedInRange { get; set; }
        }

        /// <summary>Tiempos promedio de primera respuesta y resolución (hd.SP_GetResponseTimeReport).</summary>
        public class ResponseTimesResponse
        {
            public double? AvgFirstResponseMinutes  { get; set; }
            public double? AvgResolutionMinutes      { get; set; }
            public int     TicketsWithFirstResponse { get; set; }
            public int     TicketsResolved          { get; set; }
        }

        /// <summary>Cumplimiento de SLA por prioridad (hd.SP_GetSlaComplianceReport).</summary>
        public class SlaCompliancePriorityResponse
        {
            public Guid   PriorityId   { get; set; }
            public string PriorityName { get; set; } = string.Empty;
            public string ColorHex     { get; set; } = string.Empty;
            public int    WithinTarget { get; set; }
            public int    Breached     { get; set; }
            public int    Pending      { get; set; }
        }
    }
}
