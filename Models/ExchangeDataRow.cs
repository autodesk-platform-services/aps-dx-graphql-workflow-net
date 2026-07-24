using System.Text.Json.Serialization;

namespace DxFlow.Web.Models;

/// <summary>
/// One flattened row from FilterUsingComplexQuery — matches the Python sample's
/// <c>_rows_from_elements</c> dict and <c>exchangeDataNode.js</c> ROW_FIELDS.
/// </summary>
public sealed class ExchangeDataRow
{
    [JsonPropertyName("exchangeName")]
    public string? ExchangeName { get; init; }

    [JsonPropertyName("elementId")]
    public string? ElementId { get; init; }

    [JsonPropertyName("category")]
    public string? Category { get; init; }

    [JsonPropertyName("elementName")]
    public string? ElementName { get; init; }

    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("keyProperty")]
    public string? KeyProperty { get; init; }

    [JsonPropertyName("value")]
    public string? Value { get; init; }
}
