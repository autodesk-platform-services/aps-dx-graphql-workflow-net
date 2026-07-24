namespace DxFlow.Web.Configuration;

/// <summary>
/// Shared app URL settings — same shape as
/// <a href="https://github.com/autodesk-platform-services/aps-medm-explorer">aps-medm-explorer</a>.
/// </summary>
public sealed class AppSettingsOptions
{
    public const string SectionName = "AppSettings";

    public string AppUrl { get; set; } = "http://localhost:8080";
}
