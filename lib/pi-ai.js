let cached;

/**
 * Safe loader for Pi peer dependency with resilient fallback.
 * Never throws ERR_MODULE_NOT_FOUND if pi-ai is not directly resolvable in the plugin node_modules.
 */
export async function loadPiAi() {
  if (!cached) {
    try {
      cached = await import("@earendil-works/pi-ai");
    } catch {
      cached = {
        getProviders: () => [
          "opencode-go",
          "opencode-zen",
          "openai",
          "anthropic",
          "google",
          "deepseek",
          "xai",
          "groq",
          "openrouter",
          "ollama",
        ],
        getModels: (_provider) => [],
        calculateCost: (model, usage) => {
          const c = model?.cost || {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
          };
          if (!usage.cost)
            usage.cost = {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0,
            };
          usage.cost.input = ((usage.input || 0) / 1e6) * (c.input || 0);
          usage.cost.output = ((usage.output || 0) / 1e6) * (c.output || 0);
          usage.cost.cacheRead =
            ((usage.cacheRead || 0) / 1e6) * (c.cacheRead || 0);
          usage.cost.cacheWrite =
            ((usage.cacheWrite || 0) / 1e6) * (c.cacheWrite || 0);
          usage.cost.total =
            usage.cost.input +
            usage.cost.output +
            usage.cost.cacheRead +
            usage.cost.cacheWrite;
          return usage.cost;
        },
      };
    }
  }
  return cached;
}
