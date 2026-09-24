// Provider/model discovery helpers.
import { PROVIDERS } from "./presets.js";
import { getPiAuth } from "./pi-auth.js";

export const getConnectedPiProviders = () => {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const auth = getPiAuth();
  const providers = new Set();

  // 1. Providers from auth.json
  for (const [p, val] of Object.entries(auth)) {
    const token = val?.key || val?.access || val?.token || "";
    if (token) providers.add(p);
  }

  // 2. Providers configured in models.json
  try {
    const modelsPath = path.join(agentDir, "models.json");
    if (fs.existsSync(modelsPath)) {
      const data = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
      if (data?.providers) {
        for (const [p, val] of Object.entries(data.providers)) {
          if (
            val?.apiKey ||
            val?.baseUrl ||
            (Array.isArray(val?.models) && val.models.length > 0)
          ) {
            providers.add(p);
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  // 3. Free zenfree provider (if pi-zen-fallback installed or in settings.json)
  try {
    const settingsPath = path.join(agentDir, "settings.json");
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      if (
        Array.isArray(data?.packages) &&
        data.packages.some(
          (pkg) =>
            typeof pkg === "string" &&
            (pkg.includes("zen-fallback") || pkg.includes("zenfree")),
        )
      ) {
        providers.add("zenfree");
      }
    }
  } catch {
    // Ignore
  }

  // 4. Providers with active environment variables
  const envMap = {
    "opencode-go": ["OC_GO_CC_API_KEY", "OPENCODE_API_KEY"],
    "opencode-zen": ["OPENCODE_API_KEY", "ZEN_API_KEY", "OC_GO_CC_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GEMINI_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    xai: ["XAI_API_KEY"],
    "zai-coding-cn": ["ZAI_API_KEY"],
    moonshotai: ["MOONSHOT_API_KEY"],
    "kimi-coding": ["KIMI_API_KEY"],
    groq: ["GROQ_API_KEY"],
  };

  for (const [p, vars] of Object.entries(envMap)) {
    if (vars.some((v) => !!process.env[v])) {
      providers.add(p);
    }
  }

  if (providers.size === 0) {
    providers.add("openrouter");
    providers.add("opencode-go");
  }

  return Array.from(providers);
};

export const getModelsForProvider = (provider, ctx) => {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const models = new Set();

  // 1. From models-store.json (cached catalogues)
  try {
    const storePath = path.join(agentDir, "models-store.json");
    if (fs.existsSync(storePath)) {
      const data = JSON.parse(fs.readFileSync(storePath, "utf8"));
      if (Array.isArray(data[provider]?.models)) {
        for (const m of data[provider].models) {
          const id = typeof m === "string" ? m : m?.id;
          if (id) models.add(id);
        }
      }
    }
  } catch {
    // Ignore
  }

  // 2. From models.json
  try {
    const modelsPath = path.join(agentDir, "models.json");
    if (fs.existsSync(modelsPath)) {
      const data = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
      if (Array.isArray(data.providers?.[provider]?.models)) {
        for (const m of data.providers[provider].models) {
          const id = typeof m === "string" ? m : m?.id;
          if (id) models.add(id);
        }
      }
    }
  } catch {
    // Ignore
  }

  // 3. From ctx.modelRegistry for this specific provider
  if (ctx?.modelRegistry) {
    try {
      if (typeof ctx.modelRegistry.getModels === "function") {
        const list = ctx.modelRegistry.getModels(provider);
        if (Array.isArray(list)) {
          for (const m of list) {
            const id = typeof m === "string" ? m : m?.id;
            if (id) models.add(id);
          }
        }
      } else if (typeof ctx.modelRegistry.getAll === "function") {
        const list = ctx.modelRegistry.getAll();
        if (Array.isArray(list)) {
          for (const m of list) {
            if (m?.provider === provider) {
              const id = typeof m === "string" ? m : m?.id;
              if (id) models.add(id);
            }
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // 4. Default fallbacks if no models found in store
  if (models.size === 0) {
    if (provider === "zenfree")
      return [
        "deepseek-v4-flash-free",
        "hy3-free",
        "nemotron-3.5-lightning-free",
        "laguna-s-2.1-free",
        "mimo-v2.5-free",
        "nemotron-3-ultra-free",
        "big-pickle",
      ];
    if (provider === "opencode-go")
      return [
        "glm-5.3",
        "kimi-k3",
        "qwen3.8-max",
        "deepseek-v4-pro",
        "deepseek-v4-flash",
      ];
    if (provider === "opencode-zen")
      return ["grok-4.6", "gpt-5.6-luna", "kimi-k3", "deepseek-v4-pro"];
    if (provider === "zai-coding-cn")
      return ["glm-5.2", "glm-5.1", "glm-5-turbo", "glm-4.7", "glm-4.6v"];
    if (provider === "kimi-coding")
      return ["k3", "k3-256k", "kimi-for-coding", "kimi-for-coding-highspeed"];
    if (provider === "moonshotai")
      return [
        "kimi-k2-thinking",
        "kimi-k2-thinking-turbo",
        "kimi-k2-0905-preview",
      ];
    if (provider === "openai") return ["gpt-5.6-sol", "gpt-5.6-luna"];
    if (provider === "xai") return ["grok-4.6", "grok-4.5"];
    if (provider === "google") return ["gemini-2.5-flash", "gemini-3.7-flash"];
    if (provider === "anthropic")
      return ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1"];
  }

  return Array.from(models);
};

export const getProviderBaseUrl = (provider) => {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  try {
    const modelsPath = path.join(agentDir, "models.json");
    if (fs.existsSync(modelsPath)) {
      const data = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
      if (data.providers?.[provider]?.baseUrl) {
        return data.providers[provider].baseUrl;
      }
    }
  } catch {
    // Ignore
  }
  return PROVIDERS[provider]?.baseUrl || "";
};
