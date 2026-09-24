// Interactive /apple-config wizard.
import { applyPreset, customFallbackModels, PRESETS, PROVIDERS } from "./presets.js";
import { apiKeyEnvName, loadConfig, saveConfig } from "./config.js";
import { harness } from "./harness-state.js";
import { getLocalConfig } from "./harness.js";
import { getPiAuth } from "./pi-auth.js";
import { getConnectedPiProviders, getModelsForProvider, getProviderBaseUrl } from "./providers.js";

export const configureHarness = async (ui, ctx, isGlobal = false) => {
  const targetUi = ui || harness.activeUi;
  if (!targetUi) return null;

  const choice = await targetUi.select(
    "Vyber konfiguraci pro Apple Advisory Board:",
    [
      "GLM-5.3 Apple Rada (Vše GLM-5.3 · OpenCode Go · Výchozí)",
      "ZenFree (OpenCode Zen modely zdarma · Bez API klíče)",
      "Quality / Frontier (Grok 4.6 + GPT 5.6 Luna + Kimi K3 · OpenCode Zen)",
      "OpenCode Go (High Quality: Kimi K3 + Qwen 3.8 Max)",
      "OpenCode Go (Balanced: Kimi K3 + DeepSeek V4 Pro + GLM-5.3)",
      "Vlastní konfigurace z Pi (Custom Configuration)",
    ],
  );

  const config = getLocalConfig(ctx.cwd);
  if (!config.providers) {
    config.providers = {};
  }

  if (choice?.startsWith("GLM-5.3")) {
    applyPreset(config, PRESETS.glmRada);
    targetUi.notify("GLM-5.3 Apple Rada preset nakonfigurován.", "info");
  } else if (choice?.startsWith("ZenFree")) {
    applyPreset(config, PRESETS.zenFree);
    targetUi.notify(
      "ZenFree (OpenCode Zen zdarma) preset nakonfigurován.",
      "info",
    );
  } else if (choice?.startsWith("Quality")) {
    applyPreset(config, PRESETS.quality);
    targetUi.notify(
      "Quality / Frontier (OpenCode Zen) preset nakonfigurován.",
      "info",
    );
  } else if (choice?.includes("High Quality")) {
    applyPreset(config, PRESETS.highQuality);
    targetUi.notify(
      "OpenCode Go (High Quality) preset nakonfigurován.",
      "info",
    );
  } else if (choice?.includes("Balanced")) {
    applyPreset(config, PRESETS.balanced);
    targetUi.notify("OpenCode Go (Balanced) preset nakonfigurován.", "info");
  } else if (choice) {
    // 1. First, select the provider from actually connected Pi providers
    const connectedList = getConnectedPiProviders();
    const customProviderOption = "[Zadat jiného providera...]";

    const providerChoices = connectedList.map((p) => ({
      id: p,
      label: p,
    }));

    const options = [
      ...providerChoices.map((c) => c.label),
      customProviderOption,
    ];

    const selectedLabel = await targetUi.select(
      "1. Vyber providera z tvého Pi:",
      options,
    );

    let provider = "";
    if (!selectedLabel || selectedLabel === customProviderOption) {
      provider = await targetUi.input(
        "Zadej id providera (např. openrouter, zai-coding-cn, opencode-go):",
        "openrouter",
      );
    } else {
      provider = selectedLabel;
    }

    config.provider = provider;
    config.configured = true;
    config.mode = "standard";

    // 2. Load models available under THIS selected provider
    const providerModels = getModelsForProvider(provider, ctx);
    const defaultBaseUrl = getProviderBaseUrl(provider);

    const auth = getPiAuth();
    const hasAuthToken = !!(
      auth[provider]?.key ||
      auth[provider]?.access ||
      auth[provider]?.token
    );
    let baseUrl = defaultBaseUrl;
    let apiKeyEnv =
      PROVIDERS[provider]?.apiKeyEnv ||
      provider.toUpperCase().replace(/-/g, "_") + "_API_KEY";

    const connectionChoice = await targetUi.select(
      `Nastavení připojení pro ${provider}:`,
      [
        `Použít automatické z Pi (URL: ${baseUrl || "Výchozí"}, Klíč: ${hasAuthToken ? "Uloženo v Pi" : "Env proměnná " + apiKeyEnv})`,
        "Zadat vlastní Base URL a Env proměnnou klíče",
      ],
    );

    if (connectionChoice?.startsWith("Zadat")) {
      baseUrl = await targetUi.input("API Base URL:", baseUrl);
      apiKeyEnv = await targetUi.input(
        "Název env proměnné pro API klíč:",
        apiKeyEnv,
      );
    }

    // 3. Configure each model role from the models available under the chosen provider
    const selectModelForRole = async (roleName, defaultModel) => {
      const modelOptions = (providerModels || [])
        .map((m) => (typeof m === "string" ? m : m?.id || String(m)))
        .filter(Boolean);

      const customOption = "[Zadat vlastní název modelu...]";

      if (modelOptions.length === 0) {
        return await targetUi.input(
          `Zadej název modelu pro ${roleName}:`,
          defaultModel || "",
        );
      }

      const uniqueOptions = Array.from(new Set(modelOptions));
      const selectOptions = [...uniqueOptions, customOption];

      const defaultChoice =
        defaultModel && uniqueOptions.includes(defaultModel)
          ? defaultModel
          : uniqueOptions[0];

      const selected = await targetUi.select(
        `Vyber model pro ${roleName} (${provider}):`,
        selectOptions,
      );

      if (!selected || selected === customOption) {
        return await targetUi.input(
          `Zadej název modelu pro ${roleName}:`,
          defaultChoice,
        );
      }

      return selected;
    };

    const existingProviderConfig = config.providers[provider] || {};
    const existingModels = existingProviderConfig.defaultModels || {};
    const fallbacks = customFallbackModels(provider);

    const jobs = await selectModelForRole(
      "Steve Jobs (🍎 Vize & Redukce)",
      existingModels.jobs || fallbacks.jobs,
    );
    const woz = await selectModelForRole(
      "Steve Wozniak (🔧 Inženýrství & Otevřenost)",
      existingModels.woz || fallbacks.woz,
    );
    const ive = await selectModelForRole(
      "Jony Ive (✏️ Design & Řemeslo)",
      existingModels.ive || fallbacks.ive,
    );
    const karpathy = await selectModelForRole(
      "Andrej Karpathy (🤖 AI/ML & Evaly)",
      existingModels.karpathy || fallbacks.karpathy,
    );
    const mastnacek = await selectModelForRole(
      "Jaroslav Havel (👤 mastnáček - Kontext)",
      existingModels.mastnacek || fallbacks.mastnacek,
    );
    const synthesis = await selectModelForRole(
      "Syntetizátor / Verdikt (⚖️)",
      existingModels.synthesis || fallbacks.synthesis,
    );

    config.providers[provider] = {
      baseUrl,
      apiKeyEnv,
      defaultModels: {
        jobs,
        woz,
        ive,
        karpathy,
        mastnacek,
        synthesis,
      },
    };

    targetUi.notify(`Vlastní konfigurace pro ${provider} dokončena.`, "info");
  }

  saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
  return config;
};
