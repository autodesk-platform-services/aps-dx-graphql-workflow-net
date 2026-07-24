using System.Text.Json;
using DxFlow.Web.Constants;
using DxFlow.Web.Filters;
using DxFlow.Web.Models;
using DxFlow.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace DxFlow.Web.Controllers;

/// <summary>
/// Data Exchange API routes — port of <c>dx_routes.py</c>.
/// Each action maps 1:1 to a frontend node handler under <c>wwwroot/js/nodes/</c>.
/// </summary>
[ApiController]
[Route("api/dx")]
[RequireAuthFilter]
public sealed class DxController : ControllerBase
{
    private readonly DxApiService _dxApiService;

    public DxController(DxApiService dxApiService)
    {
        _dxApiService = dxApiService;
    }

    private string AccessToken => HttpContext.Session.GetString(SessionKeys.AccessToken)!;

    [HttpGet("viewer-token")]
    public IActionResult ViewerToken()
    {
        return Ok(new
        {
            access_token = AccessToken,
            expires_in = HttpContext.Session.GetInt32(SessionKeys.ExpiresIn) ?? 3600,
        });
    }

    [HttpGet("hubs")]
    public async Task<IActionResult> Hubs(CancellationToken cancellationToken)
    {
        try
        {
            var results = await _dxApiService.GetHubsAsync(AccessToken, cancellationToken);
            return Ok(results);
        }
        catch (Exception ex)
        {
            return StatusCode(502, new { error = ex.Message });
        }
    }

    [HttpPost("projects")]
    public async Task<IActionResult> Projects(CancellationToken cancellationToken)
    {
        var hubs = await ReadJsonArrayAsync("hubs", cancellationToken);
        var results = await _dxApiService.GetProjectsAsync(hubs, AccessToken, cancellationToken);
        return Ok(results);
    }

    [HttpPost("folders")]
    public async Task<IActionResult> Folders(CancellationToken cancellationToken)
    {
        var projects = await ReadJsonArrayAsync("projects", cancellationToken);
        var results = await _dxApiService.GetFoldersAsync(projects, AccessToken, cancellationToken);
        return Ok(results);
    }

    [HttpPost("items")]
    public async Task<IActionResult> Items(CancellationToken cancellationToken)
    {
        var projects = await ReadJsonArrayAsync("projects", cancellationToken);
        var results = await _dxApiService.GetItemsAsync(projects, AccessToken, cancellationToken);
        return Ok(results);
    }

    [HttpPost("exchanges")]
    public async Task<IActionResult> Exchanges(CancellationToken cancellationToken)
    {
        var projects = await ReadJsonArrayAsync("projects", cancellationToken);
        var results = await _dxApiService.GetExchangesAsync(projects, AccessToken, cancellationToken);
        return Ok(results);
    }

    [HttpPost("views")]
    public async Task<IActionResult> Views(CancellationToken cancellationToken)
    {
        var projects = await ReadJsonArrayAsync("projects", cancellationToken);
        var results = await _dxApiService.GetViewsAsync(projects, AccessToken, cancellationToken);
        return Ok(results);
    }

    [HttpPost("create-exchange")]
    public async Task<IActionResult> CreateExchange(CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(Request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;

        var views = root.TryGetProperty("views", out var viewsProp)
            ? viewsProp.EnumerateArray().Select(v => v.Clone()).ToList()
            : [];

        JsonElement? folder = root.TryGetProperty("folders", out var foldersProp) &&
                              foldersProp.GetArrayLength() > 0
            ? foldersProp[0].Clone()
            : null;

        try
        {
            var results = await _dxApiService.CreateExchangesAsync(views, folder, AccessToken, cancellationToken);
            return Ok(results);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("exchange-data")]
    public async Task<IActionResult> ExchangeData(CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(Request.Body, cancellationToken: cancellationToken);
        var root = document.RootElement;

        var filter = root.TryGetProperty("filter", out var filterProp)
            ? filterProp.GetString()?.Trim() ?? string.Empty
            : string.Empty;

        var exchanges = root.TryGetProperty("exchanges", out var exchangesProp)
            ? exchangesProp.EnumerateArray().Select(e => e.Clone()).ToList()
            : [];

        try
        {
            var rows = await _dxApiService.GetExchangeDataAsync(exchanges, filter, AccessToken, cancellationToken);
            return Ok(rows);
        }
        catch (InvalidOperationException ex)
        {
            return StatusCode(502, new { error = ex.Message });
        }
    }

    [HttpPost("export/csv")]
    public async Task<IActionResult> ExportCsv(CancellationToken cancellationToken)
    {
        return await ExportAsync(ExportService.BuildCsvDownload, cancellationToken);
    }

    [HttpPost("export/excel")]
    public async Task<IActionResult> ExportExcel(CancellationToken cancellationToken)
    {
        return await ExportAsync(ExportService.BuildExcelDownload, cancellationToken);
    }

    private async Task<IActionResult> ExportAsync(
        Func<IReadOnlyList<ExportTable>, string?, string, (byte[] Body, string Filename, string MimeType)> builder,
        CancellationToken cancellationToken)
    {
        var request = await Request.ReadFromJsonAsync<ExportTablesRequest>(cancellationToken);
        var tables = request?.Tables ?? [];
        if (tables.Count == 0)
        {
            return BadRequest(new { error = "no_rows" });
        }

        try
        {
            var (body, filename, mimeType) = builder(tables, request?.Filepath, request?.NodeId ?? "export");
            return File(body, mimeType, filename);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private async Task<List<JsonElement>> ReadJsonArrayAsync(string propertyName, CancellationToken cancellationToken)
    {
        using var document = await JsonDocument.ParseAsync(Request.Body, cancellationToken: cancellationToken);
        if (!document.RootElement.TryGetProperty(propertyName, out var array))
        {
            return [];
        }

        return array.EnumerateArray().Select(item => item.Clone()).ToList();
    }
}
