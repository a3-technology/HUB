using Dapper;
using System.Data;
using System.Data.Common;

namespace shared.Repositories
{
    public interface IGenericRepository : IDisposable
    {
        // Método para obtener una conexión a la base de datos
        DbConnection GetDbConnection();

        // Método para obtener un solo elemento de la base de datos
        T? Get<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure);

        // Método para obtener una lista de elementos de la base de datos
        List<T> GetAll<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure);

        // Método para ejecutar una consulta no relacionada con resultados
        int Execute(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure);

        // Métodos para insertar y actualizar elementos en la base de datos
        T? Insert<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure);
        T? Update<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure);

    }
}
