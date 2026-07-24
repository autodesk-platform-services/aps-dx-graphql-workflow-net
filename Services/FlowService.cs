using System.Text.Json;
using DxFlow.Web.Configuration;
using DxFlow.Web.Models;
using Microsoft.Extensions.Options;

namespace DxFlow.Web.Services;

/// <summary>
/// Saves and loads flow graphs as one JSON file per flow — port of
/// <c>backend/services/flow_service.py</c>.
/// </summary>
public sealed class FlowService
{
    private readonly string _flowsDirectory;
    private readonly ILogger<FlowService> _logger;

    public FlowService(IWebHostEnvironment environment, IOptions<FlowStorageOptions> options, ILogger<FlowService> logger)
    {
        _logger = logger;
        var configured = options.Value.FlowsDirectory;
        _flowsDirectory = Path.IsPathRooted(configured)
            ? configured
            : Path.GetFullPath(Path.Combine(environment.ContentRootPath, configured));
        Directory.CreateDirectory(_flowsDirectory);
    }

    /// <summary>
    /// Sanitizes a flow id before using it in a filename — prevents path traversal.
    /// </summary>
    private static string SafeFlowId(string flowId) =>
        new string(flowId.Where(ch => char.IsLetterOrDigit(ch) || ch is '_' or '-').ToArray());

    private string PathFor(string flowId) =>
        Path.Combine(_flowsDirectory, $"{SafeFlowId(flowId)}.json");

    public IReadOnlyList<FlowSummary> ListFlows()
    {
        var flows = new List<FlowSummary>();
        foreach (var file in Directory.GetFiles(_flowsDirectory, "*.json").OrderBy(f => f))
        {
            try
            {
                var record = JsonSerializer.Deserialize<FlowRecord>(File.ReadAllText(file));
                if (record is null)
                {
                    continue;
                }

                flows.Add(new FlowSummary
                {
                    Id = record.Id,
                    Name = record.Name,
                    UpdatedAt = record.UpdatedAt,
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Skipping unreadable flow file {File}", file);
            }
        }

        return flows;
    }

    public FlowRecord? LoadFlow(string flowId)
    {
        var path = PathFor(flowId);
        if (!File.Exists(path))
        {
            return null;
        }

        return JsonSerializer.Deserialize<FlowRecord>(File.ReadAllText(path));
    }

    public FlowRecord SaveFlow(string? name, FlowGraph? flow, string? flowId = null)
    {
        flowId ??= Guid.NewGuid().ToString("N")[..12];
        var now = DateTime.UtcNow.ToString("o");
        var existing = LoadFlow(flowId);

        var record = new FlowRecord
        {
            Id = flowId,
            Name = name ?? existing?.Name ?? flowId,
            Flow = flow ?? new FlowGraph(),
            CreatedAt = existing?.CreatedAt ?? now,
            UpdatedAt = now,
        };

        File.WriteAllText(PathFor(flowId), JsonSerializer.Serialize(record, new JsonSerializerOptions { WriteIndented = true }));
        return record;
    }

    public void DeleteFlow(string flowId)
    {
        var path = PathFor(flowId);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}
