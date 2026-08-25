/**
 * Model IDs checked 2026-08-24 against:
 * - OpenCode Go: GET https://opencode.ai/zen/go/v1/models
 * - OpenCode Zen: GET https://opencode.ai/zen/v1/models
 * - OpenAI API: https://developers.openai.com/api/docs/models (gpt-5.6-sol / luna)
 * - xAI: https://docs.x.ai/developers/quickstart (grok-4.6)
 */

export const PROVIDERS = {
  "opencode-go": {
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKeyEnv: "OC_GO_CC_API_KEY",
  },
  "opencode-zen": {
    baseUrl: "https://opencode.ai/zen/v1",
    apiKeyEnv: "OPENCODE_API_KEY",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    apiKeyEnv: "XAI_API_KEY",
  },
};

function all(model) {
  return {
    jobs: model,
    woz: model,
    ive: model,
    karpathy: model,
    mastnacek: model,
    synthesis: model,
  };
}

export const PRESETS = {
  glmRada: {
    mode: "standard",
    provider: "opencode-go",
    catalog: "OpenCode Go",
    defaultModels: all("glm-5.3"),
  },
  quality: {
    mode: "standard",
    provider: "opencode-zen",
    catalog: "OpenCode Zen",
    defaultModels: {
      jobs: "grok-4.6",
      woz: "kimi-k3",
      ive: "gpt-5.6-luna",
      karpathy: "gpt-5.6-luna",
      mastnacek: "kimi-k3",
      synthesis: "grok-4.6",
    },
  },
  highQuality: {
    mode: "standard",
    provider: "opencode-go",
    catalog: "OpenCode Go",
    defaultModels: {
      jobs: "kimi-k3",
      woz: "qwen3.8-max",
      ive: "kimi-k3",
      karpathy: "qwen3.8-max",
      mastnacek: "kimi-k3",
      synthesis: "kimi-k3",
    },
  },
  balanced: {
    mode: "standard",
    provider: "opencode-go",
    catalog: "OpenCode Go",
    defaultModels: {
      jobs: "kimi-k3",
      woz: "deepseek-v4-pro",
      ive: "glm-5.3",
      karpathy: "deepseek-v4-pro",
      mastnacek: "glm-5.3",
      synthesis: "kimi-k3",
    },
  },
};

export const OPENAI_DEFAULT_MODELS = all("gpt-5.6-sol");

export function applyPreset(config, preset) {
  const defaults = PROVIDERS[preset.provider];
  config.configured = true;
  config.mode = preset.mode;
  config.provider = preset.provider;
  if (!config.providers) config.providers = {};
  const existing = config.providers[preset.provider] || {};
  config.providers[preset.provider] = {
    ...existing,
    baseUrl: defaults.baseUrl,
    apiKeyEnv: existing.apiKeyEnv || defaults.apiKeyEnv,
    defaultModels: { ...preset.defaultModels },
  };
  return config;
}

export function customFallbackModels(provider) {
  if (provider === "openai") return { ...OPENAI_DEFAULT_MODELS };
  if (provider === "opencode-zen") return { ...PRESETS.quality.defaultModels };
  if (provider === "xai") return all("grok-4.6");
  return { ...PRESETS.balanced.defaultModels };
}
