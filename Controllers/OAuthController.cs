using DxFlow.Web.Constants;
using DxFlow.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace DxFlow.Web.Controllers;

/// <summary>
/// APS OAuth HTTP endpoints — port of <c>auth_routes.py</c>.
/// </summary>
public sealed class OAuthController : Controller
{
    private readonly AuthService _authService;
    private readonly OAuthRedirectUriResolver _redirectUriResolver;
    private readonly ILogger<OAuthController> _logger;

    public OAuthController(
        AuthService authService,
        OAuthRedirectUriResolver redirectUriResolver,
        ILogger<OAuthController> logger)
    {
        _authService = authService;
        _redirectUriResolver = redirectUriResolver;
        _logger = logger;
    }

    /// <summary>Step 1: redirect to Autodesk sign-in.</summary>
    [HttpGet("/api/auth/login")]
    [HttpGet("/oauth/login")]
    public IActionResult Login()
    {
        if (!_authService.IsConfigured)
        {
            return Content(
                "APS OAuth is not configured. Set APS_CLIENT_ID and APS_CLIENT_SECRET " +
                "in Dokku Admin (or appsettings.Development.json for local development).",
                "text/plain");
        }

        var redirectUri = _redirectUriResolver.Resolve(Request);
        _logger.LogInformation("Starting APS OAuth login with redirect_uri={RedirectUri}", redirectUri);

        var state = Convert.ToBase64String(Guid.NewGuid().ToByteArray())[..22];
        OAuthSession.RememberState(HttpContext.Session, state);
        HttpContext.Session.SetString(SessionKeys.OAuthRedirectUri, redirectUri);

        return Redirect(_authService.BuildAuthorizeUrl(state, redirectUri));
    }

    /// <summary>Steps 2–3: verify CSRF state, exchange code, store session.</summary>
    [HttpGet("/api/auth/callback")]
    [HttpGet("/oauth/callback")]
    public async Task<IActionResult> Callback(
        [FromQuery] string? code,
        [FromQuery] string? state,
        [FromQuery] string? error,
        [FromQuery(Name = "error_description")] string? errorDescription,
        CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(HttpContext.Session.GetString(SessionKeys.AccessToken)))
        {
            return RedirectToAction("Index", "Home");
        }

        if (!string.IsNullOrEmpty(error))
        {
            return StatusCode(400, $"Authorization failed: {error} - {errorDescription}");
        }

        if (!OAuthSession.ConsumeState(HttpContext.Session, state))
        {
            return StatusCode(400, "Invalid state parameter. Possible CSRF attempt.");
        }

        if (string.IsNullOrEmpty(code))
        {
            return StatusCode(400, "No authorization code returned.");
        }

        var redirectUri = HttpContext.Session.GetString(SessionKeys.OAuthRedirectUri)
            ?? _redirectUriResolver.Resolve(Request);

        var token = await _authService.ExchangeCodeAsync(code, redirectUri, cancellationToken);
        if (token?.AccessToken is null)
        {
            return StatusCode(502, "Token exchange failed.");
        }

        HttpContext.Session.Remove(SessionKeys.OAuthRedirectUri);
        HttpContext.Session.SetString(SessionKeys.AccessToken, token.AccessToken);
        if (!string.IsNullOrEmpty(token.RefreshToken))
        {
            HttpContext.Session.SetString(SessionKeys.RefreshToken, token.RefreshToken);
        }

        HttpContext.Session.SetInt32(SessionKeys.ExpiresIn, token.ExpiresIn ?? 3600);

        var profile = await _authService.GetUserProfileAsync(token.AccessToken, cancellationToken);
        if (profile is not null)
        {
            HttpContext.Session.SetString(SessionKeys.UserName, profile.Name ?? profile.Email ?? "Signed in");
        }

        return RedirectToAction("Index", "Home");
    }

    /// <summary>Clears session and returns to landing page.</summary>
    [HttpGet("/api/auth/logout")]
    [HttpGet("/oauth/logout")]
    public IActionResult Logout()
    {
        HttpContext.Session.Clear();
        return RedirectToAction("Index", "Home");
    }
}
