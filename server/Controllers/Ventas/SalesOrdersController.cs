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
    /// Controlador del módulo Ventas — Órdenes de Venta.
    /// Expone operaciones CRUD (con líneas), cambio de estado de negocio,
    /// eliminación lógica y conversión a Contrato. Todas las operaciones
    /// de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema sal.
    /// </summary>
    [ApiController]
    [Route("api/ventas/orders")]
    [Authorize(Policy = "ventas")]
    public class SalesOrdersController : ControllerBase
    {
        private readonly IGenericRepository _repo;
        private readonly IBlobStorageService _storage;

        /// <summary>Inicializa el controlador con el repositorio genérico y el almacenamiento de archivos inyectados.</summary>
        public SalesOrdersController(IGenericRepository repo, IBlobStorageService storage)
        {
            _repo = repo;
            _storage = storage;
        }

        /// <summary>
        /// Retorna la lista de órdenes de venta con filtros opcionales.
        /// </summary>
        /// <param name="clientId">Filtra las órdenes de un cliente específico.</param>
        /// <param name="active">true = solo activas | false = solo inactivas | omitir = todas.</param>
        /// <param name="status">Filtra por estado (Pending, Confirmed, Delivered, Invoiced, Cancelled).</param>
        /// <returns>200 con la lista de <see cref="Ventas.SalesOrderResponse"/>.</returns>
        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] Guid? clientId = null, [FromQuery] bool? active = null, [FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId", clientId);
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Status",   status);

            var result = _repo.GetAll<Ventas.SalesOrderResponse>("sal.SP_GetSalesOrders", p).ToList();

            foreach (var o in result)
                o.OwnerPhotoUrl = await SignPhotoUrl(o.OwnerPhotoUrl);

            return Ok(result);
        }

        /// <summary>
        /// Retorna una orden de venta por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la orden.</param>
        /// <returns>200 con <see cref="Ventas.SalesOrderResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SalesOrderResponse>("sal.SP_GetSalesOrderById", p);
            if (result is null)
                return NotFound(new { message = "Orden de venta no encontrada." });

            result.OwnerPhotoUrl = await SignPhotoUrl(result.OwnerPhotoUrl);
            return Ok(result);
        }

        /// <summary>
        /// Retorna las líneas de una orden de venta.
        /// </summary>
        /// <param name="id">Identificador único de la orden.</param>
        /// <returns>200 con la lista de <see cref="Ventas.LineResponse"/>.</returns>
        [HttpGet("{id:guid}/lines")]
        public IActionResult GetLines(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@OrderId", id);

            var result = _repo.GetAll<Ventas.LineResponse>("sal.SP_GetSalesOrderLines", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva orden de venta con sus líneas (creación directa, sin cotización previa).
        /// </summary>
        /// <param name="request">Datos de la orden y su detalle.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("ventas.orders.create", "Crear órdenes de venta")]
        public IActionResult Insert([FromBody] Ventas.SalesOrderRequest request)
        {
            var p = BuildOrderParameters(request);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_InsertSalesOrder", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la orden de venta." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza una orden de venta existente y reemplaza su lista de líneas.
        /// </summary>
        /// <param name="id">Identificador único de la orden a actualizar.</param>
        /// <param name="request">Nuevos datos de la orden y su detalle.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("ventas.orders.update", "Editar órdenes de venta")]
        public IActionResult Update(Guid id, [FromBody] Ventas.SalesOrderRequest request)
        {
            var p = BuildOrderParameters(request);
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_UpdateSalesOrder", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la orden de venta." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia el estado de negocio de una orden de venta (Pending, Confirmed, Delivered, Invoiced, Cancelled).
        /// </summary>
        /// <param name="id">Identificador único de la orden.</param>
        /// <param name="request">Nuevo estado.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/status")]
        [RequirePermission("ventas.orders.change-status", "Cambiar estado de órdenes de venta")]
        public IActionResult ChangeStatus(Guid id, [FromBody] Ventas.SalesOrderStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Status", request.Status);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_ChangeSalesOrderStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la orden." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de una orden de venta (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único de la orden.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("ventas.orders.toggle", "Activar/desactivar órdenes de venta")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_ToggleSalesOrderStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la orden." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una orden de venta (bloqueado si ya generó un contrato).
        /// </summary>
        /// <param name="id">Identificador único de la orden.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> o 400 si no existe o ya generó un contrato.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("ventas.orders.delete", "Eliminar órdenes de venta")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_DeleteSalesOrder", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la orden de venta." });

            return Ok(result);
        }

        /// <summary>
        /// Convierte una orden de venta confirmada, entregada o facturada en un nuevo Contrato.
        /// </summary>
        /// <param name="id">Identificador único de la orden a convertir.</param>
        /// <param name="request">Título y vigencia del contrato.</param>
        /// <returns>200 con <see cref="Ventas.SP_SalesOrderResult"/> (Id del contrato nuevo) o 400 si hay error.</returns>
        [HttpPost("{id:guid}/convert")]
        [RequirePermission("ventas.orders.convert", "Convertir orden de venta en contrato")]
        public IActionResult Convert(Guid id, [FromBody] Ventas.ConvertOrderRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@OrderId",   id);
            p.Add("@Title",     request.Title.Trim());
            p.Add("@StartDate", request.StartDate.Date);
            p.Add("@EndDate",   request.EndDate?.Date);

            var result = _repo.Get<Ventas.SP_SalesOrderResult>("sal.SP_ConvertOrderToContract", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al convertir la orden de venta." });

            return Ok(result);
        }

        /// <summary>Parámetros comunes de crear/actualizar orden de venta, incluida la serialización de líneas.</summary>
        private static DynamicParameters BuildOrderParameters(Ventas.SalesOrderRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@ClientId",     request.ClientId);
            p.Add("@ContactId",    request.ContactId);
            p.Add("@OrderDate",    request.OrderDate.Date);
            p.Add("@DeliveryDate", request.DeliveryDate?.Date);
            p.Add("@CurrencyId",   request.CurrencyId);
            p.Add("@OwnerId",      request.OwnerId);
            p.Add("@Notes",        request.Notes?.Trim());
            p.Add("@Lines",        SerializeLines(request.Lines));
            return p;
        }

        /// <summary>Serializa las líneas al JSON que esperan los stored procedures de cotización/orden.</summary>
        private static string SerializeLines(List<Ventas.LineRequest> lines) =>
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
