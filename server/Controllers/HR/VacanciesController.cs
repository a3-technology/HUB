using Dapper;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using server.Authorization;
using shared.Models;
using shared.Repositories;

namespace server.Controllers
{
    /// <summary>
    /// Controlador del módulo Recursos Humanos — Reclutamiento: Vacantes.
    /// Expone operaciones CRUD y cambio de estado para las vacantes de empleo.
    /// Todas las operaciones de base de datos se realizan a través de <see cref="IGenericRepository"/>
    /// usando los stored procedures del schema hr.
    /// </summary>
    [ApiController]
    [Route("api/hr/vacancies")]
    [Authorize(Policy = "hr")]
    public class VacanciesController : ControllerBase
    {
        private readonly IGenericRepository _repo;

        /// <summary>Inicializa el controlador con el repositorio genérico inyectado.</summary>
        public VacanciesController(IGenericRepository repo)
        {
            _repo = repo;
        }

        /// <summary>
        /// Retorna la lista de vacantes con filtro opcional por estado.
        /// </summary>
        /// <param name="status">Open | OnHold | Closed | Cancelled | omitir = todas.</param>
        /// <returns>200 con la lista de <see cref="HR.VacancyResponse"/>.</returns>
        [HttpGet]
        public IActionResult GetAll([FromQuery] string? status = null)
        {
            var p = new DynamicParameters();
            p.Add("@Status", string.IsNullOrWhiteSpace(status) ? null : status.Trim());

            var result = _repo.GetAll<HR.VacancyResponse>("hr.SP_GetVacancies", p);
            return Ok(result);
        }

        /// <summary>
        /// Retorna una vacante por su identificador único.
        /// </summary>
        /// <param name="id">Identificador único (GUID) de la vacante.</param>
        /// <returns>200 con <see cref="HR.VacancyResponse"/> o 404 si no existe.</returns>
        [HttpGet("{id:guid}")]
        public IActionResult GetById(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.VacancyResponse>("hr.SP_GetVacancyById", p);
            if (result is null)
                return NotFound(new { message = "Vacante no encontrada." });

            return Ok(result);
        }

        /// <summary>
        /// Crea una nueva vacante validando cargo, departamento y rango salarial.
        /// </summary>
        /// <param name="request">Datos de la vacante.</param>
        /// <returns>200 con <see cref="HR.SP_VacancyResult"/> o 400 si hay error de validación.</returns>
        [HttpPost]
        [RequirePermission("hr.vacancies.create", "Crear vacantes")]
        public IActionResult Insert([FromBody] HR.VacancyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Title",         request.Title.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@PositionId",    request.PositionId);
            p.Add("@DepartmentId",  request.DepartmentId);
            p.Add("@OpeningsCount", request.OpeningsCount);
            p.Add("@SalaryMin",     request.SalaryMin);
            p.Add("@SalaryMax",     request.SalaryMax);
            p.Add("@CurrencyId",    request.CurrencyId);
            p.Add("@ClosingDate",   request.ClosingDate);

            var result = _repo.Get<HR.SP_VacancyResult>("hr.SP_InsertVacancy", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al crear la vacante." });

            return Ok(result);
        }

        /// <summary>
        /// Actualiza los datos de una vacante existente.
        /// </summary>
        /// <param name="id">Identificador único de la vacante a actualizar.</param>
        /// <param name="request">Nuevos datos de la vacante.</param>
        /// <returns>200 con <see cref="HR.SP_VacancyResult"/> o 400 si hay error.</returns>
        [HttpPut("{id:guid}")]
        [RequirePermission("hr.vacancies.update", "Editar vacantes")]
        public IActionResult Update(Guid id, [FromBody] HR.VacancyRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",            id);
            p.Add("@Title",         request.Title.Trim());
            p.Add("@Description",   request.Description?.Trim());
            p.Add("@PositionId",    request.PositionId);
            p.Add("@DepartmentId",  request.DepartmentId);
            p.Add("@OpeningsCount", request.OpeningsCount);
            p.Add("@SalaryMin",     request.SalaryMin);
            p.Add("@SalaryMax",     request.SalaryMax);
            p.Add("@CurrencyId",    request.CurrencyId);
            p.Add("@ClosingDate",   request.ClosingDate);

            var result = _repo.Get<HR.SP_VacancyResult>("hr.SP_UpdateVacancy", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al actualizar la vacante." });

            return Ok(result);
        }

        /// <summary>
        /// Cambia el estado de una vacante (Open, OnHold, Closed, Cancelled).
        /// </summary>
        /// <param name="id">Identificador único de la vacante.</param>
        /// <param name="request">Nuevo estado.</param>
        /// <returns>200 con <see cref="HR.SP_VacancyResult"/> o 400 si hay error.</returns>
        [HttpPatch("{id:guid}/status")]
        [RequirePermission("hr.vacancies.change-status", "Cambiar estado de vacantes")]
        public IActionResult ChangeStatus(Guid id, [FromBody] HR.VacancyStatusRequest request)
        {
            var p = new DynamicParameters();
            p.Add("@Id",     id);
            p.Add("@Status", request.Status.Trim());

            var result = _repo.Get<HR.SP_VacancyResult>("hr.SP_ChangeVacancyStatus", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al cambiar el estado de la vacante." });

            return Ok(result);
        }

        /// <summary>
        /// Elimina permanentemente una vacante.
        /// No se permite si tiene postulaciones asociadas.
        /// </summary>
        /// <param name="id">Identificador único de la vacante.</param>
        /// <returns>200 con <see cref="HR.SP_VacancyResult"/> o 400 si no existe o tiene postulaciones.</returns>
        [HttpDelete("{id:guid}")]
        [RequirePermission("hr.vacancies.delete", "Eliminar vacantes")]
        public IActionResult Delete(Guid id)
        {
            var p = new DynamicParameters();
            p.Add("@Id", id);

            var result = _repo.Get<HR.SP_VacancyResult>("hr.SP_DeleteVacancy", p);

            if (result is null || result.Success == 0)
                return BadRequest(new { message = result?.Message ?? "Error al eliminar la vacante." });

            return Ok(result);
        }
    }
}
