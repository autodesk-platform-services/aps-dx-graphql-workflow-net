using System.Text.Json;
using DxFlow.Web.Constants;
using Microsoft.AspNetCore.Http;

namespace DxFlow.Web.Services;

/// <summary>
/// Session helpers for OAuth CSRF state tokens — mirrors
/// <c>_remember_oauth_state</c> / <c>_consume_oauth_state</c> in
/// <c>auth_routes.py</c>.
/// </summary>
public static class OAuthSession
{
    private const int MaxPendingStates = 10;

    public static void RememberState(ISession session, string state)
    {
        var pending = LoadStates(session);
        pending.Add(state);
        if (pending.Count > MaxPendingStates)
        {
            pending = pending[^MaxPendingStates..];
        }

        session.SetString(SessionKeys.OAuthStates, JsonSerializer.Serialize(pending));
    }

    public static bool ConsumeState(ISession session, string? state)
    {
        if (string.IsNullOrEmpty(state))
        {
            return false;
        }

        var pending = LoadStates(session);
        var index = pending.FindIndex(candidate => CryptographicEquals(state, candidate));
        if (index < 0)
        {
            return false;
        }

        pending.RemoveAt(index);
        session.SetString(SessionKeys.OAuthStates, JsonSerializer.Serialize(pending));
        return true;
    }

    private static List<string> LoadStates(ISession session)
    {
        var raw = session.GetString(SessionKeys.OAuthStates);
        if (string.IsNullOrEmpty(raw))
        {
            return [];
        }

        return JsonSerializer.Deserialize<List<string>>(raw) ?? [];
    }

    /// <summary>
    /// Constant-time comparison — same rationale as Python's hmac.compare_digest.
    /// </summary>
    private static bool CryptographicEquals(string left, string right)
    {
        if (left.Length != right.Length)
        {
            return false;
        }

        var result = 0;
        for (var i = 0; i < left.Length; i++)
        {
            result |= left[i] ^ right[i];
        }

        return result == 0;
    }
}
