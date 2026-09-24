// Configuration access and the deliberator factory.
import { ApiClient } from "./api.js";
import { apiKeyEnvName, loadConfig } from "./config.js";
import { Deliberator } from "./deliberation.js";
import { getPiAuth } from "./pi-auth.js";
import { PROVIDERS } from "./presets.js";

export const getLocalConfig = (cwd) => loadConfig(undefined, cwd);

export const getDeliberator = () => {
  const config = getLocalConfig();
  const provider = config.provider || "opencode-go";
  const providerConfig = config.providers?.[provider] || {};

  let apiKey = config.apiKey || "";
  const auth = getPiAuth();
  if (auth[provider]) {
    apiKey =
      auth[provider].key ||
      auth[provider].access ||
      auth[provider].token ||
      apiKey;
  }

  const apiClient = new ApiClient({
    provider: provider,
    baseUrl: providerConfig?.baseUrl || PROVIDERS[provider]?.baseUrl,
    apiKeyEnvVar: apiKeyEnvName(providerConfig),
    apiKey: apiKey,
  });

  return new Deliberator({ apiClient, config });
};
