using System.Text.Json.Serialization;

namespace DxFlow.Web.Models;

/// <summary>
/// One saved flow on disk — same JSON shape as the Python sample's
/// <c>flow_service.save_flow()</c> records.
/// </summary>
public sealed class FlowRecord
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("flow")]
    public required FlowGraph Flow { get; set; }

    [JsonPropertyName("created_at")]
    public string? CreatedAt { get; set; }

    [JsonPropertyName("updated_at")]
    public string? UpdatedAt { get; set; }
}

public sealed class FlowGraph
{
    [JsonPropertyName("nodes")]
    public List<FlowNode> Nodes { get; set; } = [];

    [JsonPropertyName("connections")]
    public List<FlowConnection> Connections { get; set; } = [];
}

/// <summary>
/// One node on the canvas — extra fields (selectedIds, filterText, …) are
/// node-type-specific and preserved as loose JSON properties.
/// </summary>
public sealed class FlowNode
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("type")]
    public required string Type { get; set; }

    [JsonPropertyName("x")]
    public double X { get; set; }

    [JsonPropertyName("y")]
    public double Y { get; set; }

    [JsonExtensionData]
    public Dictionary<string, object?> Extra { get; set; } = new();
}

public sealed class FlowConnection
{
    [JsonPropertyName("from")]
    public required string From { get; set; }

    [JsonPropertyName("to")]
    public required string To { get; set; }

    [JsonPropertyName("fromPortIndex")]
    public int FromPortIndex { get; set; }

    [JsonPropertyName("toPortIndex")]
    public int ToPortIndex { get; set; }
}

public sealed class FlowSummary
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("updated_at")]
    public string? UpdatedAt { get; set; }
}

public sealed class SaveFlowRequest
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("flow")]
    public FlowGraph? Flow { get; set; }
}

public sealed class ExportTablesRequest
{
    [JsonPropertyName("tables")]
    public List<ExportTable>? Tables { get; set; }

    [JsonPropertyName("filepath")]
    public string? Filepath { get; set; }

    [JsonPropertyName("nodeId")]
    public string? NodeId { get; set; }
}

public sealed class ExportTable
{
    [JsonPropertyName("name")]
    public string? Name { get; set; }

    [JsonPropertyName("columns")]
    public List<string> Columns { get; set; } = [];

    [JsonPropertyName("rows")]
    public List<List<object?>> Rows { get; set; } = [];
}
