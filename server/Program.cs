using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using server.Authorization;
using server.Services;
using shared.Repositories;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

// Todas las columnas de fecha/hora se guardan en UTC; este handler evita que Dapper
// las devuelva como DateTimeKind.Unspecified (lo que el navegador interpretaría como
// hora local en vez de UTC). Ver shared/Repositories/UtcDateTimeHandler.cs.
SqlMapper.AddTypeHandler(new UtcDateTimeHandler());

// ── Controladores ────────────────────────────────────────────────────────────
builder.Services.AddControllers();

// ── Repositorio genérico (acceso a datos mediante Dapper) ────────────────────
builder.Services.AddScoped<IGenericRepository, GenericRepository>();

// ── Token service (generación de JWT y refresh tokens) ───────────────────────
builder.Services.AddScoped<ITokenService, TokenService>();

// ── Notificaciones (genérico, reutilizable por cualquier módulo) ─────────────
builder.Services.AddScoped<INotificationService, NotificationService>();

// ── Escalamiento de SLA de Helpdesk (revisión periódica en background) ───────
builder.Services.AddHostedService<SlaEscalationService>();

// ── Almacenamiento de archivos (Azure Blob Storage, contenedor a3hub) ────────
// Singleton: el cliente de Azure es thread-safe y garantiza el contenedor al iniciar.
builder.Services.AddSingleton<IBlobStorageService, BlobStorageService>();

// ── CORS ─────────────────────────────────────────────────────────────────────
builder.Services.AddCors(options =>
    options.AddPolicy("AllowClient", policy =>
        policy.WithOrigins(
                  "http://localhost:64078",
                  "https://localhost:64078")
              .AllowAnyHeader()
              .AllowAnyMethod()));

// ── Autenticación JWT ────────────────────────────────────────────────────────
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["JwtSettings:Key"]!)),
            ValidateIssuer   = true,
            ValidIssuer      = builder.Configuration["JwtSettings:Issuer"],
            ValidateAudience = true,
            ValidAudience    = builder.Configuration["JwtSettings:Audience"],
            ValidateLifetime = true,
            ClockSkew        = TimeSpan.Zero
        };
    });

// ── Autorización por módulos ─────────────────────────────────────────────────
// Una política por módulo del sistema: el claim "modules" del JWT (códigos
// separados por coma, ej. "crm,hr") debe contener el código del módulo.
builder.Services.AddAuthorization(options =>
{
    foreach (var module in new[] { "hr", "crm", "security", "projects", "ventas", "helpdesk" })
        options.AddPolicy(module, policy =>
            policy.RequireAssertion(ctx =>
                (ctx.User.FindFirst("modules")?.Value ?? "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries)
                    .Contains(module)));
});

// ── Autorización por permisos granulares ─────────────────────────────────────
// Los códigos de permiso (ej. "hr.employees.create") no se pre-registran como
// policies: PermissionPolicyProvider las resuelve dinámicamente contra el claim
// "permissions" del JWT. El catálogo se descubre y sincroniza con la BD al
// arrancar (ver más abajo, PermissionCatalogSync).
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

// ── Swagger con soporte Bearer JWT ───────────────────────────────────────────
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title       = "ERP API",
        Version     = "v1",
        Description = "API REST. Autentíquese en /api/auth/login y use el token JWT en el botón Authorize."
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name        = "Authorization",
        Type        = SecuritySchemeType.Http,
        Scheme      = "bearer",
        BearerFormat = "JWT",
        In          = ParameterLocation.Header,
        Description = "Ingrese el token JWT. Ejemplo: {su_token}"
    });

    options.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document)] = []
    });
});

// ────────────────────────────────────────────────────────────────────────────
var app = builder.Build();

// Sincroniza dbo.Permissions con los [RequirePermission] descubiertos en los
// controllers — mantiene el catálogo en BD siempre alineado con el código.
using (var scope = app.Services.CreateScope())
{
    var repo = scope.ServiceProvider.GetRequiredService<IGenericRepository>();
    PermissionCatalogSync.Run(repo);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "ERP API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseCors("AllowClient");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
