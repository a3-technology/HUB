using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo CRM.
    /// </summary>
    public partial class CRM
    {
        // ── Empresas ──────────────────────────────────────────────────────────

        /// <summary>
        /// Empresa retornada por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetCompanies y crm.SP_GetCompanyById.
        /// </summary>
        public class CompanyResponse
        {
            public Guid     Id             { get; set; }
            public string   Name           { get; set; } = string.Empty;
            public string?  TaxId          { get; set; }
            public Guid?    IndustryId     { get; set; }
            public string?  IndustryName   { get; set; }
            public Guid?    CountryId      { get; set; }
            public string?  CountryName    { get; set; }
            public string?  Email          { get; set; }
            public string?  Phone          { get; set; }
            public string?  Address        { get; set; }
            public Guid?    OwnerId        { get; set; }
            public string?  OwnerName      { get; set; }
            public string?  OwnerPhotoUrl  { get; set; }
            public int      BranchCount    { get; set; }
            public bool     IsActive       { get; set; }
            public DateTime CreatedAt      { get; set; }
            public DateTime? UpdatedAt     { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una empresa.</summary>
        public class CompanyRequest
        {
            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(50, ErrorMessage = "La identificación fiscal no puede superar 50 caracteres.")]
            public string? TaxId { get; set; }

            public Guid? IndustryId { get; set; }

            public Guid? CountryId { get; set; }

            [MaxLength(200, ErrorMessage = "El correo no puede superar 200 caracteres.")]
            public string? Email { get; set; }

            [MaxLength(30, ErrorMessage = "El teléfono no puede superar 30 caracteres.")]
            public string? Phone { get; set; }

            [MaxLength(300, ErrorMessage = "La dirección no puede superar 300 caracteres.")]
            public string? Address { get; set; }

            public Guid? OwnerId { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de empresas (insert/update/toggle/delete).</summary>
        public class SP_CompanyResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        /// <summary>
        /// Nota de una empresa retornada por crm.SP_GetCompanyNotes, con archivo
        /// adjunto opcional (Azure Blob Storage).
        /// </summary>
        public class CompanyNoteResponse
        {
            public Guid     Id         { get; set; }
            public Guid     CompanyId  { get; set; }
            public Guid     UserId     { get; set; }
            public string   AuthorName { get; set; } = string.Empty;
            public string?  Text       { get; set; }
            public string?  FileName   { get; set; }
            public string?  BlobPath   { get; set; }
            public long?    FileSize   { get; set; }
            public DateTime CreatedAt  { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de notas de empresa (insert/delete).</summary>
        public class SP_CompanyNoteResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Sucursales ────────────────────────────────────────────────────────

        /// <summary>
        /// Sucursal retornada por los SPs de consulta.
        /// Mapea el resultado de crm.SP_GetBranches y crm.SP_GetBranchById.
        /// </summary>
        public class BranchResponse
        {
            public Guid     Id          { get; set; }
            public Guid     CompanyId   { get; set; }
            public string   CompanyName { get; set; } = string.Empty;
            public string   Name        { get; set; } = string.Empty;
            public string?  TaxId       { get; set; }
            public string?  Address     { get; set; }
            public string?  Phone       { get; set; }
            public string?  Email       { get; set; }
            public bool     IsMain      { get; set; }
            public bool     IsActive    { get; set; }
            public DateTime CreatedAt   { get; set; }
            public DateTime? UpdatedAt  { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una sucursal.</summary>
        public class BranchRequest
        {
            [Required(ErrorMessage = "La empresa es requerida.")]
            public Guid CompanyId { get; set; }

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(150, ErrorMessage = "El nombre no puede superar 150 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(50, ErrorMessage = "El N° de identificación no puede superar 50 caracteres.")]
            public string? TaxId { get; set; }

            [MaxLength(300, ErrorMessage = "La dirección no puede superar 300 caracteres.")]
            public string? Address { get; set; }

            [MaxLength(30, ErrorMessage = "El teléfono no puede superar 30 caracteres.")]
            public string? Phone { get; set; }

            [MaxLength(200, ErrorMessage = "El correo no puede superar 200 caracteres.")]
            public string? Email { get; set; }

            public bool IsMain { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de sucursales (insert/update/toggle/delete).</summary>
        public class SP_BranchResult
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
            public Guid     Id          { get; set; }
            public Guid     CompanyId   { get; set; }
            public string   CompanyName { get; set; } = string.Empty;
            public Guid?    BranchId    { get; set; }
            public string?  BranchName  { get; set; }
            public string   Name        { get; set; } = string.Empty;
            public string?  Position    { get; set; }
            public string?  Email       { get; set; }

            /// <summary>Crudo tal como lo retorna el SP (arreglo JSON de strings); no se serializa al cliente.</summary>
            [System.Text.Json.Serialization.JsonIgnore]
            public string?  PhonesJson  { get; set; }

            public List<string> Phones  { get; set; } = new();
            public bool     IsPrimary   { get; set; }
            public string?  Notes       { get; set; }
            public bool     IsActive    { get; set; }
            public DateTime CreatedAt   { get; set; }
            public DateTime? UpdatedAt  { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un contacto.</summary>
        public class ContactRequest
        {
            [Required(ErrorMessage = "La empresa es requerida.")]
            public Guid CompanyId { get; set; }

            public Guid? BranchId { get; set; }

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(100, ErrorMessage = "El cargo no puede superar 100 caracteres.")]
            public string? Position { get; set; }

            [MaxLength(200, ErrorMessage = "El correo no puede superar 200 caracteres.")]
            public string? Email { get; set; }

            public List<string> Phones { get; set; } = new();

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
