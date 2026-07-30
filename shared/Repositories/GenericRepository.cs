using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Data;
using System.Data.Common;

namespace shared.Repositories
{
    public class GenericRepository : IGenericRepository
    {
        private readonly string _connectionString;

        public GenericRepository(IConfiguration config)
        {
            _connectionString = (config ?? throw new ArgumentNullException(nameof(config)))
                                .GetConnectionString("DefaultConnection")
                                ?? throw new InvalidOperationException("La cadena de conexión 'DefaultConnection' no está configurada.");
        }


        // Dispose automáticamente para liberar recursos
        public void Dispose()
        {
            GC.SuppressFinalize(this);
        }

        // Método para obtener una conexión
        public DbConnection GetDbConnection()
        {
            return new SqlConnection(_connectionString);
        }

        // Método para obtener un solo elemento
        public T? Get<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure)
        {
            using var db = new SqlConnection(_connectionString);
            return db.Query<T>(sp, parms, commandType: commandType).FirstOrDefault();
        }

        // Método para obtener una lista de elementos
        public List<T> GetAll<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure)
        {
            using var db = new SqlConnection(_connectionString);
            return db.Query<T>(sp, parms, commandType: commandType).ToList();
        }


        // Método para ejecutar una consulta sin retorno
        public int Execute(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure)
        {
            using var db = new SqlConnection(_connectionString);
            return db.Execute(sp, parms, commandType: commandType);
        }

        // Método para insertar un registro
        public T? Insert<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure)
        {
            using var db = new SqlConnection(_connectionString);
            db.Open();
            using var tran = db.BeginTransaction();
            try
            {
                var result = db.Query<T>(sp, parms, commandType: commandType, transaction: tran).FirstOrDefault();
                tran.Commit();
                return result;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        // Método para actualizar un registro
        public T? Update<T>(string sp, DynamicParameters parms, CommandType commandType = CommandType.StoredProcedure)
        {
            using var db = new SqlConnection(_connectionString);
            db.Open();
            using var tran = db.BeginTransaction();
            try
            {
                var result = db.Query<T>(sp, parms, commandType: commandType, transaction: tran).FirstOrDefault();
                tran.Commit();
                return result;
            }
            catch
            {
                tran.Rollback();
                throw;
            }
        }

        
    }
}
