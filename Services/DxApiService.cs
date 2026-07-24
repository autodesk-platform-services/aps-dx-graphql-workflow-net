using System.Text.Json;
using System.Text.Json.Nodes;
using DxFlow.Web.Models;

namespace DxFlow.Web.Services;

/// <summary>
/// Business logic behind <c>/api/dx/*</c> — port of
/// <c>backend/routes/dx_routes.py</c>. Controllers stay thin; this class
/// holds the GraphQL pagination, folder resolution, and exchange-data
/// flattening so each method reads like its Python counterpart.
/// </summary>
public sealed class DxApiService
{
    private const string TopLevelFolderName = "Project Files";
    private const int PageLimit = 200;

    private readonly DxService _dxService;
    private readonly ModelDerivativeService _modelDerivativeService;
    private readonly ILogger<DxApiService> _logger;

    public DxApiService(
        DxService dxService,
        ModelDerivativeService modelDerivativeService,
        ILogger<DxApiService> logger)
    {
        _dxService = dxService;
        _modelDerivativeService = modelDerivativeService;
        _logger = logger;
    }

    public async Task<JsonElement> GetHubsAsync(string accessToken, CancellationToken cancellationToken)
    {
        var data = await _dxService.ExecuteAsync(DxQueries.GetHubs, accessToken, cancellationToken: cancellationToken);
        return data.GetProperty("hubs").GetProperty("results").Clone();
    }

    public async Task<List<JsonElement>> GetProjectsAsync(
        IReadOnlyList<JsonElement> hubs,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var results = new List<JsonElement>();
        foreach (var hub in hubs)
        {
            var hubId = hub.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            if (string.IsNullOrEmpty(hubId))
            {
                continue;
            }

            var region = hub.TryGetProperty("region", out var regionProp) ? regionProp.GetString() ?? "" : "";
            try
            {
                var data = await _dxService.ExecuteAsync(
                    DxQueries.GetProjects,
                    accessToken,
                    new { hubId },
                    region,
                    cancellationToken);

                foreach (var project in data.GetProperty("projects").GetProperty("results").EnumerateArray())
                {
                    var node = JsonNode.Parse(project.GetRawText())!.AsObject();
                    node["region"] = region;
                    node["kind"] = "project";
                    results.Add(JsonSerializer.SerializeToElement(node));
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "GetProjects query failed for hub {HubId}", hubId);
            }
        }

        return results;
    }

    public Task<List<JsonElement>> GetFoldersAsync(
        IReadOnlyList<JsonElement> items,
        string accessToken,
        CancellationToken cancellationToken) =>
        AggregateFolderContentsAsync(
            items,
            accessToken,
            DxQueries.GetFolderFolders,
            data => ExtractPaginated(data, "folders"),
            "folder",
            cancellationToken);

    public Task<List<JsonElement>> GetItemsAsync(
        IReadOnlyList<JsonElement> items,
        string accessToken,
        CancellationToken cancellationToken) =>
        AggregateFolderContentsAsync(
            items,
            accessToken,
            DxQueries.GetFolderItems,
            data => ExtractPaginated(data, "items"),
            resultKind: null,
            cancellationToken: cancellationToken);

    public Task<List<JsonElement>> GetExchangesAsync(
        IReadOnlyList<JsonElement> items,
        string accessToken,
        CancellationToken cancellationToken) =>
        AggregateFolderContentsAsync(
            items,
            accessToken,
            DxQueries.GetFolderExchanges,
            data => ExtractPaginated(data, "exchanges"),
            "exchange",
            cancellationToken);

    public async Task<List<object>> GetViewsAsync(
        IReadOnlyList<JsonElement> items,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var results = new List<object>();
        foreach (var item in items)
        {
            var itemId = item.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            if (string.IsNullOrEmpty(itemId))
            {
                continue;
            }

            try
            {
                var views = await _modelDerivativeService.GetViewsForItemAsync(itemId, accessToken, cancellationToken);
                results.AddRange(views);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Get views failed for item {ItemId}", itemId);
            }
        }

        return results;
    }

    public async Task<List<object>> CreateExchangesAsync(
        IReadOnlyList<JsonElement> views,
        JsonElement? folder,
        string accessToken,
        CancellationToken cancellationToken)
    {
        if (folder is null || folder.Value.ValueKind == JsonValueKind.Null ||
            !folder.Value.TryGetProperty("id", out var folderIdProp) ||
            string.IsNullOrEmpty(folderIdProp.GetString()))
        {
            throw new InvalidOperationException("A destination folder is required");
        }

        var folderId = folderIdProp.GetString()!;
        var region = folder.Value.TryGetProperty("region", out var regionProp) ? regionProp.GetString() ?? "" : "";
        var results = new List<object>();

        foreach (var view in views)
        {
            var itemId = view.TryGetProperty("itemId", out var itemIdProp) ? itemIdProp.GetString() : null;
            var viewName = view.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
            if (string.IsNullOrEmpty(itemId) || string.IsNullOrEmpty(viewName))
            {
                continue;
            }

            var variables = new
            {
                input = new
                {
                    viewName,
                    source = new { fileId = itemId },
                    target = new { name = viewName, folderId },
                },
            };

            try
            {
                var data = await _dxService.ExecuteAsync(
                    DxQueries.CreateExchange,
                    accessToken,
                    variables,
                    region,
                    cancellationToken);
                results.Add(JsonSerializer.Deserialize<object>(data.GetRawText())!);
            }
            catch (DxQueryException ex)
            {
                results.Add(new { errors = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "createExchange failed for item {ItemId} / view {ViewName}", itemId, viewName);
                results.Add(new { error = ex.Message });
            }
        }

        return results;
    }

    public async Task<List<ExchangeDataRow>> GetExchangeDataAsync(
        IReadOnlyList<JsonElement> exchanges,
        string filterQuery,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var rows = new List<ExchangeDataRow>();
        var errors = new List<string>();

        foreach (var exchange in exchanges)
        {
            var exchangeId = exchange.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
            if (string.IsNullOrEmpty(exchangeId))
            {
                continue;
            }

            var region = exchange.TryGetProperty("region", out var regionProp) ? regionProp.GetString() ?? "" : "";
            var exchangeName = exchange.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;

            try
            {
                var elements = await FetchExchangeElementsAsync(exchangeId, accessToken, region, filterQuery, cancellationToken);
                rows.AddRange(RowsFromElements(elements, exchangeName));
            }
            catch (Exception ex)
            {
                errors.Add(ex.Message);
                _logger.LogWarning(ex, "FilterUsingComplexQuery failed for exchange {ExchangeId}", exchangeId);
            }
        }

        if (rows.Count == 0 && errors.Count > 0 && exchanges.Count > 0)
        {
            var message = errors.Distinct(StringComparer.Ordinal).Count() == 1
                ? errors[0]
                : string.Join("; ", errors.Distinct(StringComparer.Ordinal));
            throw new InvalidOperationException(message);
        }

        return rows;
    }

    private async Task<List<JsonElement>> FetchExchangeElementsAsync(
        string exchangeId,
        string accessToken,
        string region,
        string filterQuery,
        CancellationToken cancellationToken)
    {
        var results = new List<JsonElement>();
        string? cursor = null;

        while (true)
        {
            var pagination = new Dictionary<string, object> { ["limit"] = PageLimit };
            if (!string.IsNullOrEmpty(cursor))
            {
                pagination["cursor"] = cursor;
            }

            var variables = new
            {
                exchangeId,
                elementFilter = new { query = filterQuery ?? string.Empty },
                elementPagination = pagination,
            };

            var data = await _dxService.ExecuteAsync(
                DxQueries.GetExchangeElements,
                accessToken,
                variables,
                region,
                cancellationToken);

            if (data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
                !data.TryGetProperty("exchange", out var exchange) ||
                exchange.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
                !exchange.TryGetProperty("elements", out var elementsContainer))
            {
                if (results.Count == 0)
                {
                    throw new InvalidOperationException(
                        $"Exchange '{exchangeId}' returned no element data (check Region header and exchange id)");
                }

                break;
            }

            if (!elementsContainer.TryGetProperty("results", out var page) ||
                page.ValueKind is not JsonValueKind.Array)
            {
                break;
            }

            results.AddRange(page.EnumerateArray().Select(el => el.Clone()));

            cursor = elementsContainer.TryGetProperty("pagination", out var paginationNode) &&
                     paginationNode.TryGetProperty("cursor", out var cursorProp)
                ? cursorProp.GetString()
                : null;

            if (string.IsNullOrEmpty(cursor) || page.GetArrayLength() < PageLimit)
            {
                break;
            }
        }

        return results;
    }

    private static List<ExchangeDataRow> RowsFromElements(
        IReadOnlyList<JsonElement> elements,
        string? exchangeName)
    {
        var rows = new List<ExchangeDataRow>();
        foreach (var element in elements)
        {
            var propertyList = GetPropertyResults(element);
            var category = FindPropertyValue(propertyList, "category");
            var typeValue = FindPropertyValue(propertyList, "type");

            foreach (var prop in propertyList)
            {
                rows.Add(new ExchangeDataRow
                {
                    ExchangeName = exchangeName,
                    ElementId = element.TryGetProperty("id", out var idProp) ? idProp.GetString() : null,
                    Category = category,
                    ElementName = element.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null,
                    Type = typeValue,
                    KeyProperty = prop.TryGetProperty("name", out var propName) ? propName.GetString() : null,
                    Value = prop.TryGetProperty("value", out var propValue) ? JsonElementToString(propValue) : null,
                });
            }
        }

        return rows;
    }

    private static List<JsonElement> GetPropertyResults(JsonElement element)
    {
        if (!element.TryGetProperty("properties", out var properties) ||
            properties.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return [];
        }

        if (!properties.TryGetProperty("results", out var results) ||
            results.ValueKind is not JsonValueKind.Array)
        {
            return [];
        }

        return results.EnumerateArray().Select(r => r.Clone()).ToList();
    }

    private static string? FindPropertyValue(IReadOnlyList<JsonElement> properties, string name)
    {
        foreach (var prop in properties)
        {
            var propName = prop.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null;
            if (string.Equals(propName, name, StringComparison.OrdinalIgnoreCase))
            {
                return prop.TryGetProperty("value", out var valueProp) ? JsonElementToString(valueProp) : null;
            }
        }

        return null;
    }

    private static string? JsonElementToString(JsonElement element) =>
        element.ValueKind switch
        {
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Null or JsonValueKind.Undefined => null,
            _ => element.GetRawText(),
        };

    private async Task<List<JsonElement>> AggregateFolderContentsAsync(
        IReadOnlyList<JsonElement> itemsPayload,
        string accessToken,
        string query,
        Func<JsonElement, (List<JsonElement> Results, string? Cursor)> extractResults,
        string? resultKind,
        CancellationToken cancellationToken)
    {
        var aggregated = new List<JsonElement>();

        foreach (var item in itemsPayload)
        {
            string? folderId;
            string region;
            try
            {
                (folderId, region) = await ResolveFolderIdAsync(item, accessToken, cancellationToken);
            }
            catch (Exception ex)
            {
                var itemId = item.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                _logger.LogWarning(ex, "Resolving folder failed for {ItemId}", itemId);
                continue;
            }

            if (string.IsNullOrEmpty(folderId))
            {
                continue;
            }

            string? cursor = null;
            while (true)
            {
                var pagination = new Dictionary<string, object> { ["limit"] = PageLimit };
                if (!string.IsNullOrEmpty(cursor))
                {
                    pagination["cursor"] = cursor;
                }

                try
                {
                    var data = await _dxService.ExecuteAsync(
                        query,
                        accessToken,
                        new { folderId, pagination },
                        region,
                        cancellationToken);

                    var (results, nextCursor) = extractResults(data);
                    foreach (var result in results)
                    {
                        if (resultKind is not null)
                        {
                            var node = JsonNode.Parse(result.GetRawText())!.AsObject();
                            node["region"] = region;
                            node["kind"] = resultKind;
                            aggregated.Add(JsonSerializer.SerializeToElement(node));
                        }
                        else
                        {
                            aggregated.Add(result.Clone());
                        }
                    }

                    if (string.IsNullOrEmpty(nextCursor) || results.Count < PageLimit)
                    {
                        break;
                    }

                    cursor = nextCursor;
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "GetFolderContent query failed for folder {FolderId}", folderId);
                    break;
                }
            }
        }

        return aggregated;
    }

    private async Task<(string? FolderId, string Region)> ResolveFolderIdAsync(
        JsonElement item,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var region = item.TryGetProperty("region", out var regionProp) ? regionProp.GetString() ?? "" : "";
        var itemId = item.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
        if (string.IsNullOrEmpty(itemId))
        {
            return (null, region);
        }

        var kind = item.TryGetProperty("kind", out var kindProp) ? kindProp.GetString() : null;
        if (kind == "folder")
        {
            return (itemId, region);
        }

        var folderId = await FindProjectFilesFolderIdAsync(itemId, region, accessToken, cancellationToken);
        return (folderId, region);
    }

    private async Task<string?> FindProjectFilesFolderIdAsync(
        string projectId,
        string region,
        string accessToken,
        CancellationToken cancellationToken)
    {
        var data = await _dxService.ExecuteAsync(
            DxQueries.GetProjectFolders,
            accessToken,
            new { projectId },
            region,
            cancellationToken);

        var topFolders = data.GetProperty("project").GetProperty("folders").GetProperty("results");
        foreach (var folder in topFolders.EnumerateArray())
        {
            if (folder.TryGetProperty("name", out var nameProp) &&
                nameProp.GetString() == TopLevelFolderName)
            {
                return folder.GetProperty("id").GetString();
            }
        }

        return null;
    }

    private static (List<JsonElement> Results, string? Cursor) ExtractPaginated(JsonElement data, string fieldName)
    {
        var container = data.GetProperty("folder").GetProperty(fieldName);
        var results = container.GetProperty("results").EnumerateArray().Select(r => r.Clone()).ToList();
        var cursor = container.GetProperty("pagination").TryGetProperty("cursor", out var cursorProp)
            ? cursorProp.GetString()
            : null;
        return (results, cursor);
    }
}
