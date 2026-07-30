using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Services;
using shared.Models;
using shared.Repositories;
using System.Text.RegularExpressions;

namespace server.Controllers
{
    /// <summary>
    /// Autoservicio de la foto de perfil de la CUENTA (dbo.Users.PhotoUrl), no del
    /// empleado. Es intencionalmente independiente de <see cref="EmployeeSelfController"/>
    /// (que gestiona hr.Employees.PhotoUrl, la ficha de empleado): cualquier usuario
    /// autenticado puede elegir su propia foto de perfil aquí, tenga o no un empleado
    /// vinculado, y esa foto NUNCA sobrescribe ni reemplaza la ficha de empleado —
    /// esa sigue siendo exclusiva de quien administra el módulo hr. Cualquier registro
    /// o función relacionada con el empleado (selects, directorio, módulo hr) debe
    /// seguir mostrando siempre la foto de la ficha, nunca esta.
    /// </summary>
    [ApiController]
    [Route("api/users/me")]
    [Authorize]
    public class UserSelfController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        private static readonly string[] AllowedPhotoExtensions = [".jpg", ".jpeg", ".png", ".webp"];
        private const long MaxPhotoSizeBytes = 5 * 1024 * 1024;

        /// <summary>Inicializa el controlador con el repositorio y el almacenamiento inyectados.</summary>
        public UserSelfController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>Id del usuario en sesión, tomado del claim "sub" del JWT.</summary>
        private Guid CurrentUserId() => Guid.Parse(User.FindFirst("sub")!.Value);

        /// <summary>
        /// Sube o reemplaza la foto de perfil del usuario en sesión.
        /// </summary>
        /// <param name="file">Imagen JPG, PNG o WEBP de máximo 5 MB.</param>
        /// <returns>200 con <see cref="DBO.SP_UpdateUserPhoto"/> o 400 si el archivo no es válido.</returns>
        [HttpPost("photo")]
        public async Task<IActionResult> UploadPhoto(IFormFile file)
        {
            var userId = CurrentUserId();

            if (file is null || file.Length == 0)
                return BadRequest(new { message = "Selecciona el archivo de la foto." });

            if (file.Length > MaxPhotoSizeBytes)
                return BadRequest(new { message = "La foto no puede superar 5 MB." });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedPhotoExtensions.Contains(extension))
                return BadRequest(new { message = "Formato no válido. Se aceptan JPG, PNG y WEBP." });

            var currentPhoto = GetPhotoPath(userId);
            if (!string.IsNullOrWhiteSpace(currentPhoto))
                await _storage.DeleteAsync(currentPhoto);

            var baseName = Path.GetFileNameWithoutExtension(file.FileName);
            var safeName = Regex.Replace(baseName, @"[^a-zA-Z0-9._-]", "-") + extension;

            var blobPath = BlobPaths.UserPhoto(userId, safeName);
            await using (var stream = file.OpenReadStream())
                await _storage.UploadAsync(blobPath, stream, file.ContentType);

            var result = SetPhotoPath(userId, blobPath);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al registrar la foto." });

            return Ok(result);
        }

        /// <summary>
        /// Retorna una URL temporal (60 minutos) para mostrar la foto de perfil propia.
        /// </summary>
        /// <returns>200 con { url } (url null si no tiene foto registrada).</returns>
        [HttpGet("photo-url")]
        public async Task<IActionResult> GetPhotoUrl()
        {
            var photoPath = GetPhotoPath(CurrentUserId());
            if (string.IsNullOrWhiteSpace(photoPath))
                return Ok(new { url = (string?)null });

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return Ok(new { url = url.ToString() });
        }

        /// <summary>
        /// Elimina la foto de perfil propia: borra el archivo del contenedor y limpia la referencia.
        /// </summary>
        /// <returns>200 con <see cref="DBO.SP_UpdateUserPhoto"/>.</returns>
        [HttpDelete("photo")]
        public async Task<IActionResult> DeletePhoto()
        {
            var userId = CurrentUserId();

            var currentPhoto = GetPhotoPath(userId);
            if (!string.IsNullOrWhiteSpace(currentPhoto))
                await _storage.DeleteAsync(currentPhoto);

            var result = SetPhotoPath(userId, null);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la foto." });

            return Ok(result);
        }

        /// <summary>Consulta la ruta de blob cruda de la foto de perfil del usuario (null si no tiene).</summary>
        private string? GetPhotoPath(Guid userId)
        {
            var p = new DynamicParameters();
            p.Add("@Id", userId);
            return _repo.Get<string>("dbo.SP_GetUserPhotoUrl", p);
        }

        /// <summary>Registra o limpia la ruta de blob de la foto de perfil del usuario.</summary>
        private DBO.SP_UpdateUserPhoto? SetPhotoPath(Guid userId, string? blobPath)
        {
            var p = new DynamicParameters();
            p.Add("@Id", userId);
            p.Add("@PhotoUrl", blobPath);
            return _repo.Get<DBO.SP_UpdateUserPhoto>("dbo.SP_UpdateUserPhoto", p);
        }
    }
}
