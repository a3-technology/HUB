using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Bancos.
    /// Expone operaciones CRUD y cambio de estado para los bancos usados en la
    /// cuenta de nómina de los empleados.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/banks")]
    [Authorize(Policy = "hr")]
    public class BanksController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public BanksController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de bancos con filtro opcional por estado.
        /// </summary>
        /// <param name="active">true = solo activos | false = solo inactivos | omitir = todos.</param>
        /// <returns>200 con la lista de <see cref="HR.BankResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] bool? active = null)
        {
            var p = new DynamicParameters();
            p.Add("@IsActive", active.HasValue ? (object)active.Value : null);

            var result = _repo.GetAll<HR.BankResponse>("hr.SP_GetBanks", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna un banco por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) del banco.</param>
        /// <returns>200 con <see cref="HR.BankResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.BankResponse>("hr.SP_GetBankById", p);
            if (result is null)
                return NotFound(new { message = "Banco no encontrado." });

            return Ok(result);
        }

        /// <summary>
        /// Crea un nuevo banco validando unicidad del nombre.
        /// </summary>
        /// <param name="request">Nombre y descripción del banco.</param>
        /// <returns>200 con <see cref="HR.SP_BankResult"/> o 400 si hay conflicto de unicidad.</returns>
        [HttpPost]
        [RequirePermission("hr.banks.create", "Crear bancos")]
        public IActionResult Insert([FromBody] HR.BankRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_BankResult>("hr.SP_InsertBank", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear el banco." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de un banco existente.
        /// Valida unicidad del nombre excluyendo el registro actual.
        /// </summary>
        /// <param name="id">Identificador único del banco a actualizar.</param>
        /// <param name="request">Nuevos datos del banco.</param>
        /// <returns>200 con <see cref="HR.SP_BankResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.banks.update", "Editar bancos")]
        public IActionResult Update(Guid id, [FromBody] HR.BankRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",          id);
            p.Add("@Name",        request.Name.Trim());
            p.Add("@Description", request.Description?.Trim());

            var result = _repo.Get<HR.SP_BankResult>("hr.SP_UpdateBank", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar el banco." });

            return Ok(result);
        }

        /// <summary>
        /// Alterna el estado activo/inactivo de un banco (eliminación lógica).
        /// Si estaba activo lo desactiva; si estaba inactivo lo reactiva.
        /// </summary>
        /// <param name="id">Identificador único del banco.</param>
        /// <returns>200 con <see cref="HR.SP_BankResult"/> o 400 si no existe.</returns>
        [HttpPatch("{id:guid}/toggle")]
        [RequirePermission("hr.banks.toggle", "Activar/desactivar bancos")]
        public IActionResult Toggle(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_BankResult>("hr.SP_ToggleBankStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado del banco." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente un banco.
        /// No se permite si tiene empleados asociados.
        /// </summary>
        /// <param name="id">Identificador único del banco.</param>
        /// <returns>200 con <see cref="HR.SP_BankResult"/> o 400 si no existe o tiene empleados.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.banks.delete", "Eliminar bancos")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_BankResult>("hr.SP_DeleteBank", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar el banco." });

            return Ok(result);
        }
    }
}
