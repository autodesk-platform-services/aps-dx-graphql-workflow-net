using System.Text.Json;
using DxFlow.Web.Constants;
using DxFlow.Web.Models;
using DxFlow.Web.Nodes;
using Microsoft.AspNetCore.Mvc;

namespace DxFlow.Web.Controllers;

/// <summary>
/// Serves the landing page and flow editor — port of <c>main_routes.py</c>.
/// </summary>
public sealed class HomeController : Controller
{
    [HttpGet("/")]
    public IActionResult Index()
    {
        if (string.IsNullOrEmpty(HttpContext.Session.GetString(SessionKeys.AccessToken)))
        {
            return View("Landing");
        }

        var nodeTypesJson = JsonSerializer.Serialize(
            NodeRegistry.NodeTypes,
            new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower });

        var model = new EditorViewModel
        {
            UserName = HttpContext.Session.GetString(SessionKeys.UserName),
            NodeTypesJson = nodeTypesJson,
            NodeSections = NodeRegistry.GroupedNodeTypes(),
        };

        return View("Index", model);
    }
}

public sealed class EditorViewModel
{
    public string? UserName { get; init; }
    public required string NodeTypesJson { get; init; }
    public required IReadOnlyList<(string SectionName, IReadOnlyList<(string Key, NodeTypeDefinition Node)> Nodes)> NodeSections { get; init; }
}
