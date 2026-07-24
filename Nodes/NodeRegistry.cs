namespace DxFlow.Web.Nodes;

/// <summary>
/// Collects every node type definition — port of <c>backend/nodes/__init__.py</c>.
/// Each node lives in its own static property so you can open one file section
/// and see everything about that node type without hunting through controllers.
/// </summary>
public static class NodeRegistry
{
    public static readonly IReadOnlyList<string> SectionOrder =
        ["Navigation", "Output", "Tools", "Other"];

    public static IReadOnlyList<(string SectionName, IReadOnlyList<(string Key, NodeTypeDefinition Node)> Nodes)> GroupedNodeTypes()
    {
        var bySection = new Dictionary<string, List<(string, NodeTypeDefinition)>>();
        foreach (var node in Registry)
        {
            if (!bySection.TryGetValue(node.Category, out var list))
            {
                list = [];
                bySection[node.Category] = list;
            }

            list.Add((node.Key, node));
        }

        var sectionNames = SectionOrder.Where(bySection.ContainsKey).ToList();
        sectionNames.AddRange(bySection.Keys.Where(k => !SectionOrder.Contains(k)));

        return sectionNames
            .Select(name => ((string SectionName, IReadOnlyList<(string Key, NodeTypeDefinition Node)> Nodes))(name, bySection[name]))
            .ToList();
    }

    // --- Navigation ---------------------------------------------------------

    public static NodeTypeDefinition Hubs { get; } = new()
    {
        Key = "hubs",
        Name = "Hubs",
        Icon = "⬢",
        Description = "Autodesk hubs",
        Accent = "success",
        HasInput = false,
        HasOutput = true,
        Category = "Navigation",
        GraphqlQueryText = """
            # List hubs the current user has access to
            query GetHubs {
              hubs {
                results {
                  name
                  id
                  region
                }
              }
            }
            """,
    };

    public static NodeTypeDefinition Projects { get; } = new()
    {
        Key = "projects",
        Name = "Projects",
        Icon = "◆",
        Description = "Projects for selected hubs",
        Accent = "teal",
        HasInput = true,
        HasOutput = true,
        Category = "Navigation",
        AllowedSourceTypes = ["hubs"],
        GraphqlQueryText = """
            # List projects for a hub
            query GetProjects($hubId: ID!) {
              projects(hubId: $hubId) {
                results {
                  id
                  name
                }
              }
            }

            Variables:
            {
              "hubId": "<put_hub_id_here>"
            }

            Headers:
            {
              "Region": "<put_the_hub_region_here>"
            }
            """,
    };

    public static NodeTypeDefinition Folders { get; } = new()
    {
        Key = "folders",
        Name = "Folders",
        Icon = "▤",
        Description = "Folders and Subfolders",
        Accent = "magenta",
        HasInput = true,
        HasOutput = true,
        Category = "Navigation",
        AllowedSourceTypes = ["projects", "folders", "filter"],
        GraphqlQueryText = """
            # List subfolders of a folder (or resolve Project Files first)
            query GetFolderContent($folderId: ID!) { ... }
            """,
    };

    public static NodeTypeDefinition Items { get; } = new()
    {
        Key = "items",
        Name = "Items",
        Icon = "▥",
        Description = "Items in Folders",
        Accent = "slate",
        HasInput = true,
        HasOutput = true,
        Category = "Navigation",
        AllowedSourceTypes = ["projects", "folders", "filter"],
    };

    public static NodeTypeDefinition Exchanges { get; } = new()
    {
        Key = "exchanges",
        Name = "Exchanges",
        Icon = "▧",
        Description = "Exchanges in Folders",
        Accent = "gold",
        HasInput = true,
        HasOutput = true,
        Category = "Navigation",
        AllowedSourceTypes = ["projects", "folders", "filter"],
    };

    // --- Tools --------------------------------------------------------------

    public static NodeTypeDefinition ExchangeData { get; } = new()
    {
        Key = "process",
        Name = "Get Exchange Data",
        Icon = "⚙",
        Description = "Quantity takeoff: every element and property in an Exchange",
        Accent = "primary",
        HasInput = true,
        HasOutput = true,
        Category = "Tools",
        DefaultFields = new Dictionary<string, string> { ["filterQuery"] = "" },
        AllowedSourceTypes = ["exchanges"],
    };

    public static NodeTypeDefinition CreateExchange { get; } = new()
    {
        Key = "logic",
        Name = "Create Exchange",
        Icon = "◇",
        Description = "Create an Exchange from a view, in a folder",
        Accent = "warning",
        HasInput = true,
        HasOutput = true,
        Category = "Tools",
        AllowedSourceTypesByPort = new Dictionary<int, List<string>>
        {
            [0] = ["get_views"],
            [1] = ["folders"],
        },
    };

    public static NodeTypeDefinition GetViews { get; } = new()
    {
        Key = "get_views",
        Name = "Get Views",
        Icon = "#",
        Description = "Get Views of the given Item",
        Accent = "gold",
        HasInput = true,
        HasOutput = true,
        Category = "Tools",
        AllowedSourceTypes = ["items"],
    };

    public static NodeTypeDefinition Filter { get; } = new()
    {
        Key = "filter",
        Name = "Filter",
        Icon = "▽",
        Description = "Keep only elements whose name contains the given text",
        Accent = "primary",
        HasInput = true,
        HasOutput = true,
        DefaultFields = new Dictionary<string, string> { ["filterText"] = "" },
        AllowedSourceTypes = ["hubs", "projects", "folders", "items", "exchanges", "get_views"],
    };

    // --- Output -------------------------------------------------------------

    public static NodeTypeDefinition DebugOutput { get; } = new()
    {
        Key = "output",
        Name = "Debug Output",
        Icon = "⇤",
        Description = "Data sink",
        Accent = "tertiary",
        HasInput = true,
        HasOutput = false,
        Category = "Output",
    };

    public static NodeTypeDefinition ViewerOutput { get; } = new()
    {
        Key = "data",
        Name = "Viewer Output",
        Icon = "⬡",
        Description = "View the item or exchange in Viewer",
        Accent = "info",
        HasInput = true,
        HasOutput = false,
        Category = "Output",
        AllowedSourceTypes = ["exchanges", "items"],
    };

    public static NodeTypeDefinition CsvOutput { get; } = new()
    {
        Key = "csv_output",
        Name = "CSV Output",
        Icon = "▦",
        Description = "Download input table(s) as CSV",
        Accent = "teal",
        HasInput = true,
        HasOutput = false,
        Category = "Output",
        DefaultFields = new Dictionary<string, string> { ["filepath"] = "" },
    };

    public static NodeTypeDefinition ExcelOutput { get; } = new()
    {
        Key = "excel_output",
        Name = "Excel Output",
        Icon = "▩",
        Description = "Download input table(s) as Excel",
        Accent = "success",
        HasInput = true,
        HasOutput = false,
        Category = "Output",
        DefaultFields = new Dictionary<string, string> { ["filepath"] = "" },
    };

    // Registry must be declared after all node properties — static fields initialize
    // in source order, so referencing Hubs/Projects/etc. above would leave them null.
    private static readonly NodeTypeDefinition[] Registry =
    [
        Hubs,
        Projects,
        Folders,
        Items,
        Exchanges,
        ExchangeData,
        DebugOutput,
        CreateExchange,
        ViewerOutput,
        GetViews,
        Filter,
        CsvOutput,
        ExcelOutput,
    ];

    public static IReadOnlyDictionary<string, NodeTypeDefinition> NodeTypes { get; } =
        Registry.ToDictionary(n => n.Key, StringComparer.Ordinal);
}
