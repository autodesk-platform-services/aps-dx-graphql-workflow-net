namespace DxFlow.Web.Configuration;

/// <summary>
/// APS (Autodesk Platform Services) settings — the .NET equivalent of
/// <c>config.py</c> in the Python sample.
///
/// Credentials are loaded from the flat keys shared with aps-medm-explorer
/// (<c>APS_CLIENT_ID</c>, <c>APS_CLIENT_SECRET</c>, <c>APS_CALLBACK_URL</c>)
/// or from the nested <c>Aps</c> section / env vars (e.g. <c>Aps__ClientId</c>).
/// </summary>
public sealed class ApsOptions
{
    public const string SectionName = "Aps";

    /// <summary>OAuth app client id from https://aps.autodesk.com/myapps</summary>
    public string? ClientId { get; set; }

    /// <summary>OAuth app client secret — never expose to the browser.</summary>
    public string? ClientSecret { get; set; }

    /// <summary>Must match a callback URL registered on your APS app.</summary>
    public string RedirectUri { get; set; } = "http://localhost:8080/api/auth/callback";

    /// <summary>
    /// Scopes requested at login. <c>data:read</c> for GraphQL;
    /// <c>viewables:read</c> for the Viewer Output node.
    /// </summary>
    public string Scope { get; set; } = "user-profile:read data:read viewables:read";

    /// <summary>Fixed APS OAuth v2 authorize endpoint.</summary>
    public string AuthorizeUrl { get; set; } = "https://developer.api.autodesk.com/authentication/v2/authorize";

    /// <summary>Fixed APS OAuth v2 token endpoint.</summary>
    public string TokenUrl { get; set; } = "https://developer.api.autodesk.com/authentication/v2/token";

    /// <summary>User profile endpoint (requires user-profile:read scope).</summary>
    public string UserInfoUrl { get; set; } = "https://api.userprofile.autodesk.com/userinfo";

    /// <summary>Data Exchange GraphQL endpoint used by every navigation/tools node.</summary>
    public string DataExchangeGraphqlUrl { get; set; } =
        "https://developer.api.autodesk.com/dataexchange/2023-05/graphql";

    /// <summary>
    /// When true, session cookies require HTTPS (set on Dokku/production).
    /// </summary>
    public bool SessionCookieSecure { get; set; }

    /// <summary>
    /// When true, enable forwarded headers middleware so OAuth redirect URLs
    /// use https behind nginx/Dokku.
    /// </summary>
    public bool BehindProxy { get; set; }
}
