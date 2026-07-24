using System.Text.Json.Serialization;

namespace DxFlow.Web.Nodes;

/// <summary>
/// Canonical metadata for one node type — port of the Python <c>NodeType</c>
/// dataclass in <c>backend/nodes/base.py</c>.
///
/// Serialized to snake_case JSON and injected into the page as
/// <c>#node-types-data</c> so the frontend palette and connection rules
/// stay in sync with the server.
/// </summary>
public sealed class NodeTypeDefinition
{
    [JsonPropertyName("key")]
    public required string Key { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("icon")]
    public required string Icon { get; init; }

    [JsonPropertyName("description")]
    public required string Description { get; init; }

    [JsonPropertyName("accent")]
    public required string Accent { get; init; }

    [JsonPropertyName("has_input")]
    public required bool HasInput { get; init; }

    [JsonPropertyName("has_output")]
    public required bool HasOutput { get; init; }

    [JsonPropertyName("category")]
    public string Category { get; init; } = "Other";

    [JsonPropertyName("default_fields")]
    public Dictionary<string, string> DefaultFields { get; init; } = new();

    [JsonPropertyName("graphql_query_text")]
    public string GraphqlQueryText { get; init; } = string.Empty;

    [JsonPropertyName("allowed_source_types")]
    public List<string> AllowedSourceTypes { get; init; } = [];

    [JsonPropertyName("allowed_source_types_by_port")]
    public Dictionary<int, List<string>> AllowedSourceTypesByPort { get; init; } = new();
}
