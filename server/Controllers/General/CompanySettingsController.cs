using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;
using System.Text.RegularExpressions;

namespace server.Controllers
{
    /// <summary>
    /// Configuración de empresa: dato transversal y singleton (una sola fila en
    /// dbo.CompanySettings). Cualquier usuario autenticado puede leerla —módulos
    /// como Helpdesk o Proyectos la necesitan para pintar el encabezado de sus
    /// PDFs sin depender de un permiso puntual—; solo la edición requiere el
    /// permiso "general.company.update".
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema dbo.
    /// </summary>
    [ApiController]
    [Route("api/company")]
    [Authorize]
    public class CompanySettingsController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        private static readonly string[] AllowedLogoExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        private const long MaxLogoSizeBytes = 5 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public CompanySettingsController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la configuración de empresa.
        /// </summary>
        /// <returns>200 con <see cref="DBO.CompanySettingsResponse"/>.</returns>
        [HttpGet]
        public IActionResult Get()
        {
            var result = _repo.Get<DBO.CompanySettingsResponse>("dbo.SP_GetCompanySettings", new DynamicParameters());
            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de la empresa (todo excepto el logo).
        /// </summary>
        /// <param name="request">Datos fiscales, de contacto y financieros de la empresa.</param>
        /// <returns>200 con <see cref="DBO.SP_CompanyResult"/> o 400 si hay error de validación.</returns>
        [HttpPut]
        [RequirePermission("general.company.update", "Editar configuración de empresa")]
        public IActionResult Update([FromBody] DBO.CompanySettingsRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@LegalName", request.LegalName.Trim());
            p.Add("@TradeName", request.TradeName?.Trim());
            p.Add("@TaxId", request.TaxId?.Trim());
            p.Add("@TaxRegime", request.TaxRegime?.Trim());
            p.Add("@Address", request.Address?.Trim());
            p.Add("@Phone", request.Phone?.Trim());
            p.Add("@Email", request.Email?.Trim());
            p.Add("@Website", request.Website?.Trim());
            p.Add("@ShowLogoOnDocuments", request.ShowLogoOnDocuments);

            var result = _repo.Get<DBO.SP_CompanyResult>("dbo.SP_UpdateCompanySettings", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la configuración de empresa." });

            return Ok(result);
        }

        /// <summary>
        /// Sube o reemplaza el logo de la empresa.
        /// </summary>
        /// <param name="file">Imagen JPG, PNG o WEBP de máximo 5 MB.</param>
        /// <returns>200 con <see cref="DBO.SP_CompanyResult"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("logo")]
        [RequirePermission("general.company.update", "Editar configuración de empresa")]
        public async Task<IActionResult> UploadLogo(IFormFile file)
        {
            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo del logo." });

            if (file.Length > MaxLogoSizeBytes)
                return BadRequest(new { message = "El logo no puede superar 5 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedLogoExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan JPG, PNG y WEBP." });

            var currentLogo = GetLogoPath();
            if (!string.IsNullOrWhiteSpace(currentLogo))
                await _storage.DeleteAsync(currentLogo);

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;

            var blobPath = BlobPaths.CompanyLogo(safeName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var result = SetLogoPath(blobPath);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar el logo." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (60 minutos) para mostrar el logo de la empresa.
        /// </summary>
        /// <returns>200 con { url } (url null si no hay logo registrado).</returns>
        [HttpGet("logo-url")]
        public async Task<IActionResult> GetLogoUrl()
        {
            var path = GetLogoPath();
            if (string.IsNullOrWhiteSpace(path))
                return Ok(new { url = (string?)null });

            var url = await _storage.GetReadUrlAsync(path, TimeSpan.FromMinutes(60));
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Sirve los bytes del logo directamente desde el API (mismo origen, sin
        /// CORS) — pensado para que los generadores de PDF del cliente puedan
        /// incrustarlo sin que el canvas quede "tainted" por un origen externo.
        /// </summary>
        /// <returns>200 con el archivo o 404 si no hay logo registrado.</returns>
        [HttpGet("logo")]
        public async Task<IActionResult> GetLogo()
        {
            var path = GetLogoPath();
            if (string.IsNullOrWhiteSpace(path))
                return NotFound(new { message = "La empresa no tiene logo registrado." });

            var download = await _storage.DownloadAsync(path);
            if (download is null)
                return NotFound(new { message = "El archivo del logo no se encontró en el almacenamiento." });

            return File(download.Value.Content, download.Value.ContentType);
        }

        /// <summary>
        /// Elimina el logo de la empresa: borra el archivo del contenedor y limpia la referencia.
        /// </summary>
        /// <returns>200 con <see cref="DBO.SP_CompanyResult"/>.</returns>
        [HttpDelete("logo")]
        [RequirePermission("general.company.update", "Editar configuración de empresa")]
        public async Task<IActionResult> DeleteLogo()
        {
            var currentLogo = GetLogoPath();
            if (!string.IsNullOrWhiteSpace(currentLogo))
                await _storage.DeleteAsync(currentLogo);

            var result = SetLogoPath(null);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el logo." });

            return Ok(result);
        }

        /// <summary>Consulta la ruta de blob cruda del logo de la empresa (null si no tiene).</summary>
        private string? GetLogoPath() =>
            _repo.Get<string>("dbo.SP_GetCompanyLogoPath", new DynamicParameters());

        /// <summary>Registra o limpia la ruta de blob del logo de la empresa.</summary>
        private DBO.SP_CompanyResult? SetLogoPath(string? blobPath)
        {
            var p = new DynamicParameters();
            p.Add("@LogoBlobPath", blobPath);
            return _repo.Get<DBO.SP_CompanyResult>("dbo.SP_UpdateCompanyLogo", p);
        }
    }
}
