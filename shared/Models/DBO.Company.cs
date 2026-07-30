using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs de Configuración de Empresa — dato transversal (no pertenece a
    /// ningún módulo), singleton (una sola fila en dbo.CompanySettings).
    /// </summary>
    public partial class DBO
    {
        /// <summary>Configuración de empresa retornada por dbo.SP_GetCompanySettings.</summary>
        public class CompanySettingsResponse
        {
            public Guid Id { get; set; }
            public string LegalName { get; set; } = string.Empty;
            public string? TradeName { get; set; }
            public string? TaxId { get; set; }
            public string? TaxRegime { get; set; }
            public string? Address { get; set; }
            public string? Phone { get; set; }
            public string? Email { get; set; }
            public string? Website { get; set; }
            public bool HasLogo { get; set; }
            public bool ShowLogoOnDocuments { get; set; }
            public DateTime CreatedAt { get; set; }
            public DateTime? UpdatedAt { get; set; }
        }

        /// <summary>Payload de dbo.SP_UpdateCompanySettings.</summary>
        public class CompanySettingsRequest
        {
            [Required(ErrorMessage = "La razón social es requerida.")]
            [MaxLength(200, ErrorMessage = "La razón social no puede superar 200 caracteres.")]
            public string LegalName { get; set; } = string.Empty;

            [MaxLength(200, ErrorMessage = "El nombre comercial no puede superar 200 caracteres.")]
            public string? TradeName { get; set; }

            [MaxLength(50, ErrorMessage = "La cédula jurídica no puede superar 50 caracteres.")]
            public string? TaxId { get; set; }

            [MaxLength(100, ErrorMessage = "El régimen tributario no puede superar 100 caracteres.")]
            public string? TaxRegime { get; set; }

            [MaxLength(300, ErrorMessage = "La dirección no puede superar 300 caracteres.")]
            public string? Address { get; set; }

            [MaxLength(30, ErrorMessage = "El teléfono no puede superar 30 caracteres.")]
            public string? Phone { get; set; }

            [EmailAddress(ErrorMessage = "El correo no tiene un formato válido.")]
            [MaxLength(150, ErrorMessage = "El correo no puede superar 150 caracteres.")]
            public string? Email { get; set; }

            [MaxLength(200, ErrorMessage = "El sitio web no puede superar 200 caracteres.")]
            public string? Website { get; set; }

            public bool ShowLogoOnDocuments { get; set; } = true;
        }

        /// <summary>Resultado estándar de los SPs de escritura de configuración de empresa.</summary>
        public class SP_CompanyResult
        {
            public int Success { get; set; }
            public string Message { get; set; } = string.Empty;
        }
    }
}
