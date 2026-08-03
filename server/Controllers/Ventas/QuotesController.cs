using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using server.Services;
using shared.Models;
using shared.Repositories;
using System.Text.Json;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Ventas — Cotizaciones.
    /// Expone operaciones CRUD (con líneas), cambio de estado de negocio,
    /// eliminación lógica y conversión a Orden de Venta. Todas las operaciones
    /// de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema sal.
    /// </summary>
    [ApiController]
    [Route("api/ventas/quotes")]
    [Authorize(Policy = "ventas")]
    public class QuotesController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public QuotesController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de cotizaciones con filtros opcionales.
        /// </summary>
        /// <param name="clientId">Filtra las cotizaciones de un cliente específico.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <param name="status">Filtra por estado (Draft, Sent, Accepted, Rejected, Expired, Converted).</param>
        /// <returns>200 con la lista de <see cref="SAL.QuoteResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? clientId = null, [FromQuery] bool? active = null, [FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId", clientId);
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Status",   status);

            var result = _repo.GetAll<SAL.QuoteResponse>("sal.SP_GetQuotes", p).ToList();

            foreach (var q in result)
                q.OwnerPhotoUrl = await SignPhotoUrl(q.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una cotización por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la cotización.</param>
        /// <returns>200 con <see cref="SAL.QuoteResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<SAL.QuoteResponse>("sal.SP_GetQuoteById", p);
            if (result is null)
                return NotFound(new { message = "Cotización no encontrada." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Retorna las líneas de una cotización.
        /// </summary>
        /// <param name="id">Identificador único de la cotización.</param>
        /// <returns>200 con la lista de <see cref="SAL.LineResponse"/>.</returns>
        [HttpGet("{id:guid}/lines")]
        public IActionResult GetLines(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@QuoteId", id);

            var result = _repo.GetAll<SAL.LineResponse>("sal.SP_GetQuoteLines", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva cotización con sus líneas.
        /// </summary>
        /// <param name="request">Datos de la cotización y su detalle.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("ventas.quotes.create", "Crear cotizaciones")]
        public IActionResult Insert([FromBody] SAL.QuoteRequest request)
        {
            var p = BuildQuoteParameters(request);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_InsertQuote", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la cotización." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza una cotización existente y reemplaza su lista de líneas.
        /// </summary>
        /// <param name="id">Identificador único de la cotización a actualizar.</param>
        /// <param name="request">Nuevos datos de la cotización y su detalle.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("ventas.quotes.update", "Editar cotizaciones")]
        public IActionResult Update(Guid id, [FromBody] SAL.QuoteRequest request)
        {
            var p = BuildQuoteParameters(request);
            p.Add("@Id", id);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_UpdateQuote", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la cotización." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia el estado de negocio de una cotización (Draft, Sent, Accepted, Rejected, Expired).
        /// </summary>
        /// <param name="id">Identificador único de la cotización.</param>
        /// <param name="request">Nuevo estado.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/status")]
        [RequirePermission("ventas.quotes.change-status", "Cambiar estado de cotizaciones")]
        public IActionResult ChangeStatus(Guid id, [FromBody] SAL.QuoteStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Status", request.Status);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_ChangeQuoteStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la cotización." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una cotización (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la cotización.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("ventas.quotes.toggle", "Activar/desactivar cotizaciones")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_ToggleQuoteStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la cotización." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una cotización (bloqueado si ya generó una orden de venta).
        /// </summary>
        /// <param name="id">Identificador único de la cotización.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> o 400 si no existe o ya fue convertida.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("ventas.quotes.delete", "Eliminar cotizaciones")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_DeleteQuote", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la cotización." });

            return Ok(result);
        }

        /// <summary>
        /// Convierte una cotización en estado Aceptada en una nueva Orden de Venta,
        /// copiando sus líneas y marcando la cotización como Convertida.
        /// </summary>
        /// <param name="id">Identificador único de la cotización a convertir.</param>
        /// <param name="request">Fecha de la orden y fecha de entrega opcional.</param>
        /// <returns>200 con <see cref="SAL.SP_QuoteResult"/> (Id de la orden nueva) o 400 si hay error.</returns>
        [HttpPost("{id:guid}/convert")]
        [RequirePermission("ventas.quotes.convert", "Convertir cotización en orden de venta")]
        public IActionResult Convert(Guid id, [FromBody] SAL.ConvertQuoteRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@QuoteId",      id);
            p.Add("@OrderDate",    request.OrderDate.Date);
            p.Add("@DeliveryDate", request.DeliveryDate?.Date);

            var result = _repo.Get<SAL.SP_QuoteResult>("sal.SP_ConvertQuoteToOrder", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al convertir la cotización." });

            return Ok(result);
        }

        /// <summary>Parámetros comunes de crear/actualizar cotización, incluida la serialización de líneas.</summary>
        private static DynamicParameters BuildQuoteParameters(SAL.QuoteRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",       request.ClientId);
            p.Add("@ContactId",      request.ContactId);
            p.Add("@OpportunityId",  request.OpportunityId);
            p.Add("@IssueDate",      request.IssueDate.Date);
            p.Add("@ExpirationDate", request.ExpirationDate?.Date);
            p.Add("@CurrencyId",     request.CurrencyId);
            p.Add("@OwnerId",        request.OwnerId);
            p.Add("@Notes",          request.Notes?.Trim());
            p.Add("@Lines",          SerializeLines(request.Lines));
            return p;
        }

        /// <summary>Serializa las líneas al JSON que esperan los stored procedures de cotización/orden.</summary>
        private static string SerializeLines(List<SAL.LineRequest> lines) =>
            JsonSerializer.Serialize(lines.Select(l => new
            {
                productId   = l.ProductId,
                description = l.Description,
                quantity    = l.Quantity,
                unitPrice   = l.UnitPrice,
                taxRate     = l.TaxRate,
            }));

        /// <summary>
        /// Convierte la ruta de blob de la foto del ejecutivo asignado en una URL firmada
        /// temporal (60 minutos). Retorna null si no tiene foto.
        /// </summary>
        private async Task<string?> SignPhotoUrl(string? photoPath)
        {
            if (string.IsNullOrWhiteSpace(photoPath))
                return null;

            var url = await _storage.GetReadUrlAsync(photoPath, TimeSpan.FromMinutes(60));
            return url.ToString();
        }
    }
}
