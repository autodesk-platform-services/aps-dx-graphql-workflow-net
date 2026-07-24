namespace DxFlow.Web.Configuration;

/// <summary>
/// Where saved flow JSON files live on disk — mirrors <c>Config.FLOWS_DIR</c>
/// in the Python sample (<c>backend/services/flow_service.py</c>).
/// </summary>
public sealed class FlowStorageOptions
{
    public const string SectionName = "FlowStorage";

    /// <summary>
    /// Directory path (absolute or relative to the web project's content root).
    /// Default points at <c>data/flows</c> so presets ship with the repo.
    /// </summary>
    public string FlowsDirectory { get; set; } = "data/flows";
}
