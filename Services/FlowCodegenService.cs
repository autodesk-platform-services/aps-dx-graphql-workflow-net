using System.Text;
using System.Text.Json;
using DxFlow.Web.Models;
using DxFlow.Web.Nodes;

namespace DxFlow.Web.Services;

/// <summary>
/// Generates a standalone C# script that re-runs a flow outside the browser —
/// the .NET counterpart of <c>backend/services/flow_codegen.py</c>.
/// </summary>
public static class FlowCodegenService
{
    private static readonly HashSet<string> SupportedTypes =
    [
        "hubs", "projects", "folders", "items", "exchanges", "output",
        "get_views", "logic", "process", "filter", "data",
        "csv_output", "excel_output",
    ];

    private static readonly HashSet<string> ProjectFedTypes =
        ["projects", "folders", "items", "exchanges", "get_views"];

    private static readonly HashSet<string> FilterSkipFetchTypes =
        ["folders", "items", "exchanges"];

    public static string FilenameFor(string? name)
    {
        var slug = new string((name ?? "flow")
            .Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-')
            .ToArray());
        slug = string.IsNullOrWhiteSpace(slug) ? "flow" : slug;
        return $"{slug}.cs";
    }

    public static string GenerateScript(FlowGraph flow, string name = "flow", string? filename = null)
    {
        filename ??= FilenameFor(name);
        var nodes = (flow.Nodes ?? []).ToDictionary(n => n.Id, n => n);
        var connections = flow.Connections ?? [];

        var supported = nodes
            .Where(kvp => SupportedTypes.Contains(kvp.Value.Type))
            .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        var order = TopologicalOrder(supported.Keys, connections);
        var (port0In, port1In) = IncomingConnections(connections, supported.Keys);

        var varOf = new Dictionary<string, string>();
        var lines = new List<string>();

        foreach (var nodeId in order)
        {
            var node = supported[nodeId];
            var nodeType = node.Type;
            var varName = nodeId.Replace("-", "_", StringComparison.Ordinal);
            var assigned = false;

            port0In.TryGetValue(nodeId, out var upstreamP0);
            upstreamP0 ??= [];
            port1In.TryGetValue(nodeId, out var upstreamP1);

            var upstreamLabels = upstreamP0
                .Select(sourceId => $"{NodeRegistry.NodeTypes.GetValueOrDefault(supported[sourceId].Type)?.Name ?? supported[sourceId].Type} ({sourceId})")
                .ToList();
            if (upstreamP1 is not null && nodeType == "logic")
            {
                upstreamLabels.Add($"{NodeRegistry.NodeTypes.GetValueOrDefault(supported[upstreamP1].Type)?.Name ?? supported[upstreamP1].Type} ({upstreamP1}) on port 1");
            }

            lines.Add(HeaderLine(nodeType, nodeId, upstreamLabels));

            switch (nodeType)
            {
                case "hubs":
                    lines.Add($"List<JsonObject> {varName} = FilterSelected(await GetHubsAsync(), {SerializeStringArray(GetSelectedIds(node))});");
                    assigned = true;
                    break;
                case "output":
                    var upstreamVar = upstreamP0.Count > 0 ? varOf.GetValueOrDefault(upstreamP0[0]) : null;
                    lines.Add(upstreamVar is not null
                        ? $"Console.WriteLine(JsonSerializer.Serialize({upstreamVar}, new JsonSerializerOptions {{ WriteIndented = true }}));"
                        : "Console.WriteLine(\"No value\");");
                    break;
                case "filter":
                    lines.Add($"List<JsonObject> {varName} = FilterByName({MergeListsExpr(upstreamP0, varOf)}, {JsonSerializer.Serialize(GetFilterText(node))});");
                    assigned = true;
                    break;
                case "process":
                    lines.Add($"List<JsonObject> {varName} = await GetExchangeDataAsync({MergeListsExpr(upstreamP0, varOf)}, {JsonSerializer.Serialize(GetFilterQuery(node))});");
                    lines.Add($"Console.WriteLine($\"Get Exchange Data: {{{varName}.Count}} rows\");");
                    assigned = true;
                    break;
                case "logic":
                    lines.Add($"List<JsonObject> {varName} = await CreateExchangesAsync({MergeListsExpr(upstreamP0, varOf)}, {MergeListsExpr(upstreamP1 is not null ? [upstreamP1] : [], varOf)});");
                    lines.Add($"Console.WriteLine(JsonSerializer.Serialize({varName}, new JsonSerializerOptions {{ WriteIndented = true }}));");
                    assigned = true;
                    break;
                case "data":
                    lines.Add("// Viewer Output is browser-only — headless replay prints connected data instead.");
                    lines.Add($"Console.WriteLine(JsonSerializer.Serialize({MergeListsExpr(upstreamP0, varOf)}, new JsonSerializerOptions {{ WriteIndented = true }}));");
                    varOf[nodeId] = MergeListsExpr(upstreamP0, varOf);
                    lines.Add(string.Empty);
                    continue;
                case "csv_output":
                {
                    var tablesVar = $"{varName}_tables";
                    lines.Add($"var {tablesVar} = BuildExportTables({ExportGroupsExpr(upstreamP0, varOf)});");
                    lines.Add($"var {varName}_paths = WriteCsvTables({tablesVar}, {JsonSerializer.Serialize(GetFilepath(node))}, {JsonSerializer.Serialize(nodeId)});");
                    lines.Add($"Console.WriteLine(\"CSV exported to \" + string.Join(\", \", {varName}_paths));");
                    lines.Add(string.Empty);
                    continue;
                }
                case "excel_output":
                {
                    var tablesVar = $"{varName}_tables";
                    lines.Add($"var {tablesVar} = BuildExportTables({ExportGroupsExpr(upstreamP0, varOf)});");
                    lines.Add($"var {varName}_path = WriteExcelTables({tablesVar}, {JsonSerializer.Serialize(GetFilepath(node))}, {JsonSerializer.Serialize(nodeId)});");
                    lines.Add($"Console.WriteLine(\"Excel exported to \" + {varName}_path);");
                    lines.Add(string.Empty);
                    continue;
                }
                default:
                    if (ProjectFedTypes.Contains(nodeType))
                    {
                        var sourceExpr = MergeListsExpr(upstreamP0, varOf);
                        var skipFetch = upstreamP0.Count == 1 &&
                                        supported.TryGetValue(upstreamP0[0], out var upstreamNode) &&
                                        upstreamNode.Type == "filter" &&
                                        FilterSkipFetchTypes.Contains(nodeType);

                        if (skipFetch)
                        {
                            lines.Add($"List<JsonObject> {varName} = FilterSelected({sourceExpr}, {SerializeStringArray(GetSelectedIds(node))});");
                            assigned = true;
                        }
                        else
                        {
                            var fetchFn = nodeType switch
                            {
                                "projects" => "GetProjectsAsync",
                                "folders" => "GetFoldersAsync",
                                "items" => "GetItemsAsync",
                                "exchanges" => "GetExchangesAsync",
                                "get_views" => "GetViewsForItemsAsync",
                                _ => "GetProjectsAsync",
                            };
                            lines.Add($"List<JsonObject> {varName} = FilterSelected(await {fetchFn}({sourceExpr}), {SerializeStringArray(GetSelectedIds(node))});");
                            assigned = true;
                        }
                    }
                    else
                    {
                        lines.Add($"// Unsupported node type in export: {nodeType}");
                    }

                    break;
            }

            if (assigned)
            {
                varOf[nodeId] = varName;
                lines.Add(string.Empty);
            }
        }

        var prelude = FlowCodegenPreludeTemplate.InjectQueries(FlowCodegenPreludeTemplate.Body
            .Replace("__FLOW_NAME__", name, StringComparison.Ordinal)
            .Replace("__SCRIPT_FILENAME__", filename, StringComparison.Ordinal));

        var body = string.Join(Environment.NewLine, lines);
        return prelude + Environment.NewLine + "// --- Flow ---" + Environment.NewLine +
               "await RunFlowAsync();" + Environment.NewLine +
               "async Task RunFlowAsync()" + Environment.NewLine + "{" + Environment.NewLine +
               body + Environment.NewLine + "}" + Environment.NewLine;
    }

    private static string HeaderLine(string nodeType, string nodeId, IReadOnlyList<string> upstreamLabels)
    {
        var label = NodeRegistry.NodeTypes.GetValueOrDefault(nodeType)?.Name ?? nodeType;
        var header = $"// --- {label} ({nodeId})";
        header += upstreamLabels.Count > 0
            ? ", fed by " + string.Join(", ", upstreamLabels)
            : nodeType == "hubs" ? " ---" : " - nothing connected ---";
        return header + " ---";
    }

    private static List<string> TopologicalOrder(IEnumerable<string> nodeIds, IReadOnlyList<FlowConnection> connections)
    {
        var idSet = nodeIds.ToHashSet();
        var incoming = idSet.ToDictionary(id => id, _ => 0);
        var outgoing = idSet.ToDictionary(id => id, _ => new List<string>());

        foreach (var conn in connections)
        {
            if (!idSet.Contains(conn.From) || !idSet.Contains(conn.To))
            {
                continue;
            }

            outgoing[conn.From].Add(conn.To);
            incoming[conn.To]++;
        }

        var ready = incoming.Where(kvp => kvp.Value == 0).Select(kvp => kvp.Key).ToList();
        var ordered = new List<string>();
        var seen = new HashSet<string>();

        while (ready.Count > 0)
        {
            var current = ready[0];
            ready.RemoveAt(0);
            if (!seen.Add(current))
            {
                continue;
            }

            ordered.Add(current);
            foreach (var next in outgoing[current])
            {
                incoming[next]--;
                if (incoming[next] == 0)
                {
                    ready.Add(next);
                }
            }
        }

        ordered.AddRange(idSet.Where(id => !seen.Contains(id)));
        return ordered;
    }

    private static (Dictionary<string, List<string>> Port0, Dictionary<string, string> Port1) IncomingConnections(
        IReadOnlyList<FlowConnection> connections,
        IEnumerable<string> supportedIds)
    {
        var supported = supportedIds.ToHashSet();
        var port0 = new Dictionary<string, List<string>>();
        var port1 = new Dictionary<string, string>();

        foreach (var conn in connections)
        {
            if (!supported.Contains(conn.To) || !supported.Contains(conn.From))
            {
                continue;
            }

            if (conn.ToPortIndex == 0)
            {
                if (!port0.TryGetValue(conn.To, out var list))
                {
                    list = [];
                    port0[conn.To] = list;
                }

                list.Add(conn.From);
            }
            else if (conn.ToPortIndex == 1)
            {
                port1[conn.To] = conn.From;
            }
        }

        return (port0, port1);
    }

    private static string MergeListsExpr(IReadOnlyList<string> sourceIds, IReadOnlyDictionary<string, string> varOf)
    {
        if (sourceIds.Count == 0)
        {
            return "new List<JsonObject>()";
        }

        if (sourceIds.Count == 1)
        {
            return varOf.GetValueOrDefault(sourceIds[0], "new List<JsonObject>()");
        }

        var expr = varOf.GetValueOrDefault(sourceIds[0], "new List<JsonObject>()");
        foreach (var sourceId in sourceIds.Skip(1))
        {
            expr = $"{expr}.Concat({varOf.GetValueOrDefault(sourceId, "new List<JsonObject>()")})";
        }

        return $"{expr}.ToList()";
    }

    private static string ExportGroupsExpr(IReadOnlyList<string> sourceIds, IReadOnlyDictionary<string, string> varOf)
    {
        if (sourceIds.Count == 0)
        {
            return "new List<List<JsonObject>> ()";
        }

        var groups = string.Join(", ", sourceIds.Select(id => varOf.GetValueOrDefault(id, "new List<JsonObject>()")));
        return $"new List<List<JsonObject>> {{ {groups} }}";
    }

    private static string[] GetSelectedIds(FlowNode node)
    {
        if (node.Extra.TryGetValue("selectedIds", out var value) && value is JsonElement element && element.ValueKind == JsonValueKind.Array)
        {
            return element.EnumerateArray()
                .Select(e => e.ValueKind == JsonValueKind.String ? e.GetString() ?? string.Empty : e.ToString())
                .Where(static s => s.Length > 0)
                .ToArray();
        }

        return [];
    }

    private static string SerializeStringArray(string[] values) =>
        values.Length == 0 ? "Array.Empty<string>()" : JsonSerializer.Serialize(values);

    private static string GetFilterText(FlowNode node) =>
        node.Extra.TryGetValue("filterText", out var value) ? value?.ToString() ?? string.Empty : string.Empty;

    private static string GetFilterQuery(FlowNode node) =>
        node.Extra.TryGetValue("filterQuery", out var value) ? value?.ToString() ?? string.Empty : string.Empty;

    private static string? GetFilepath(FlowNode node) =>
        node.Extra.TryGetValue("filepath", out var value) ? value?.ToString() : null;
}
