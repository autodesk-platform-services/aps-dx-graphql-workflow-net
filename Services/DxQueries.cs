namespace DxFlow.Web.Services;

/// <summary>
/// Raw GraphQL query/mutation strings sent to the APS Data Exchange API.
/// Port of <c>backend/services/dx_queries.py</c> — each constant maps 1:1
/// to a node type's server-side handler in <see cref="DxApiService"/>.
/// </summary>
public static class DxQueries
{
    public const string GetHubs = """
        query GetHubs {
          hubs {
            results {
              name
              id
              region
            }
          }
        }
        """;

    public const string GetProjects = """
        query GetProjects($hubId: ID!) {
          projects(hubId: $hubId) {
            results {
              id
              name
            }
          }
        }
        """;

    public const string GetProjectFolders = """
        query GetProjectFolders($projectId: ID!) {
          project(projectId: $projectId) {
            id
            name
            folders {
              results {
                id
                name
              }
            }
          }
        }
        """;

    public const string GetFolderFolders = """
        query GetFolderContent($folderId: ID!, $pagination: PaginationInput) {
          folder(folderId: $folderId) {
            folders(pagination: $pagination) {
              pagination {
                pageSize
                cursor
              }
              results {
                id
                name
                __typename
              }
            }
          }
        }
        """;

    public const string GetFolderItems = """
        query GetFolderContent($folderId: ID!, $pagination: PaginationInput) {
          folder(folderId: $folderId) {
            items(pagination: $pagination) {
              pagination {
                pageSize
                cursor
              }
              ... on Items {
                results {
                  id
                  name
                  extensionType
                  ... on BasicItem {
                    tipVersion {
                      id
                      versionNumber
                      createdOn
                    }
                  }
                }
              }
            }
          }
        }
        """;

    public const string GetFolderExchanges = """
        query GetFolderContent($folderId: ID!, $pagination: PaginationInput) {
          folder(folderId: $folderId) {
            exchanges(pagination: $pagination) {
              pagination {
                pageSize
                cursor
              }
              results {
                id
                name
                alternativeIdentifiers {
                  fileUrn
                  fileVersionUrn
                }
                version {
                  id
                  versionNumber
                  createdOn
                }
                __typename
              }
            }
          }
        }
        """;

    public const string CreateExchange = """
        mutation CreateExchange($input: CreateExchangeInput!) {
          createExchange(input: $input) {
            exchange {
              id
              name
            }
            error {
              exchangeId
              code
              message
            }
          }
        }
        """;

    public const string GetExchangeElements = """
        query FilterUsingComplexQuery($exchangeId: ID!, $elementFilter: ElementFilterInput, $elementPagination: PaginationInput) {
          exchange(exchangeId: $exchangeId) {
            id
            name
            elements(filter: $elementFilter, pagination: $elementPagination) {
              pagination {
                pageSize
                cursor
              }
              results {
                id
                name
                properties {
                  results {
                    name
                    value
                  }
                }
              }
            }
          }
        }
        """;
}
