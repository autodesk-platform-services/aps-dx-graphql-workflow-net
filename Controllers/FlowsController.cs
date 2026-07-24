using DxFlow.Web.Filters;
using DxFlow.Web.Models;
using DxFlow.Web.Services;
using Microsoft.AspNetCore.Mvc;

namespace DxFlow.Web.Controllers;

/// <summary>
/// Flow CRUD and script export — port of <c>flow_routes.py</c>.
/// </summary>
[ApiController]
[Route("api/flows")]
[RequireAuthFilter]
public sealed class FlowsController : ControllerBase
{
    private readonly FlowService _flowService;

    public FlowsController(FlowService flowService)
    {
        _flowService = flowService;
    }

    [HttpGet("")]
    public IActionResult List() => Ok(_flowService.ListFlows());

    [HttpPost("")]
    public IActionResult Create([FromBody] SaveFlowRequest request)
    {
        var record = _flowService.SaveFlow(request.Name, request.Flow);
        return Created(string.Empty, record);
    }

    [HttpGet("{flowId}")]
    public IActionResult Get(string flowId)
    {
        var record = _flowService.LoadFlow(flowId);
        return record is null ? NotFound(new { error = "not_found" }) : Ok(record);
    }

    [HttpPut("{flowId}")]
    public IActionResult Update(string flowId, [FromBody] SaveFlowRequest request)
    {
        var record = _flowService.SaveFlow(request.Name, request.Flow, flowId);
        return Ok(record);
    }

    [HttpDelete("{flowId}")]
    public IActionResult Delete(string flowId)
    {
        _flowService.DeleteFlow(flowId);
        return NoContent();
    }

    /// <summary>
    /// Toolbar "Export as C# code" — generates a standalone script from the
    /// canvas state (does not require the flow to be saved first).
    /// </summary>
    [HttpPost("export-script")]
    public IActionResult ExportScript([FromBody] SaveFlowRequest request)
    {
        var name = request.Name ?? "flow";
        var flow = request.Flow ?? new FlowGraph();
        var filename = FlowCodegenService.FilenameFor(name);
        var script = FlowCodegenService.GenerateScript(flow, name, filename);
        return File(System.Text.Encoding.UTF8.GetBytes(script), "text/x-csharp", filename);
    }
}
