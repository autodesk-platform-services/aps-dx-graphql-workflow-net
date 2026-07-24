namespace DxFlow.Web.Configuration;

/// <summary>
/// Binds APS credentials from the flat keys used by aps-medm-explorer
/// (<c>APS_CLIENT_ID</c>, <c>APS_CLIENT_SECRET</c>, <c>APS_CALLBACK_URL</c>),
/// with fallback to the nested <c>Aps</c> section and Dokku-style env vars.
/// </summary>
public static class ApsConfigurationExtensions
{
    public const string ClientIdKey = "APS_CLIENT_ID";
    public const string ClientSecretKey = "APS_CLIENT_SECRET";
    public const string CallbackUrlKey = "APS_CALLBACK_URL";

    public static IServiceCollection AddDxFlowConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<ApsOptions>(options => BindApsOptions(configuration, options));
        services.Configure<FlowStorageOptions>(configuration.GetSection(FlowStorageOptions.SectionName));
        services.Configure<AppSettingsOptions>(configuration.GetSection(AppSettingsOptions.SectionName));
        return services;
    }

    public static ApsOptions GetApsOptions(IConfiguration configuration)
    {
        var options = configuration.GetSection(ApsOptions.SectionName).Get<ApsOptions>() ?? new ApsOptions();
        BindApsOptions(configuration, options);
        return options;
    }

    private static void BindApsOptions(IConfiguration configuration, ApsOptions options)
    {
        configuration.GetSection(ApsOptions.SectionName).Bind(options);

        var clientId = configuration[ClientIdKey];
        var clientSecret = configuration[ClientSecretKey];
        var callbackUrl = configuration[CallbackUrlKey];

        if (!string.IsNullOrWhiteSpace(clientId))
        {
            options.ClientId = clientId;
        }

        if (!string.IsNullOrWhiteSpace(clientSecret))
        {
            options.ClientSecret = clientSecret;
        }

        if (!string.IsNullOrWhiteSpace(callbackUrl))
        {
            options.RedirectUri = callbackUrl;
        }
    }
}
