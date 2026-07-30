using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo CRM.
    /// </summary>
    public partial class CRM
    {
        // ── Clientes ──────────────────────────────────────────────────────────

        /// <summary>
        /// Cliente retornado por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetClients y crm.SP_GetClientById.
        /// </summary>
        public class ClientResponse
        {
            public Guid     Id                 { get; set; }
            public string   Name               { get; set; } = string.Empty;
            public string?  Sector             { get; set; }
            public string?  Email              { get; set; }
            public string?  Phone              { get; set; }
            public string?  Website            { get; set; }
            public string?  Address            { get; set; }
            public string   Status             { get; set; } = string.Empty;
            public decimal? EstimatedValue     { get; set; }
            public Guid?    OwnerId            { get; set; }
            public string?  OwnerName          { get; set; }
            public string?  OwnerPhotoUrl      { get; set; }
            public string?  PrimaryContactName { get; set; }
            public string?  Notes              { get; set; }
            public bool     IsActive           { get; set; }
            public DateTime CreatedAt          { get; set; }
            public DateTime? UpdatedAt         { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un cliente.</summary>
        public class ClientRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(100, ErrorMessage = "El sector no puede superar 100 caracteres.")]
            public string? Sector { get; set; }

            [MaxLength(200, ErrorMessage = "El correo no puede superar 200 caracteres.")]
            public string? Email { get; set; }

            [MaxLength(30, ErrorMessage = "El teléfono no puede superar 30 caracteres.")]
            public string? Phone { get; set; }

            [MaxLength(200, ErrorMessage = "El sitio web no puede superar 200 caracteres.")]
            public string? Website { get; set; }

            [MaxLength(300, ErrorMessage = "La dirección no puede superar 300 caracteres.")]
            public string? Address { get; set; }

            [Required(ErrorMessage = "El estado es requerido.")]
            public string Status { get; set; } = string.Empty;

            public decimal? EstimatedValue { get; set; }

            public Guid? OwnerId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de clientes (insert/update/toggle/delete).</summary>
        public class SP_ClientResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Contactos ─────────────────────────────────────────────────────────

        /// <summary>
        /// Contacto retornado por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetContacts y crm.SP_GetContactById.
        /// </summary>
        public class ContactResponse
        {
            public Guid     Id         { get; set; }
            public Guid     ClientId   { get; set; }
            public string   ClientName { get; set; } = string.Empty;
            public string   FirstName  { get; set; } = string.Empty;
            public string   LastName   { get; set; } = string.Empty;
            public string?  Position   { get; set; }
            public string?  Email      { get; set; }
            public string?  Phone      { get; set; }
            public bool     IsPrimary  { get; set; }
            public string?  Notes      { get; set; }
            public bool     IsActive   { get; set; }
            public DateTime CreatedAt  { get; set; }
            public DateTime? UpdatedAt { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un contacto.</summary>
        public class ContactRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(100, ErrorMessage = "El nombre no puede superar 100 caracteres.")]
            public string FirstName { get; set; } = string.Empty;

            [Required(ErrorMessage = "El apellido es requerido.")]
            [MaxLength(100, ErrorMessage = "El apellido no puede superar 100 caracteres.")]
            public string LastName { get; set; } = string.Empty;

            [MaxLength(100, ErrorMessage = "El cargo no puede superar 100 caracteres.")]
            public string? Position { get; set; }

            [MaxLength(200, ErrorMessage = "El correo no puede superar 200 caracteres.")]
            public string? Email { get; set; }

            [MaxLength(30, ErrorMessage = "El teléfono no puede superar 30 caracteres.")]
            public string? Phone { get; set; }

            public bool IsPrimary { get; set; }

            [MaxLength(500, ErrorMessage = "Las notas no pueden superar 500 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de contactos (insert/update/toggle/delete).</summary>
        public class SP_ContactResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Oportunidades ─────────────────────────────────────────────────────

        /// <summary>
        /// Oportunidad retornada por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetOpportunities y crm.SP_GetOpportunityById.
        /// </summary>
        public class OpportunityResponse
        {
            public Guid      Id                { get; set; }
            public Guid      ClientId          { get; set; }
            public string    ClientName        { get; set; } = string.Empty;
            public Guid?     ContactId         { get; set; }
            public string?   ContactName       { get; set; }
            public string    Name              { get; set; } = string.Empty;
            public string    Stage             { get; set; } = string.Empty;
            public decimal?  Value             { get; set; }
            public int       Probability       { get; set; }
            public DateTime? ExpectedCloseDate { get; set; }
            public Guid?     OwnerId           { get; set; }
            public string?   OwnerName         { get; set; }
            public string?   OwnerPhotoUrl     { get; set; }
            public string?   Notes             { get; set; }
            public bool      IsActive          { get; set; }
            public DateTime  CreatedAt         { get; set; }
            public DateTime? UpdatedAt         { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una oportunidad.</summary>
        public class OpportunityRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            public Guid? ContactId { get; set; }

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [Required(ErrorMessage = "La etapa es requerida.")]
            public string Stage { get; set; } = string.Empty;

            public decimal? Value { get; set; }

            [Range(0, 100, ErrorMessage = "La probabilidad debe estar entre 0 y 100.")]
            public int Probability { get; set; }

            public DateTime? ExpectedCloseDate { get; set; }

            public Guid? OwnerId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de oportunidades (insert/update/toggle/delete).</summary>
        public class SP_OpportunityResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Actividades ───────────────────────────────────────────────────────

        /// <summary>
        /// Actividad retornada por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetActivities y crm.SP_GetActivityById.
        /// </summary>
        public class ActivityResponse
        {
            public Guid     Id                { get; set; }
            public Guid     ClientId          { get; set; }
            public string   ClientName        { get; set; } = string.Empty;
            public Guid?    ContactId         { get; set; }
            public string?  ContactName       { get; set; }
            public Guid?    OpportunityId     { get; set; }
            public string?  OpportunityName   { get; set; }
            public string   Type              { get; set; } = string.Empty;
            public string   Subject           { get; set; } = string.Empty;
            public string?  Description       { get; set; }
            public DateTime ActivityDate      { get; set; }
            public Guid?    OwnerId           { get; set; }
            public string?  OwnerName         { get; set; }
            public string?  OwnerPhotoUrl     { get; set; }
            public bool     IsActive          { get; set; }
            public DateTime CreatedAt         { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una actividad.</summary>
        public class ActivityRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            public Guid? ContactId { get; set; }

            public Guid? OpportunityId { get; set; }

            [Required(ErrorMessage = "El tipo es requerido.")]
            public string Type { get; set; } = string.Empty;

            [Required(ErrorMessage = "El asunto es requerido.")]
            [MaxLength(200, ErrorMessage = "El asunto no puede superar 200 caracteres.")]
            public string Subject { get; set; } = string.Empty;

            [MaxLength(1000, ErrorMessage = "La descripción no puede superar 1000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "La fecha es requerida.")]
            public DateTime ActivityDate { get; set; }

            public Guid? OwnerId { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de actividades (insert/update/toggle/delete).</summary>
        public class SP_ActivityResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
