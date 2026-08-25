/**
 * Model IDs checked 2026-08-24.
 * Known base URLs and environment variables for providers.
 */

export const PROVIDERS = {
  'opencode-go': {
    baseUrl: 'https://opencode.ai/zen/go/v1',
    apiKeyEnv: 'OC_GO_CC_API_KEY',
  },
  'opencode-zen': {
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKeyEnv: 'OPENCODE_API_KEY',
  },
  zenfree: {
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKeyEnv: 'OPENCODE_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
  'zai-coding-cn': {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'ZAI_API_KEY',
  },
  moonshotai: {
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
  },
  'kimi-coding': {
    baseUrl: 'https://api.kimi.com/coding/v1',
    apiKeyEnv: 'KIMI_API_KEY',
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKeyEnv: 'OLLAMA_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  xai: {
    baseUrl: 'https://api.x.ai/v1',
    apiKeyEnv: 'XAI_API_KEY',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
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
    mode: 'standard',
    provider: 'opencode-go',
    catalog: 'OpenCode Go',
    defaultModels: all('glm-5.3'),
  },
  zenFree: {
    mode: 'standard',
    provider: 'zenfree',
    catalog: 'OpenCode Zen (Free)',
    defaultModels: {
      jobs: 'deepseek-v4-flash-free',
      woz: 'hy3-free',
      ive: 'nemotron-3.5-lightning-free',
      karpathy: 'nemotron-3-ultra-free',
      mastnacek: 'laguna-s-2.1-free',
      synthesis: 'deepseek-v4-flash-free',
    },
  },
  quality: {
    mode: 'standard',
    provider: 'opencode-zen',
    catalog: 'OpenCode Zen',
    defaultModels: {
      jobs: 'grok-4.6',
      woz: 'kimi-k3',
      ive: 'gpt-5.6-luna',
      karpathy: 'gpt-5.6-luna',
      mastnacek: 'kimi-k3',
      synthesis: 'grok-4.6',
    },
  },
  highQuality: {
    mode: 'standard',
    provider: 'opencode-go',
    catalog: 'OpenCode Go',
    defaultModels: {
      jobs: 'kimi-k3',
      woz: 'qwen3.8-max',
      ive: 'kimi-k3',
      karpathy: 'qwen3.8-max',
      mastnacek: 'kimi-k3',
      synthesis: 'kimi-k3',
    },
  },
  balanced: {
    mode: 'standard',
    provider: 'opencode-go',
    catalog: 'OpenCode Go',
    defaultModels: {
      jobs: 'kimi-k3',
      woz: 'deepseek-v4-pro',
      ive: 'glm-5.3',
      karpathy: 'deepseek-v4-pro',
      mastnacek: 'glm-5.3',
      synthesis: 'kimi-k3',
    },
  },
};

export const OPENAI_DEFAULT_MODELS = all('gpt-5.6-sol');

export function applyPreset(config, preset) {
  const defaults = PROVIDERS[preset.provider] || { baseUrl: '', apiKeyEnv: '' };
  config.configured = true;
  config.mode = preset.mode;
  config.provider = preset.provider;
  if (!config.providers) config.providers = {};
  const existing = config.providers[preset.provider] || {};
  config.providers[preset.provider] = {
    ...existing,
    baseUrl: defaults.baseUrl || existing.baseUrl || '',
    apiKeyEnv: existing.apiKeyEnv || defaults.apiKeyEnv || '',
    defaultModels: { ...preset.defaultModels },
  };
  return config;
}

export function customFallbackModels(provider) {
  if (provider === 'openai') return { ...OPENAI_DEFAULT_MODELS };
  if (provider === 'opencode-zen') return { ...PRESETS.quality.defaultModels };
  if (provider === 'zenfree') return { ...PRESETS.zenFree.defaultModels };
  if (provider === 'xai') return all('grok-4.6');
  if (provider === 'openrouter') {
    return {
      jobs: 'anthropic/claude-sonnet-4.5',
      woz: 'deepseek/deepseek-chat',
      ive: 'openai/gpt-5.6',
      karpathy: 'google/gemini-2.5-flash',
      mastnacek: 'deepseek/deepseek-chat',
      synthesis: 'anthropic/claude-sonnet-4.5',
    };
  }
  if (provider === 'zai-coding-cn') {
    return all('glm-5.2');
  }
  if (provider === 'kimi-coding') {
    return all('k3');
  }
  if (provider === 'moonshotai') {
    return all('kimi-k2-thinking');
  }
  if (provider === 'google') {
    return all('gemini-2.5-flash');
  }
  if (provider === 'anthropic') {
    return all('claude-sonnet-4-5');
  }
  return { ...PRESETS.balanced.defaultModels };
}
