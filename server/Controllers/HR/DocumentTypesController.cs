using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Tipos de documento.
    /// Catálogo de tipos del expediente documental del empleado
    /// (currículum, récord policial, identificación, títulos, contratos…).
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/document-types")]
    [Authorize(Policy = "hr")]
    public class DocumentTypesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public DocumentTypesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de tipos de documento con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.DocumentTypeResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.DocumentTypeResponse>("hr.SP_GetDocumentTypes", p);
            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo tipo de documento validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del tipo de documento.</param>
        /// <returns>200 con <see cref="HR.SP_EmployeeResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.document-types.create", "Crear tipos de documento")]
        public IActionResult Insert([FromBody] HR.DocumentTypeRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_EmployeeResult>("hr.SP_InsertDocumentType", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el tipo de documento." });

            return Ok(result);
        }
    }
}
