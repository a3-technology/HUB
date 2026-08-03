using System.ComponentModel.DataAnnotations;

namespace shared.Models
{
    /// <summary>
    /// DTOs del módulo Ventas (schema sal). Clientes/Contactos/Oportunidades
    /// se reutilizan de <see cref="CRM"/>.
    /// </summary>
    public partial class SAL
    {
        // ── Productos y Servicios ────────────────────────────────────────────

        /// <summary>Producto/servicio retornado por sal.SP_GetProducts y sal.SP_GetProductById.</summary>
        public class ProductResponse
        {
            public Guid      Id             { get; set; }
            public string    Code           { get; set; } = string.Empty;
            public string    Name           { get; set; } = string.Empty;
            public string?   Description    { get; set; }
            public string    Type           { get; set; } = string.Empty;
            public decimal   Price          { get; set; }
            public Guid      CurrencyId     { get; set; }
            public string    CurrencyCode   { get; set; } = string.Empty;
            public string    CurrencySymbol { get; set; } = string.Empty;
            public decimal   TaxRate        { get; set; }
            public bool      IsActive       { get; set; }
            public DateTime  CreatedAt      { get; set; }
            public DateTime? UpdatedAt      { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un producto/servicio.</summary>
        public class ProductRequest
        {
            [Required(ErrorMessage = "El código es requerido.")]
            [MaxLength(20, ErrorMessage = "El código no puede superar 20 caracteres.")]
            public string Code { get; set; } = string.Empty;

            [Required(ErrorMessage = "El nombre es requerido.")]
            [MaxLength(200, ErrorMessage = "El nombre no puede superar 200 caracteres.")]
            public string Name { get; set; } = string.Empty;

            [MaxLength(1000, ErrorMessage = "La descripción no puede superar 1000 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "El tipo es requerido.")]
            public string Type { get; set; } = string.Empty;

            [Required(ErrorMessage = "El precio es requerido.")]
            public decimal Price { get; set; }

            [Required(ErrorMessage = "La moneda es requerida.")]
            public Guid CurrencyId { get; set; }

            public decimal TaxRate { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de productos (insert/update/toggle/delete).</summary>
        public class SP_ProductResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Líneas (compartido por Cotizaciones y Órdenes de Venta) ─────────

        /// <summary>Línea de detalle retornada por sal.SP_GetQuoteLines / sal.SP_GetSalesOrderLines.</summary>
        public class LineResponse
        {
            public Guid    Id          { get; set; }
            public Guid    ProductId   { get; set; }
            public string  ProductCode { get; set; } = string.Empty;
            public string  ProductName { get; set; } = string.Empty;
            public string? Description { get; set; }
            public decimal Quantity    { get; set; }
            public decimal UnitPrice   { get; set; }
            public decimal TaxRate     { get; set; }
            public decimal LineTotal   { get; set; }
            public int     SortOrder   { get; set; }
        }

        /// <summary>Línea enviada por el cliente al crear/actualizar una cotización u orden de venta.</summary>
        public class LineRequest
        {
            [Required(ErrorMessage = "El producto es requerido.")]
            public Guid ProductId { get; set; }

            [MaxLength(500, ErrorMessage = "La descripción no puede superar 500 caracteres.")]
            public string? Description { get; set; }

            [Required(ErrorMessage = "La cantidad es requerida.")]
            public decimal Quantity { get; set; }

            [Required(ErrorMessage = "El precio unitario es requerido.")]
            public decimal UnitPrice { get; set; }

            public decimal TaxRate { get; set; }
        }

        // ── Cotizaciones ──────────────────────────────────────────────────────

        /// <summary>Cotización retornada por sal.SP_GetQuotes y sal.SP_GetQuoteById.</summary>
        public class QuoteResponse
        {
            public Guid      Id                { get; set; }
            public string    Code              { get; set; } = string.Empty;
            public Guid      ClientId          { get; set; }
            public string    ClientName        { get; set; } = string.Empty;
            public Guid?     ContactId         { get; set; }
            public string?   ContactName       { get; set; }
            public Guid?     OpportunityId     { get; set; }
            public string?   OpportunityName   { get; set; }
            public DateTime  IssueDate         { get; set; }
            public DateTime? ExpirationDate    { get; set; }
            public string    Status            { get; set; } = string.Empty;
            public Guid      CurrencyId        { get; set; }
            public string    CurrencyCode      { get; set; } = string.Empty;
            public string    CurrencySymbol    { get; set; } = string.Empty;
            public decimal   Subtotal          { get; set; }
            public decimal   TaxTotal          { get; set; }
            public decimal   Total             { get; set; }
            public Guid?     OwnerId           { get; set; }
            public string?   OwnerName         { get; set; }
            public string?   OwnerPhotoUrl     { get; set; }
            public string?   Notes             { get; set; }
            public bool      IsActive          { get; set; }
            public DateTime  CreatedAt         { get; set; }
            public DateTime? UpdatedAt         { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una cotización, con sus líneas.</summary>
        public class QuoteRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            public Guid? ContactId { get; set; }

            public Guid? OpportunityId { get; set; }

            [Required(ErrorMessage = "La fecha de emisión es requerida.")]
            public DateTime IssueDate { get; set; }

            public DateTime? ExpirationDate { get; set; }

            [Required(ErrorMessage = "La moneda es requerida.")]
            public Guid CurrencyId { get; set; }

            public Guid? OwnerId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }

            [Required(ErrorMessage = "Debe incluir al menos una línea.")]
            [MinLength(1, ErrorMessage = "Debe incluir al menos una línea.")]
            public List<LineRequest> Lines { get; set; } = new();
        }

        /// <summary>Cuerpo de la solicitud para cambiar el estado de negocio de una cotización.</summary>
        public class QuoteStatusRequest
        {
            [Required(ErrorMessage = "El estado es requerido.")]
            public string Status { get; set; } = string.Empty;
        }

        /// <summary>Cuerpo de la solicitud para convertir una cotización aceptada en orden de venta.</summary>
        public class ConvertQuoteRequest
        {
            [Required(ErrorMessage = "La fecha de la orden es requerida.")]
            public DateTime OrderDate { get; set; }

            public DateTime? DeliveryDate { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de cotizaciones.</summary>
        public class SP_QuoteResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Órdenes de Venta ──────────────────────────────────────────────────

        /// <summary>Orden de venta retornada por sal.SP_GetSalesOrders y sal.SP_GetSalesOrderById.</summary>
        public class SalesOrderResponse
        {
            public Guid      Id               { get; set; }
            public string    Code             { get; set; } = string.Empty;
            public Guid      ClientId         { get; set; }
            public string    ClientName       { get; set; } = string.Empty;
            public Guid?     ContactId        { get; set; }
            public string?   ContactName      { get; set; }
            public Guid?     SourceQuoteId    { get; set; }
            public string?   SourceQuoteCode  { get; set; }
            public DateTime  OrderDate        { get; set; }
            public DateTime? DeliveryDate     { get; set; }
            public string    Status           { get; set; } = string.Empty;
            public Guid      CurrencyId       { get; set; }
            public string    CurrencyCode     { get; set; } = string.Empty;
            public string    CurrencySymbol   { get; set; } = string.Empty;
            public decimal   Subtotal         { get; set; }
            public decimal   TaxTotal         { get; set; }
            public decimal   Total            { get; set; }
            public Guid?     OwnerId          { get; set; }
            public string?   OwnerName        { get; set; }
            public string?   OwnerPhotoUrl    { get; set; }
            public string?   Notes            { get; set; }
            public bool      IsActive         { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar una orden de venta, con sus líneas.</summary>
        public class SalesOrderRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            public Guid? ContactId { get; set; }

            [Required(ErrorMessage = "La fecha de la orden es requerida.")]
            public DateTime OrderDate { get; set; }

            public DateTime? DeliveryDate { get; set; }

            [Required(ErrorMessage = "La moneda es requerida.")]
            public Guid CurrencyId { get; set; }

            public Guid? OwnerId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }

            [Required(ErrorMessage = "Debe incluir al menos una línea.")]
            [MinLength(1, ErrorMessage = "Debe incluir al menos una línea.")]
            public List<LineRequest> Lines { get; set; } = new();
        }

        /// <summary>Cuerpo de la solicitud para cambiar el estado de negocio de una orden de venta.</summary>
        public class SalesOrderStatusRequest
        {
            [Required(ErrorMessage = "El estado es requerido.")]
            public string Status { get; set; } = string.Empty;
        }

        /// <summary>Cuerpo de la solicitud para convertir una orden de venta en contrato.</summary>
        public class ConvertOrderRequest
        {
            [Required(ErrorMessage = "El título del contrato es requerido.")]
            [MaxLength(200, ErrorMessage = "El título no puede superar 200 caracteres.")]
            public string Title { get; set; } = string.Empty;

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            public DateTime? EndDate { get; set; }
        }

        /// <summary>Resultado estándar de los SPs de escritura de órdenes de venta.</summary>
        public class SP_SalesOrderResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }

        // ── Contratos ─────────────────────────────────────────────────────────

        /// <summary>Contrato retornado por sal.SP_GetContracts y sal.SP_GetContractById.</summary>
        public class ContractResponse
        {
            public Guid      Id               { get; set; }
            public string    Code             { get; set; } = string.Empty;
            public Guid      ClientId         { get; set; }
            public string    ClientName       { get; set; } = string.Empty;
            public Guid?     SourceOrderId    { get; set; }
            public string?   SourceOrderCode  { get; set; }
            public string    Title            { get; set; } = string.Empty;
            public DateTime  StartDate        { get; set; }
            public DateTime? EndDate          { get; set; }
            public string    Status           { get; set; } = string.Empty;
            public decimal   Value            { get; set; }
            public Guid      CurrencyId       { get; set; }
            public string    CurrencyCode     { get; set; } = string.Empty;
            public string    CurrencySymbol   { get; set; } = string.Empty;
            public Guid?     OwnerId          { get; set; }
            public string?   OwnerName        { get; set; }
            public string?   OwnerPhotoUrl    { get; set; }
            public string?   Notes            { get; set; }
            public string?   DocumentUrl      { get; set; }
            public string?   DocumentName     { get; set; }
            public bool      IsActive         { get; set; }
            public DateTime  CreatedAt        { get; set; }
            public DateTime? UpdatedAt        { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para crear o actualizar un contrato.</summary>
        public class ContractRequest
        {
            [Required(ErrorMessage = "El cliente es requerido.")]
            public Guid ClientId { get; set; }

            [Required(ErrorMessage = "El título es requerido.")]
            [MaxLength(200, ErrorMessage = "El título no puede superar 200 caracteres.")]
            public string Title { get; set; } = string.Empty;

            [Required(ErrorMessage = "La fecha de inicio es requerida.")]
            public DateTime StartDate { get; set; }

            public DateTime? EndDate { get; set; }

            public decimal Value { get; set; }

            [Required(ErrorMessage = "La moneda es requerida.")]
            public Guid CurrencyId { get; set; }

            public Guid? OwnerId { get; set; }

            [MaxLength(1000, ErrorMessage = "Las notas no pueden superar 1000 caracteres.")]
            public string? Notes { get; set; }
        }

        /// <summary>Cuerpo de la solicitud para cambiar el estado de negocio de un contrato.</summary>
        public class ContractStatusRequest
        {
            [Required(ErrorMessage = "El estado es requerido.")]
            public string Status { get; set; } = string.Empty;
        }

        /// <summary>Resultado estándar de los SPs de escritura de contratos.</summary>
        public class SP_SalesContractResult
        {
            public int    Success { get; set; }
            public string Message { get; set; } = string.Empty;
            public Guid?  Id      { get; set; }
        }
    }
}
