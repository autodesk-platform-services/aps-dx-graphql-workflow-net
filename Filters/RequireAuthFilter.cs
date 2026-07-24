using DxFlow.Web.Constants;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace DxFlow.Web.Filters;

/// <summary>
/// Gates <c>/api/dx/*</c> and <c>/api/flows/*</c> behind a signed-in session —
/// the ASP.NET equivalent of Flask's <c>@bp.before_request require_auth</c>
/// in <c>dx_routes.py</c> and <c>flow_routes.py</c>.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RequireAuthFilter : Attribute, IAuthorizationFilter
{
    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var accessToken = context.HttpContext.Session.GetString(SessionKeys.AccessToken);
        if (string.IsNullOrEmpty(accessToken))
        {
            context.Result = new JsonResult(new { error = "not_authenticated" }) { StatusCode = 401 };
        }
    }
}
