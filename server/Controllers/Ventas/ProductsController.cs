using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Ventas — Productos y Servicios.
    /// Catálogo sin control de existencias, usado por Cotizaciones y Órdenes de Venta.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema sal.
    /// </summary>
    [ApiController]
    [Route("api/ventas/products")]
    [Authorize(Policy = "ventas")]
    public class ProductsController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public ProductsController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna el catálogo de productos/servicios con filtros opcionales.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <param name="type">Filtra por tipo (Product | Service).</param>
        /// <returns>200 con la lista de <see cref="Ventas.ProductResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null, [FromQuery] string? type = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);
            p.Add("@Type",     type);

            var result = _repo.GetAll<Ventas.ProductResponse>("sal.SP_GetProducts", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un producto/servicio por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del producto.</param>
        /// <returns>200 con <see cref="Ventas.ProductResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.ProductResponse>("sal.SP_GetProductById", p);
            if (result is null)
                return NotFound(new { message = "Producto no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo producto/servicio.
        /// </summary>
        /// <param name="request">Datos del producto.</param>
        /// <returns>200 con <see cref="Ventas.SP_ProductResult"/> o 400 si hay error.</returns>
        [HttpPost]
        [RequirePermission("ventas.products.create", "Crear productos")]
        public IActionResult Insert([FromBody] Ventas.ProductRequest request)
        {
            var p = BuildProductParameters(request);

            var result = _repo.Get<Ventas.SP_ProductResult>("sal.SP_InsertProduct", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el producto." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un producto/servicio existente.
        /// </summary>
        /// <param name="id">Identificador único del producto a actualizar.</param>
        /// <param name="request">Nuevos datos del producto.</param>
        /// <returns>200 con <see cref="Ventas.SP_ProductResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("ventas.products.update", "Editar productos")]
        public IActionResult Update(Guid id, [FromBody] Ventas.ProductRequest request)
        {
            var p = BuildProductParameters(request);
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_ProductResult>("sal.SP_UpdateProduct", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el producto." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un producto/servicio (eliminación lógica).
        /// </summary>
        /// <param name="id">Identificador único del producto.</param>
        /// <returns>200 con <see cref="Ventas.SP_ProductResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("ventas.products.toggle", "Activar/desactivar productos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_ProductResult>("sal.SP_ToggleProductStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del producto." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un producto/servicio (bloqueado si ya fue usado en cotizaciones u órdenes).
        /// </summary>
        /// <param name="id">Identificador único del producto.</param>
        /// <returns>200 con <see cref="Ventas.SP_ProductResult"/> o 400 si no existe o está en uso.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("ventas.products.delete", "Eliminar productos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<Ventas.SP_ProductResult>("sal.SP_DeleteProduct", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el producto." });

            return Ok(result);
        }

        /// <summary>Parámetros comunes de crear/actualizar producto.</summary>
        private static DynamicParameters BuildProductParameters(Ventas.ProductRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Code",        request.Code.Trim());
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());
            p.Add("@Type",        request.Type);
            p.Add("@Price",       request.Price);
            p.Add("@CurrencyId",  request.CurrencyId);
            p.Add("@TaxRate",     request.TaxRate);
            return p;
        }
    }
}
