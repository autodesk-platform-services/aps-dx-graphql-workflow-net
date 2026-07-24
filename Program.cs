using DxFlow.Web.Configuration;
using DxFlow.Web.Services;
using Microsoft.AspNetCore.HttpOverrides;

// ---------------------------------------------------------------------------
// Data Exchange Workflow Bench — ASP.NET Core entry point
// ---------------------------------------------------------------------------
// This file wires together the same pieces as the Python sample's
// backend/__init__.py + run.py:
//   - Configuration (ApsOptions, FlowStorageOptions)
//   - Session (stores OAuth token between requests)
//   - Static files + Razor views (the flow editor UI in wwwroot/)
//   - API controllers (/api/dx/*, /api/flows/*)
//   - OAuth routes (/oauth/login, /oauth/callback, /oauth/logout)
// ---------------------------------------------------------------------------

var builder = WebApplication.CreateBuilder(args);

// Match aps-medm-explorer: always load Development settings, then let env vars win.
builder.Host.ConfigureAppConfiguration((_, config) =>
{
    config.AddJsonFile("appsettings.Development.json", optional: true, reloadOnChange: true);
    config.AddEnvironmentVariables();
});

// Dokku / Heroku-style platforms set PORT; bind explicitly when present.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddDxFlowConfiguration(builder.Configuration);

var apsOptions = ApsConfigurationExtensions.GetApsOptions(builder.Configuration);

builder.Services.AddHttpClient();
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.Cookie.Name = "dxflow.session";
    options.Cookie.HttpOnly = true;
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.IdleTimeout = TimeSpan.FromHours(8);
    var onPlatform = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PORT"));
    if (apsOptions.SessionCookieSecure || onPlatform)
    {
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    }
});

builder.Services.AddControllersWithViews();
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<OAuthRedirectUriResolver>();
builder.Services.AddSingleton<DxService>();
builder.Services.AddSingleton<DxApiService>();
builder.Services.AddSingleton<ModelDerivativeService>();
builder.Services.AddSingleton<FlowService>();

var app = builder.Build();

var onPlatform = !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("PORT"));
if (apsOptions.BehindProxy || onPlatform)
{
    var forwardedHeaders = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    };
    forwardedHeaders.KnownNetworks.Clear();
    forwardedHeaders.KnownProxies.Clear();
    app.UseForwardedHeaders(forwardedHeaders);
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

if (apsOptions.SessionCookieSecure || onPlatform)
{
    app.UseHttpsRedirection();
}
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.MapControllers();

app.Run();
