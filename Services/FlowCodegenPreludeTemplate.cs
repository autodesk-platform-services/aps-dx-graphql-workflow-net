namespace DxFlow.Web.Services;

/// <summary>
/// Standalone-script prelude injected by <see cref="FlowCodegenService"/> —
/// port of the Python sample's <c>flow_codegen.PRELUDE</c>.
/// </summary>
internal static class FlowCodegenPreludeTemplate
{
    internal const string Body = """
        // Auto-generated from the Data Exchange Workflow Bench flow "__FLOW_NAME__".
        // Re-runs the same API pipeline headlessly as a standalone C# program.
        //
        // Setup:
        //   dotnet new console -o flow-run && cd flow-run
        //   dotnet add package ClosedXML
        //   copy __SCRIPT_FILENAME__ Program.cs
        //   export APS_ACCESS_TOKEN=<a 3-legged token with data:read scope>
        //   Tip: while logged into the bench, GET /api/dx/viewer-token returns your session token.
        //   dotnet run
        //
        using System.Globalization;
        using System.Net.Http.Headers;
        using System.Text;
        using System.Text.Json;
        using System.Text.Json.Nodes;
        using ClosedXML.Excel;

        var accessToken = Environment.GetEnvironmentVariable("APS_ACCESS_TOKEN");
        if (string.IsNullOrEmpty(accessToken))
        {
            Console.Error.WriteLine("Set APS_ACCESS_TOKEN before running this script.");
            return;
        }

        using var http = new HttpClient();
        const string GraphqlUrl = "https://developer.api.autodesk.com/dataexchange/2023-05/graphql";
        const string DataManagementItemUrl = "https://developer.api.autodesk.com/data/v1/projects/{0}/items/{1}";
        const string ModelDerivativeMetadataUrl = "https://developer.api.autodesk.com/modelderivative/v2/designdata/{0}/metadata";
        const string TopLevelFolderName = "Project Files";
        const int PageLimit = 200;

        async Task<JsonElement> GraphqlAsync(string query, object? variables = null, string region = "")
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, GraphqlUrl);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Headers.TryAddWithoutValidation("Region", region);
            request.Content = new StringContent(
                JsonSerializer.Serialize(new { query, variables = variables ?? new { } }),
                Encoding.UTF8,
                "application/json");
            using var response = await http.SendAsync(request);
            response.EnsureSuccessStatusCode();
            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var root = doc.RootElement;
            if (root.TryGetProperty("errors", out var errors) &&
                (!root.TryGetProperty("data", out var data) || data.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined))
            {
                throw new InvalidOperationException(errors.ToString());
            }

            return root.GetProperty("data").Clone();
        }

        async Task<JsonElement> RestGetAsync(string url)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            using var response = await http.SendAsync(request);
            response.EnsureSuccessStatusCode();
            using var doc = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            return doc.RootElement.Clone();
        }

        static JsonObject ToObject(JsonElement element) => JsonNode.Parse(element.GetRawText())!.AsObject();

        static List<JsonObject> ToObjectList(JsonElement array) =>
            array.ValueKind == JsonValueKind.Array
                ? array.EnumerateArray().Select(ToObject).ToList()
                : [];

        const string GetHubsQuery = @"__GET_HUBS_QUERY__";
        const string GetProjectsQuery = @"__GET_PROJECTS_QUERY__";
        const string GetProjectFoldersQuery = @"__GET_PROJECT_FOLDERS_QUERY__";
        const string GetFolderFoldersQuery = @"__GET_FOLDER_FOLDERS_QUERY__";
        const string GetFolderItemsQuery = @"__GET_FOLDER_ITEMS_QUERY__";
        const string GetFolderExchangesQuery = @"__GET_FOLDER_EXCHANGES_QUERY__";
        const string CreateExchangeMutation = @"__CREATE_EXCHANGE_MUTATION__";
        const string GetExchangeElementsQuery = @"__GET_EXCHANGE_ELEMENTS_QUERY__";

        async Task<List<JsonObject>> GetHubsAsync()
        {
            var data = await GraphqlAsync(GetHubsQuery);
            return ToObjectList(data.GetProperty("hubs").GetProperty("results"));
        }

        async Task<List<JsonObject>> GetProjectsAsync(List<JsonObject> hubs)
        {
            var results = new List<JsonObject>();
            foreach (var hub in hubs)
            {
                var hubId = hub["id"]?.GetValue<string>();
                if (string.IsNullOrEmpty(hubId)) continue;
                var region = hub["region"]?.GetValue<string>() ?? "";
                var data = await GraphqlAsync(GetProjectsQuery, new { hubId }, region);
                foreach (var project in ToObjectList(data.GetProperty("projects").GetProperty("results")))
                {
                    project["region"] = region;
                    project["kind"] = "project";
                    results.Add(project);
                }
            }

            return results;
        }

        async Task<string?> FindProjectFilesFolderIdAsync(string projectId, string region)
        {
            var data = await GraphqlAsync(GetProjectFoldersQuery, new { projectId }, region);
            foreach (var folder in ToObjectList(data.GetProperty("project").GetProperty("folders").GetProperty("results")))
            {
                if (folder["name"]?.GetValue<string>() == TopLevelFolderName)
                {
                    return folder["id"]?.GetValue<string>();
                }
            }

            return null;
        }

        async Task<(string? FolderId, string Region)> ResolveFolderIdAsync(JsonObject item)
        {
            var region = item["region"]?.GetValue<string>() ?? "";
            var itemId = item["id"]?.GetValue<string>();
            if (string.IsNullOrEmpty(itemId)) return (null, region);
            if (item["kind"]?.GetValue<string>() == "folder") return (itemId, region);
            var folderId = await FindProjectFilesFolderIdAsync(itemId, region);
            return (folderId, region);
        }

        static (List<JsonObject> Results, string? Cursor) ExtractPaginated(JsonElement data, string fieldName)
        {
            var container = data.GetProperty("folder").GetProperty(fieldName);
            var results = ToObjectList(container.GetProperty("results"));
            var cursor = container.GetProperty("pagination").TryGetProperty("cursor", out var cursorProp)
                ? cursorProp.GetString()
                : null;
            return (results, cursor);
        }

        async Task<List<JsonObject>> AggregateFolderContentsAsync(
            List<JsonObject> itemsPayload,
            string query,
            Func<JsonElement, (List<JsonObject> Results, string? Cursor)> extractResults,
            string? resultKind)
        {
            var aggregated = new List<JsonObject>();
            foreach (var item in itemsPayload)
            {
                var (folderId, region) = await ResolveFolderIdAsync(item);
                if (string.IsNullOrEmpty(folderId)) continue;

                string? cursor = null;
                while (true)
                {
                    var pagination = new Dictionary<string, object> { ["limit"] = PageLimit };
                    if (!string.IsNullOrEmpty(cursor)) pagination["cursor"] = cursor;
                    var data = await GraphqlAsync(query, new { folderId, pagination }, region);
                    var (results, nextCursor) = extractResults(data);
                    foreach (var result in results)
                    {
                        if (resultKind is not null)
                        {
                            result["region"] = region;
                            result["kind"] = resultKind;
                        }

                        aggregated.Add(result);
                    }

                    if (string.IsNullOrEmpty(nextCursor) || results.Count < PageLimit) break;
                    cursor = nextCursor;
                }
            }

            return aggregated;
        }

        Task<List<JsonObject>> GetFoldersAsync(List<JsonObject> items) =>
            AggregateFolderContentsAsync(items, GetFolderFoldersQuery, data => ExtractPaginated(data, "folders"), "folder");

        Task<List<JsonObject>> GetItemsAsync(List<JsonObject> items) =>
            AggregateFolderContentsAsync(items, GetFolderItemsQuery, data => ExtractPaginated(data, "items"), null);

        Task<List<JsonObject>> GetExchangesAsync(List<JsonObject> items) =>
            AggregateFolderContentsAsync(items, GetFolderExchangesQuery, data => ExtractPaginated(data, "exchanges"), "exchange");

        static List<JsonObject> FilterSelected(List<JsonObject> items, string[] selectedIds)
        {
            var selected = selectedIds.ToHashSet(StringComparer.Ordinal);
            return items.Where(item => item["id"]?.GetValue<string>() is string id && selected.Contains(id)).ToList();
        }

        static List<JsonObject> FilterByName(List<JsonObject> elements, string needle)
        {
            needle = (needle ?? "").Trim().ToLowerInvariant();
            if (needle.Length == 0) return elements;
            return elements.Where(el => (el["name"]?.GetValue<string>() ?? "").ToLowerInvariant().Contains(needle)).ToList();
        }

        static (string ProjectId, string ItemId) DecodeItemId(string encodedItemId)
        {
            var padded = encodedItemId + new string('=', (-encodedItemId.Length % 4 + 4) % 4);
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
            var parts = decoded.Split('~');
            if (parts.Length < 5) throw new InvalidOperationException($"Unexpected decoded item id shape: {decoded}");
            return (parts[2], parts[^1]);
        }

        static (string? Urn, string? ManifestLink) FindDerivativeInfo(JsonElement itemPayload, string tipVersionId)
        {
            if (!itemPayload.TryGetProperty("included", out var included)) return (null, null);
            foreach (var entry in included.EnumerateArray())
            {
                if (entry.GetProperty("type").GetString() != "versions") continue;
                if (entry.GetProperty("id").GetString() != tipVersionId) continue;
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

        // Data Management's "derivatives" relationship carries a manifest link already
        // scoped to wherever the derivative lives - for EMEA/AUS-hosted projects that's
        // "/v2/regions/{region}/designdata/{urn}/manifest", not the global
        // "/v2/designdata/{urn}/manifest" path, which 401s for those. Prefer rewriting
        // this link over the hardcoded template whenever it's available.
        static string BuildMetadataUrl(string derivativeUrn, string? manifestLink)
        {
            var manifestPath = manifestLink?.Split('?')[0];
            if (!string.IsNullOrEmpty(manifestPath) && manifestPath.EndsWith("/manifest", StringComparison.Ordinal))
            {
                return manifestPath[..^"/manifest".Length] + "/metadata";
            }

            return string.Format(CultureInfo.InvariantCulture, ModelDerivativeMetadataUrl, derivativeUrn);
        }

        async Task<List<JsonObject>> GetViewsForItemsAsync(List<JsonObject> items)
        {
            var results = new List<JsonObject>();
            foreach (var item in items)
            {
                var itemId = item["id"]?.GetValue<string>();
                if (string.IsNullOrEmpty(itemId)) continue;
                try
                {
                    var (projectId, plainItemId) = DecodeItemId(itemId);
                    var itemPayload = await RestGetAsync(string.Format(CultureInfo.InvariantCulture, DataManagementItemUrl, projectId, plainItemId));
                    var tipVersionId = itemPayload.GetProperty("data").GetProperty("relationships").GetProperty("tip").GetProperty("data").GetProperty("id").GetString();
                    if (string.IsNullOrEmpty(tipVersionId)) continue;
                    var (derivativeUrn, manifestLink) = FindDerivativeInfo(itemPayload, tipVersionId);
                    if (string.IsNullOrEmpty(derivativeUrn)) continue;
                    var metadata = await RestGetAsync(BuildMetadataUrl(derivativeUrn, manifestLink));
                    foreach (var view in metadata.GetProperty("data").GetProperty("metadata").EnumerateArray())
                    {
                        results.Add(new JsonObject
                        {
                            ["id"] = view.GetProperty("guid").GetString(),
                            ["name"] = view.GetProperty("name").GetString(),
                            ["derivative_urn"] = derivativeUrn,
                            ["itemId"] = itemId,
                        });
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Warning: get views failed for item {itemId}: {ex.Message}");
                }
            }

            return results;
        }

        async Task<List<JsonElement>> FetchExchangeElementsAsync(string exchangeId, string region, string filterQuery)
        {
            var results = new List<JsonElement>();
            string? cursor = null;
            while (true)
            {
                var pagination = new Dictionary<string, object> { ["limit"] = PageLimit };
                if (!string.IsNullOrEmpty(cursor)) pagination["cursor"] = cursor;
                var variables = new
                {
                    exchangeId,
                    elementFilter = new { query = filterQuery ?? string.Empty },
                    elementPagination = pagination,
                };
                var data = await GraphqlAsync(GetExchangeElementsQuery, variables, region);
                if (!data.TryGetProperty("exchange", out var exchange) ||
                    exchange.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
                    !exchange.TryGetProperty("elements", out var elementsContainer))
                {
                    break;
                }

                if (!elementsContainer.TryGetProperty("results", out var page) || page.ValueKind is not JsonValueKind.Array) break;
                results.AddRange(page.EnumerateArray().Select(e => e.Clone()));
                cursor = elementsContainer.TryGetProperty("pagination", out var paginationNode) &&
                         paginationNode.TryGetProperty("cursor", out var cursorProp)
                    ? cursorProp.GetString()
                    : null;
                if (string.IsNullOrEmpty(cursor) || page.GetArrayLength() < PageLimit) break;
            }

            return results;
        }

        static string? JsonElementToString(JsonElement element) =>
            element.ValueKind switch
            {
                JsonValueKind.String => element.GetString(),
                JsonValueKind.Number => element.GetRawText(),
                JsonValueKind.True => "true",
                JsonValueKind.False => "false",
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                _ => element.GetRawText(),
            };

        static List<JsonObject> GetPropertyResults(JsonElement element)
        {
            if (!element.TryGetProperty("properties", out var properties) ||
                properties.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return [];
            if (!properties.TryGetProperty("results", out var results) || results.ValueKind is not JsonValueKind.Array) return [];
            return ToObjectList(results);
        }

        static string? FindPropertyValue(List<JsonObject> properties, string name)
        {
            foreach (var prop in properties)
            {
                if (string.Equals(prop["name"]?.GetValue<string>(), name, StringComparison.OrdinalIgnoreCase))
                {
                    return prop["value"]?.ToString();
                }
            }

            return null;
        }

        static List<JsonObject> RowsFromElements(IReadOnlyList<JsonElement> elements, string? exchangeName)
        {
            var rows = new List<JsonObject>();
            foreach (var element in elements)
            {
                var propertyList = GetPropertyResults(element);
                var category = FindPropertyValue(propertyList, "category");
                var typeValue = FindPropertyValue(propertyList, "type");
                foreach (var prop in propertyList)
                {
                    rows.Add(new JsonObject
                    {
                        ["exchangeName"] = exchangeName,
                        ["elementId"] = element.TryGetProperty("id", out var idProp) ? idProp.GetString() : null,
                        ["category"] = category,
                        ["elementName"] = element.TryGetProperty("name", out var nameProp) ? nameProp.GetString() : null,
                        ["type"] = typeValue,
                        ["keyProperty"] = prop["name"]?.GetValue<string>(),
                        ["value"] = prop["value"]?.ToString(),
                    });
                }
            }

            return rows;
        }

        async Task<List<JsonObject>> GetExchangeDataAsync(List<JsonObject> exchanges, string filterQuery)
        {
            var rows = new List<JsonObject>();
            foreach (var exchange in exchanges)
            {
                var exchangeId = exchange["id"]?.GetValue<string>();
                if (string.IsNullOrEmpty(exchangeId)) continue;
                var region = exchange["region"]?.GetValue<string>() ?? "";
                try
                {
                    var elements = await FetchExchangeElementsAsync(exchangeId, region, filterQuery);
                    rows.AddRange(RowsFromElements(elements, exchange["name"]?.GetValue<string>()));
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Warning: exchange data failed for {exchangeId}: {ex.Message}");
                }
            }

            return rows;
        }

        async Task<List<JsonObject>> CreateExchangesAsync(List<JsonObject> views, List<JsonObject> folders)
        {
            var folder = folders.FirstOrDefault();
            if (folder?["id"]?.GetValue<string>() is not string folderId)
            {
                return [new JsonObject { ["error"] = "A destination folder is required" }];
            }

            var region = folder["region"]?.GetValue<string>() ?? "";
            var results = new List<JsonObject>();
            foreach (var view in views)
            {
                var itemId = view["itemId"]?.GetValue<string>();
                var viewName = view["name"]?.GetValue<string>();
                if (string.IsNullOrEmpty(itemId) || string.IsNullOrEmpty(viewName)) continue;
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
                    var data = await GraphqlAsync(CreateExchangeMutation, variables, region);
                    results.Add(ToObject(data));
                }
                catch (Exception ex)
                {
                    results.Add(new JsonObject { ["error"] = ex.Message });
                }
            }

            return results;
        }

        static string FormatDateOnly(string? iso) => string.IsNullOrEmpty(iso) ? "" : iso.Split('T')[0];

        static string StringifyCell(object? value) =>
            value switch
            {
                null => "",
                JsonNode node => node.ToJsonString(),
                _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "",
            };

        static List<string> ExportColumns(JsonObject element)
        {
            if (element.ContainsKey("tipVersion")) return ["Name", "Version", "Created"];
            if (element.ContainsKey("alternativeIdentifiers") || element.ContainsKey("version")) return ["Name", "Version", "Created"];
            if (element.ContainsKey("keyProperty"))
            {
                return ["Exchange Name", "Element ID", "Category", "Element Name", "Type", "Key Property", "Value"];
            }

            return ["Name"];
        }

        static List<string> ExportRow(JsonObject element)
        {
            if (element.ContainsKey("tipVersion"))
            {
                return [
                    element["name"]?.GetValue<string>() ?? "",
                    element["tipVersion"]?["versionNumber"]?.ToString() ?? "",
                    FormatDateOnly(element["tipVersion"]?["createdOn"]?.GetValue<string>()),
                ];
            }

            if (element.ContainsKey("alternativeIdentifiers") || element.ContainsKey("version"))
            {
                return [
                    element["name"]?.GetValue<string>() ?? "",
                    element["version"]?["versionNumber"]?.ToString() ?? "",
                    FormatDateOnly(element["version"]?["createdOn"]?.GetValue<string>()),
                ];
            }

            if (element.ContainsKey("keyProperty"))
            {
                return [
                    element["exchangeName"]?.GetValue<string>() ?? "",
                    element["elementId"]?.GetValue<string>() ?? "",
                    element["category"]?.GetValue<string>() ?? "",
                    element["elementName"]?.GetValue<string>() ?? "",
                    element["type"]?.GetValue<string>() ?? "",
                    element["keyProperty"]?.GetValue<string>() ?? "",
                    element["value"]?.GetValue<string>() ?? "",
                ];
            }

            return [element["name"]?.GetValue<string>() ?? ""];
        }

        static List<(string Name, List<string> Columns, List<List<string>> Rows)> BuildExportTables(List<List<JsonObject>> groups)
        {
            var buckets = new Dictionary<string, (string Name, List<string> Columns, List<List<string>> Rows)>(StringComparer.Ordinal);
            foreach (var group in groups)
            {
                foreach (var element in group)
                {
                    var columns = ExportColumns(element);
                    var signature = string.Join(' ', columns);
                    if (!buckets.TryGetValue(signature, out var table))
                    {
                        var shapeName = signature switch
                        {
                            "Name Version Created" => "items_exchanges",
                            "Exchange Name Element ID Category Element Name Type Key Property Value" => "exchange_elements",
                            _ => "table",
                        };
                        table = (shapeName, columns, []);
                        buckets[signature] = table;
                    }

                    table.Rows.Add(ExportRow(element).Select(StringifyCell).ToList());
                    buckets[signature] = table;
                }
            }

            return buckets.Values.ToList();
        }

        static string SafeFilenamePart(string? text)
        {
            var cleaned = new string((text ?? "").Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-').ToArray());
            return string.IsNullOrEmpty(cleaned) ? "export" : cleaned;
        }

        static string ResolveExportPath(string? filepath, string nodeId, string extension)
        {
            var scriptDir = AppContext.BaseDirectory;
            var outputDir = Path.Combine(scriptDir, "output");
            string path;
            if (!string.IsNullOrWhiteSpace(filepath))
            {
                path = Path.IsPathRooted(filepath) ? filepath : Path.Combine(scriptDir, filepath);
            }
            else
            {
                Directory.CreateDirectory(outputDir);
                path = Path.Combine(outputDir, $"{SafeFilenamePart(nodeId)}{extension}");
            }

            if (!path.EndsWith(extension, StringComparison.OrdinalIgnoreCase)) path += extension;
            Directory.CreateDirectory(Path.GetDirectoryName(path) ?? scriptDir);
            return path;
        }

        static string InsertSuffix(string path, string suffix)
        {
            var stem = Path.GetFileNameWithoutExtension(path);
            var ext = Path.GetExtension(path);
            return $"{stem}_{SafeFilenamePart(suffix)}{ext}";
        }

        static string EscapeCsvCell(string value)
        {
            if (value.Contains('"') || value.Contains(',') || value.Contains('\n'))
            {
                return $"\"{value.Replace("\"", "\"\"")}\"";
            }

            return value;
        }

        static List<string> WriteCsvTables(List<(string Name, List<string> Columns, List<List<string>> Rows)> tables, string? filepath, string nodeId)
        {
            if (tables.Count == 0) return [];
            var basePath = ResolveExportPath(filepath, nodeId, ".csv");
            var paths = new List<string>();
            foreach (var table in tables)
            {
                var path = tables.Count == 1 ? basePath : InsertSuffix(basePath, table.Name);
                using var writer = new StreamWriter(path, false, Encoding.UTF8);
                writer.WriteLine(string.Join(",", table.Columns.Select(EscapeCsvCell)));
                foreach (var row in table.Rows)
                {
                    writer.WriteLine(string.Join(",", row.Select(EscapeCsvCell)));
                }

                paths.Add(path);
            }

            return paths;
        }

        static string? WriteExcelTables(List<(string Name, List<string> Columns, List<List<string>> Rows)> tables, string? filepath, string nodeId)
        {
            if (tables.Count == 0) return null;
            var path = ResolveExportPath(filepath, nodeId, ".xlsx");
            using var workbook = new XLWorkbook();
            var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var table in tables)
            {
                var sheetName = table.Name;
                sheetName = new string(sheetName.Where(ch => !"[]:*?/\\".Contains(ch)).ToArray());
                sheetName = sheetName.Length > 31 ? sheetName[..31] : sheetName;
                if (string.IsNullOrWhiteSpace(sheetName)) sheetName = "Sheet";
                var candidate = sheetName;
                var index = 2;
                while (usedNames.Contains(candidate))
                {
                    candidate = $"{sheetName[..Math.Min(sheetName.Length, 28)]}_{index}";
                    index++;
                }

                usedNames.Add(candidate);
                var sheet = workbook.Worksheets.Add(candidate);
                for (var col = 0; col < table.Columns.Count; col++) sheet.Cell(1, col + 1).Value = table.Columns[col];
                for (var rowIndex = 0; rowIndex < table.Rows.Count; rowIndex++)
                {
                    var row = table.Rows[rowIndex];
                    for (var col = 0; col < row.Count; col++) sheet.Cell(rowIndex + 2, col + 1).Value = row[col];
                }
            }

            workbook.SaveAs(path);
            return path;
        }

        """;

    internal static string InjectQueries(string prelude) =>
        prelude
            .Replace("__GET_HUBS_QUERY__", DxQueries.GetHubs.Trim(), StringComparison.Ordinal)
            .Replace("__GET_PROJECTS_QUERY__", DxQueries.GetProjects.Trim(), StringComparison.Ordinal)
            .Replace("__GET_PROJECT_FOLDERS_QUERY__", DxQueries.GetProjectFolders.Trim(), StringComparison.Ordinal)
            .Replace("__GET_FOLDER_FOLDERS_QUERY__", DxQueries.GetFolderFolders.Trim(), StringComparison.Ordinal)
            .Replace("__GET_FOLDER_ITEMS_QUERY__", DxQueries.GetFolderItems.Trim(), StringComparison.Ordinal)
            .Replace("__GET_FOLDER_EXCHANGES_QUERY__", DxQueries.GetFolderExchanges.Trim(), StringComparison.Ordinal)
            .Replace("__CREATE_EXCHANGE_MUTATION__", DxQueries.CreateExchange.Trim(), StringComparison.Ordinal)
            .Replace("__GET_EXCHANGE_ELEMENTS_QUERY__", DxQueries.GetExchangeElements.Trim(), StringComparison.Ordinal);
}
