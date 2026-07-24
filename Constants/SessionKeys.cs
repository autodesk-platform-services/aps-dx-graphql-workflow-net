namespace DxFlow.Web.Constants;

/// <summary>
/// Session dictionary keys — same names as the Python Flask sample so the
/// mental model transfers directly between both projects.
/// </summary>
public static class SessionKeys
{
    public const string AccessToken = "access_token";
    public const string RefreshToken = "refresh_token";
    public const string ExpiresIn = "expires_in";
    public const string UserName = "user_name";
    public const string OAuthStates = "oauth_states";
    public const string OAuthRedirectUri = "oauth_redirect_uri";
}
