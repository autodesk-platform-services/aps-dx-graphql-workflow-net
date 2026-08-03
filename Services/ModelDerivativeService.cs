using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DxFlow.Web.Services;

/// <summary>
/// Looks up named views in a Revit file via Data Management + Model Derivative REST APIs.
/// Port of <c>backend/services/model_derivative_service.py</c>.
/// </summary>
public sealed class ModelDerivativeService
{
    private const string DataManagementItemUrl =
        "https://developer.api.autodesk.com/data/v1/projects/{0}/items/{1}";

    private const string ModelDerivativeMetadataUrl =
        "https://developer.api.autodesk.com/modelderivative/v2/designdata/{0}/metadata";

    private readonly IHttpClientFactory _httpClientFactory;

    public ModelDerivativeService(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<IReadOnlyList<ViewInfo>> GetViewsForItemAsync(
        string encodedItemId,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        var (projectId, itemId) = DecodeItemId(encodedItemId);
        var client = _httpClientFactory.CreateClient();

        using var itemRequest = new HttpRequestMessage(
            HttpMethod.Get,
            string.Format(DataManagementItemUrl, projectId, itemId));
        itemRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var itemResponse = await client.SendAsync(itemRequest, cancellationToken);
        itemResponse.EnsureSuccessStatusCode();

        using var itemDocument = await JsonDocument.ParseAsync(
            await itemResponse.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);
        var itemPayload = itemDocument.RootElement;

        var tipVersionId = itemPayload
            .GetProperty("data")
            .GetProperty("relationships")
            .GetProperty("tip")
            .GetProperty("data")
            .GetProperty("id")
            .GetString();

        if (string.IsNullOrEmpty(tipVersionId))
        {
            throw new ViewsLookupException($"Item {itemId} has no tip version");
        }

        var (derivativeUrn, manifestLink) = FindDerivativeInfo(itemPayload, tipVersionId);
        if (string.IsNullOrEmpty(derivativeUrn))
        {
            throw new ViewsLookupException($"Tip version {tipVersionId} has no derivative");
        }

        using var metadataRequest = new HttpRequestMessage(
            HttpMethod.Get,
            BuildMetadataUrl(derivativeUrn, manifestLink));
        metadataRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var metadataResponse = await client.SendAsync(metadataRequest, cancellationToken);
        metadataResponse.EnsureSuccessStatusCode();

        using var metadataDocument = await JsonDocument.ParseAsync(
            await metadataResponse.Content.ReadAsStreamAsync(cancellationToken),
            cancellationToken: cancellationToken);

        var views = metadataDocument.RootElement
            .GetProperty("data")
            .GetProperty("metadata");

        var results = new List<ViewInfo>();
        foreach (var view in views.EnumerateArray())
        {
            results.Add(new ViewInfo
            {
                Id = view.GetProperty("guid").GetString() ?? string.Empty,
                Name = view.GetProperty("name").GetString() ?? string.Empty,
                DerivativeUrn = derivativeUrn,
                ItemId = encodedItemId,
            });
        }

        return results;
    }

    private static (string ProjectId, string ItemId) DecodeItemId(string encodedItemId)
    {
        var padded = encodedItemId + new string('=', (-encodedItemId.Length % 4 + 4) % 4);
        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(padded);
        }
        catch (FormatException ex)
        {
            throw new ViewsLookupException($"Could not decode item id '{encodedItemId}': {ex.Message}");
        }

        var decoded = System.Text.Encoding.UTF8.GetString(bytes);
        var parts = decoded.Split('~');
        if (parts.Length < 5)
        {
            throw new ViewsLookupException($"Unexpected decoded item id shape: {decoded}");
        }

        return (parts[2], parts[^1]);
    }

    private static (string? Urn, string? ManifestLink) FindDerivativeInfo(JsonElement itemPayload, string tipVersionId)
    {
        if (!itemPayload.TryGetProperty("included", out var included))
        {
            return (null, null);
        }

        foreach (var entry in included.EnumerateArray())
        {
            if (entry.GetProperty("type").GetString() != "versions")
            {
                continue;
            }

            if (entry.GetProperty("id").GetString() != tipVersionId)
            {
                continue;
            }

            var derivatives = entry.GetProperty("relationships").GetProperty("derivatives");
            var urn = derivatives.GetProperty("data").GetProperty("id").GetString();
            var manifestLink = derivatives.TryGetProperty("meta", out var meta) &&
                meta.TryGetProperty("link", out var link) &&
                link.TryGetProperty("href", out var href)
                    ? href.GetString()
                    : null;

            return (urn, manifestLink);
        }

        return (null, null);
    }

    // Data Management's "derivatives" relationship carries a manifest link that is
    // already scoped to wherever the derivative actually lives — for EMEA/AUS-hosted
    // projects that's "/v2/regions/{region}/designdata/{urn}/manifest", not the
    // global "/v2/designdata/{urn}/manifest" path. The global metadata endpoint
    // 401s for those, so prefer rewriting this link over the hardcoded template
    // whenever Data Management gives us one.
    private static string BuildMetadataUrl(string derivativeUrn, string? manifestLink)
    {
        var manifestPath = manifestLink?.Split('?')[0];
        if (!string.IsNullOrEmpty(manifestPath) && manifestPath.EndsWith("/manifest", StringComparison.Ordinal))
        {
            return manifestPath[..^"/manifest".Length] + "/metadata";
        }

        return string.Format(ModelDerivativeMetadataUrl, Uri.EscapeDataString(derivativeUrn));
    }
}

public sealed class ViewsLookupException : Exception
{
    public ViewsLookupException(string message) : base(message)
    {
    }
}

public sealed class ViewInfo
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("derivative_urn")]
    public required string DerivativeUrn { get; init; }

    [JsonPropertyName("itemId")]
    public required string ItemId { get; init; }
}
