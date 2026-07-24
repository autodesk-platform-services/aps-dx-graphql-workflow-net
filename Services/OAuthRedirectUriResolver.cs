using DxFlow.Web.Configuration;
using Microsoft.Extensions.Options;

namespace DxFlow.Web.Services;

/// <summary>
/// Resolves the OAuth callback URL for the current request.
/// On Dokku/production, derives <c>https://your-host/api/auth/callback</c> from
/// the incoming request so a stale localhost default does not break sign-in.
/// </summary>
public sealed class OAuthRedirectUriResolver
{
    private readonly ApsOptions _apsOptions;
    private readonly AppSettingsOptions _appSettings;
    private readonly IConfiguration _configuration;

    public OAuthRedirectUriResolver(
        IOptions<ApsOptions> apsOptions,
        IOptions<AppSettingsOptions> appSettings,
        IConfiguration configuration)
    {
        _apsOptions = apsOptions.Value;
        _appSettings = appSettings.Value;
        _configuration = configuration;
    }

    public string Resolve(HttpRequest request)
    {
        var configured = _configuration[ApsConfigurationExtensions.CallbackUrlKey];
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = _apsOptions.RedirectUri;
        }

        if (!string.IsNullOrWhiteSpace(configured) && !IsLoopbackUrl(configured))
        {
            return configured.TrimEnd('/');
        }

        var appUrl = _appSettings.AppUrl;
        if (!string.IsNullOrWhiteSpace(appUrl) && !IsLoopbackUrl(appUrl))
        {
            return $"{appUrl.TrimEnd('/')}/api/auth/callback";
        }

        if (!IsLoopbackHost(request.Host.Host))
        {
            return $"{request.Scheme}://{request.Host}/api/auth/callback";
        }

        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured.TrimEnd('/');
        }

        if (!string.IsNullOrWhiteSpace(appUrl))
        {
            return $"{appUrl.TrimEnd('/')}/api/auth/callback";
        }

        return $"{request.Scheme}://{request.Host}/api/auth/callback";
    }

    private static bool IsLoopbackUrl(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && IsLoopbackHost(uri.Host);

    private static bool IsLoopbackHost(string host) =>
        string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(host, "127.0.0.1", StringComparison.OrdinalIgnoreCase);
}
