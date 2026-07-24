using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using DxFlow.Web.Configuration;
using Microsoft.Extensions.Options;

namespace DxFlow.Web.Services;

/// <summary>
/// Raised when the APS GraphQL API returns errors and no usable data —
/// port of <c>DXQueryError</c> in <c>dx_service.py</c>.
/// </summary>
public sealed class DxQueryException : Exception
{
    public DxQueryException(object errors)
        : base(JsonSerializer.Serialize(errors))
    {
    }
}

/// <summary>
/// Executes GraphQL queries against the APS Data Exchange API.
/// Port of <c>backend/services/dx_service.py</c>.
/// </summary>
public sealed class DxService
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ApsOptions _options;
    private readonly ILogger<DxService> _logger;

    public DxService(
        IHttpClientFactory httpClientFactory,
        IOptions<ApsOptions> options,
        ILogger<DxService> logger)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    /// <summary>
    /// POSTs one GraphQL request and returns the <c>data</c> object.
    /// Partial GraphQL errors (some fields null) are logged but tolerated.
    /// </summary>
    public async Task<JsonElement> ExecuteAsync(
        string query,
        string accessToken,
        object? variables = null,
        string region = "",
        CancellationToken cancellationToken = default)
    {
        var client = _httpClientFactory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, _options.DataExchangeGraphqlUrl);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        request.Headers.TryAddWithoutValidation("Region", region);

        var payload = new Dictionary<string, object?>
        {
            ["query"] = query,
            ["variables"] = variables ?? new Dictionary<string, object?>(),
        };
        request.Content = new StringContent(
            JsonSerializer.Serialize(payload),
            Encoding.UTF8,
            "application/json");

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var root = document.RootElement.Clone();

        var hasErrors = root.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Array;
        root.TryGetProperty("data", out var data);

        if (hasErrors)
        {
            _logger.LogWarning("DX GraphQL query returned partial errors: {Errors}", errors.ToString());
            if (data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
            {
                throw new DxQueryException(errors);
            }
        }

        return data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined
            ? default
            : data.Clone();
    }
}
