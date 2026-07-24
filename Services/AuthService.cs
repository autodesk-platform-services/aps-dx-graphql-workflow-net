using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Serialization;
using DxFlow.Web.Configuration;
using Microsoft.Extensions.Options;

namespace DxFlow.Web.Services;

/// <summary>
/// Implements APS 3-legged OAuth — port of <c>backend/services/auth_service.py</c>.
///
/// Flow:
/// 1. <see cref="BuildAuthorizeUrl"/> — redirect browser to Autodesk sign-in.
/// 2. User returns to <c>/api/auth/callback</c> with a one-time code.
/// 3. <see cref="ExchangeCodeAsync"/> — trade code for access token.
/// </summary>
public sealed class AuthService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ApsOptions _options;

    public AuthService(IHttpClientFactory httpClientFactory, IOptions<ApsOptions> options)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
    }

    /// <summary>
    /// Step 1: URL to redirect the user's browser to. <paramref name="state"/>
    /// is a CSRF token stored in session and verified on callback.
    /// </summary>
    public string BuildAuthorizeUrl(string state, string redirectUri)
    {
        if (string.IsNullOrWhiteSpace(_options.ClientId))
        {
            throw new InvalidOperationException("APS ClientId is not configured.");
        }

        var query = new Dictionary<string, string?>
        {
            ["response_type"] = "code",
            ["client_id"] = _options.ClientId,
            ["redirect_uri"] = redirectUri,
            ["scope"] = _options.Scope,
            ["state"] = state,
        };

        var encoded = string.Join("&", query.Select(kvp =>
            $"{Uri.EscapeDataString(kvp.Key)}={Uri.EscapeDataString(kvp.Value ?? string.Empty)}"));

        return $"{_options.AuthorizeUrl}?{encoded}";
    }

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(_options.ClientId) &&
        !string.IsNullOrWhiteSpace(_options.ClientSecret);

    /// <summary>
    /// Step 3: exchange the authorization code for tokens using HTTP Basic auth
    /// (client id + secret). The secret never leaves the server.
    /// </summary>
    public async Task<TokenResponse?> ExchangeCodeAsync(
        string code,
        string redirectUri,
        CancellationToken cancellationToken = default)
    {
        var basic = Convert.ToBase64String(
            Encoding.UTF8.GetBytes($"{_options.ClientId}:{_options.ClientSecret}"));

        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, _options.TokenUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        var form = new Dictionary<string, string>
        {
            ["grant_type"] = "authorization_code",
            ["code"] = code,
            ["redirect_uri"] = redirectUri,
        };
        request.Content = new FormUrlEncodedContent(form);

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadFromJsonAsync<TokenResponse>(cancellationToken);
        return json;
    }

    /// <summary>
    /// Fetches the signed-in user's display name (cosmetic — login still works if this fails).
    /// </summary>
    public async Task<UserProfile?> GetUserProfileAsync(string accessToken, CancellationToken cancellationToken = default)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, _options.UserInfoUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        return await response.Content.ReadFromJsonAsync<UserProfile>(cancellationToken);
    }
}

public sealed class TokenResponse
{
    [JsonPropertyName("access_token")]
    public string? AccessToken { get; set; }

    [JsonPropertyName("refresh_token")]
    public string? RefreshToken { get; set; }

    [JsonPropertyName("expires_in")]
    public int? ExpiresIn { get; set; }
}

public sealed class UserProfile
{
    public string? Name { get; set; }
    public string? Email { get; set; }
}
