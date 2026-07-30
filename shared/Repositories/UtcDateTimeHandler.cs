using Dapper;
using System.Data;

namespace shared.Repositories
{
    /// <summary>
    /// Todas las columnas de fecha/hora del sistema se guardan en UTC (SYSUTCDATETIME()
    /// o GETUTCDATE()). SQL Server no distingue UTC de hora local, así que Dapper
    /// devuelve los <see cref="DateTime"/> con <see cref="DateTimeKind.Unspecified"/> —
    /// al serializarlos a JSON quedan sin el sufijo "Z", y el navegador los interpreta
    /// como hora LOCAL en vez de UTC, corriéndolos por el offset de la zona horaria del
    /// cliente. Este handler los marca como <see cref="DateTimeKind.Utc"/> para que se
    /// serialicen correctamente y el cliente los convierta bien a su hora local.
    /// </summary>
    public class UtcDateTimeHandler : SqlMapper.TypeHandler<DateTime>
    {
        public override void SetValue(IDbDataParameter parameter, DateTime value) => parameter.Value = value;

        public override DateTime Parse(object value) => DateTime.SpecifyKind((DateTime)value, DateTimeKind.Utc);
    }
}
