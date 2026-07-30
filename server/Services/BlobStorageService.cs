using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;

namespace server.Services
{
    /// <summary>
    /// Abstracción del almacenamiento de archivos de la aplicación.
    /// Los archivos se identifican por su ruta (blob path) dentro del contenedor único.
    /// </summary>
    public interface IBlobStorageService
    {
        /// <summary>Sube (o reemplaza) un archivo y retorna su ruta dentro del contenedor.</summary>
        Task<string> UploadAsync(string blobPath, Stream content, string contentType);

        /// <summary>Elimina un archivo si existe. Retorna true si se eliminó.</summary>
        Task<bool> DeleteAsync(string blobPath);

        /// <summary>Indica si existe un archivo en la ruta indicada.</summary>
        Task<bool> ExistsAsync(string blobPath);

        /// <summary>
        /// Genera una URL de solo lectura con firma temporal (SAS) para abrir el
        /// archivo desde el navegador sin exponer el contenedor públicamente.
        /// Si se indica <paramref name="downloadFileName"/>, la URL fuerza la
        /// descarga del archivo con ese nombre (Content-Disposition: attachment).
        /// </summary>
        Task<Uri> GetReadUrlAsync(string blobPath, TimeSpan validity, string? downloadFileName = null);

        /// <summary>
        /// Descarga el contenido de un archivo para servirlo a través del API
        /// (mismo origen). Retorna null si el archivo no existe.
        /// </summary>
        Task<(Stream Content, string ContentType)?> DownloadAsync(string blobPath);
    }

    /// <summary>
    /// Implementación sobre Azure Blob Storage (cuenta a3technology, contenedor a3hub).
    ///
    /// El contenedor es privado y único para toda la aplicación; la organización
    /// se logra con la CONVENCIÓN DE RUTAS de <see cref="BlobPaths"/>:
    ///
    ///     {módulo}/{entidad}/{id-del-registro}/{categoría}/{archivo}
    ///     Ej.: hr/candidates/3f2504e0-.../cv/curriculum.pdf
    ///
    /// Así cada archivo queda ligado a su módulo y registro de origen, y borrar
    /// los archivos de un registro es borrar su prefijo.
    /// </summary>
    public class BlobStorageService : IBlobStorageService
    {
        private readonly BlobContainerClient _container;

        /// <summary>Inicializa el cliente y garantiza que el contenedor exista (privado).</summary>
        public BlobStorageService(IConfiguration config)
        {
            var connectionString = config["AzureStorage:ConnectionString"]
                ?? throw new InvalidOperationException("Falta AzureStorage:ConnectionString en la configuración.");
            var containerName = config["AzureStorage:Container"]
                ?? throw new InvalidOperationException("Falta AzureStorage:Container en la configuración.");

            _container = new BlobContainerClient(connectionString, containerName);
            _container.CreateIfNotExists(PublicAccessType.None);
        }

        /// <inheritdoc />
        public async Task<string> UploadAsync(string blobPath, Stream content, string contentType)
        {
            var blob = _container.GetBlobClient(blobPath);
            await blob.UploadAsync(content, new BlobHttpHeaders { ContentType = contentType });
            return blobPath;
        }

        /// <inheritdoc />
        public async Task<bool> DeleteAsync(string blobPath)
        {
            var blob = _container.GetBlobClient(blobPath);
            return await blob.DeleteIfExistsAsync();
        }

        /// <inheritdoc />
        public async Task<bool> ExistsAsync(string blobPath)
        {
            var blob = _container.GetBlobClient(blobPath);
            return await blob.ExistsAsync();
        }

        /// <inheritdoc />
        public Task<Uri> GetReadUrlAsync(string blobPath, TimeSpan validity, string? downloadFileName = null)
        {
            var blob = _container.GetBlobClient(blobPath);

            // El vencimiento se ancla al próximo cambio de hora (en vez de "ahora +
            // validez"): así la URL firmada es idéntica dentro de la misma hora y el
            // navegador puede cachear el archivo (evita re-descargar las fotos en
            // cada visita). La validez efectiva queda entre `validity` y `validity + 1h`.
            var expiresOn = new DateTimeOffset(DateTimeOffset.UtcNow.UtcDateTime.Date, TimeSpan.Zero)
                .AddHours(DateTimeOffset.UtcNow.Hour + 1)
                .Add(validity);

            if (string.IsNullOrWhiteSpace(downloadFileName))
            {
                var uri = blob.GenerateSasUri(BlobSasPermissions.Read, expiresOn);
                return Task.FromResult(uri);
            }

            // filename* (RFC 5987) preserva acentos y caracteres especiales del nombre
            var asciiName = new string(downloadFileName.Select(c => c < 128 ? c : '_').ToArray()).Replace("\"", "'");
            var builder = new BlobSasBuilder(BlobSasPermissions.Read, expiresOn)
            {
                BlobContainerName = blob.BlobContainerName,
                BlobName = blob.Name,
                ContentDisposition = $"attachment; filename=\"{asciiName}\"; filename*=UTF-8''{Uri.EscapeDataString(downloadFileName)}",
            };
            return Task.FromResult(blob.GenerateSasUri(builder));
        }

        /// <inheritdoc />
        public async Task<(Stream Content, string ContentType)?> DownloadAsync(string blobPath)
        {
            var blob = _container.GetBlobClient(blobPath);
            if (!await blob.ExistsAsync())
                return null;

            var response = await blob.DownloadStreamingAsync();
            var contentType = string.IsNullOrWhiteSpace(response.Value.Details.ContentType)
                ? "application/octet-stream"
                : response.Value.Details.ContentType;
            return (response.Value.Content, contentType);
        }
    }

    /// <summary>
    /// Convención de rutas del contenedor a3hub. Toda ruta nueva debe construirse
    /// aquí para mantener la estructura {módulo}/{entidad}/{id}/{categoría}/{archivo}.
    /// </summary>
    public static class BlobPaths
    {
        /// <summary>Ruta del currículum de un candidato del módulo de reclutamiento.</summary>
        public static string CandidateResume(Guid candidateId, string fileName) =>
            $"hr/candidates/{candidateId}/cv/{fileName}";

        /// <summary>Ruta de la foto de un empleado.</summary>
        public static string EmployeePhoto(Guid employeeId, string fileName) =>
            $"hr/employees/{employeeId}/photo/{fileName}";

        /// <summary>Ruta de un documento del expediente de un empleado.</summary>
        public static string EmployeeDocument(Guid employeeId, string fileName) =>
            $"hr/employees/{employeeId}/docs/{fileName}";

        /// <summary>Ruta del documento firmado de un contrato de empleado.</summary>
        public static string ContractDocument(Guid contractId, string fileName) =>
            $"hr/contracts/{contractId}/document/{fileName}";

        /// <summary>Ruta de un archivo adjunto a una tarea del módulo de Gestión de Proyectos.</summary>
        public static string TaskAttachment(Guid taskId, string fileName) =>
            $"pm/tasks/{taskId}/attachments/{fileName}";

        /// <summary>Ruta del documento firmado de un contrato del módulo de Ventas.</summary>
        public static string SalesContractDocument(Guid contractId, string fileName) =>
            $"sal/contracts/{contractId}/document/{fileName}";

        /// <summary>Ruta de un archivo adjunto a un ticket del módulo de Helpdesk.</summary>
        public static string TicketAttachment(Guid ticketId, string fileName) =>
            $"hd/tickets/{ticketId}/attachments/{fileName}";

        /// <summary>
        /// Ruta de la foto de perfil propia de un usuario. Independiente de
        /// <see cref="EmployeePhoto"/>: esta es la foto que el usuario elige para sí
        /// mismo y nunca sobrescribe la ficha de empleado (hr.Employees.PhotoUrl).
        /// </summary>
        public static string UserPhoto(Guid userId, string fileName) =>
            $"sec/users/{userId}/photo/{fileName}";

        /// <summary>
        /// Ruta del logo de la empresa. Es un dato transversal y único (no hay
        /// "id de registro" porque dbo.CompanySettings es singleton).
        /// </summary>
        public static string CompanyLogo(string fileName) =>
            $"gen/company/logo/{fileName}";
    }
}
