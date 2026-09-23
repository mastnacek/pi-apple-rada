import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { ApiClient } from "./lib/api.js";
import {
  apiKeyEnvName,
  loadConfig,
  saveConfig,
  getDefaultConfig,
} from "./lib/config.js";
import { createAssistantMessageEventStream } from "./lib/event-stream.js";
import { loadPiAi } from "./lib/pi-ai.js";
import {
  applyPreset,
  customFallbackModels,
  PRESETS,
  PROVIDERS,
} from "./lib/presets.js";
import { Deliberator } from "./lib/deliberation.js";

const getPiAuth = () => {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const authPath = path.join(agentDir, "auth.json");
  if (fs.existsSync(authPath)) {
    try {
      return JSON.parse(fs.readFileSync(authPath, "utf8"));
    } catch {
      // Ignore
    }
  }
  return {};
};

const isProviderConnected = (provider, auth) => {
  if (
    auth[provider] &&
    (auth[provider].key || auth[provider].access || auth[provider].token)
  ) {
    return true;
  }
  const envVars = {
    "opencode-go": ["OC_GO_CC_API_KEY", "OPENCODE_API_KEY"],
    "opencode-zen": ["OPENCODE_API_KEY", "ZEN_API_KEY", "OC_GO_CC_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
    google: ["GEMINI_API_KEY"],
    "google-vertex": ["GEMINI_API_KEY"],
    deepseek: ["DEEPSEEK_API_KEY"],
    xai: ["XAI_API_KEY"],
    "zai-coding-cn": ["ZAI_API_KEY"],
    moonshotai: ["MOONSHOT_API_KEY"],
    "kimi-coding": ["KIMI_API_KEY"],
    groq: ["GROQ_API_KEY"],
    ollama: ["OLLAMA_API_KEY"],
  };
  const vars = envVars[provider] || [];
  return vars.some((v) => !!process.env[v]);
};

// OpenAI tool definition for the `write` tool — sent to the file-agent model so it can
// emit structured write tool calls. Matches Pi's built-in write tool schema.
const WRITE_TOOL = [
  {
    type: "function",
    function: {
      name: "write",
      description:
        "Write content to a file. Create one file per tool call. Use relative paths from the project root.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write (relative or absolute)",
          },
          content: {
            type: "string",
            description: "Full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
];

const APPLE_DOCS = {
  status: "zobrazí aktuální stav konfigurace nebo probíhajícího jednání",
  detail:
    "zobrazí kompletní detailní vyjádření všech person z posledního jednání",
  preset:
    "rychlé přepnutí presetu modelů (glm | zenfree | quality | high | balanced)",
  provider:
    "výběr providera (openrouter | zai-coding-cn | kimi-coding | google | ...)",
  model: "přepsání modelu pro konkrétního člena rady",
  setup: "spustí interaktivního průvodce výběrem modelů",
  help: "zobrazí nápovědu a přehled členů rady",
};

/**
 * Discovers ONLY the providers that are actually authenticated / set up in Pi.
 */
const getConnectedPiProviders = () => {
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

/**
 * Retrieves the list of available model IDs for a specific provider.
 */
const getModelsForProvider = (provider, ctx) => {
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

const getProviderBaseUrl = (provider) => {
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

let lastDeliberation = null;
let activeDeliberation = null;

/**
 * Pi Coding Agent extension entry point.
 * Ref: https://pi.dev/docs/extensions
 */
export default function (pi) {
  let activeUi = null;

  const refreshAppleStatus = (ctx) => {
    if (!ctx?.hasUI) return;
    const cfg = loadConfig();
    const provider = cfg?.provider || "opencode-go";
    ctx.ui.setStatus("apple-rada", `🍎 rada: ${provider}`);
  };

  // Capture active UI context from agent_start event
  pi.on("agent_start", (_event, ctx) => {
    activeUi = ctx?.ui;
  });

  pi.on("session_start", (_event, ctx) => {
    refreshAppleStatus(ctx);
  });

  // Drop module-level deliberation/UI state on shutdown so a later session
  // cannot observe a previous session's advisory result (AGENTS.md §5/§6).
  pi.on("session_shutdown", () => {
    activeUi = null;
    lastDeliberation = null;
    activeDeliberation = null;
  });

  const getLocalConfig = () => loadConfig();

  const getDeliberator = () => {
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

  const configureHarness = async (ui, ctx) => {
    const targetUi = ui || activeUi;
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

    const config = getLocalConfig();
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

    saveConfig(config);
    return config;
  };

  const showAppleStatus = (ctx) => {
    const config = getLocalConfig();
    const provider = config.provider || "opencode-go";
    const providerConfig = config.providers?.[provider] || {};
    const models = providerConfig.defaultModels || {};
    const auth = getPiAuth();
    const connected = isProviderConnected(provider, auth);

    const lines = [
      "🍎 Apple Advisory Board – Aktuální konfigurace",
      `Provider: ${provider} (${connected ? "připojeno" : "bez klíče"}) [URL: ${providerConfig.baseUrl || "N/A"}]`,
      `Režim: ${config.mode || "standard"}`,
      "",
      "Přiřazení modelů:",
      `  • 🍎 Steve Jobs:       ${models.jobs || "nenastaven"}`,
      `  • 🔧 Steve Wozniak:    ${models.woz || "nenastaven"}`,
      `  • ✏️ Jony Ive:         ${models.ive || "nenastaven"}`,
      `  • 🤖 Andrej Karpathy:  ${models.karpathy || "nenastaven"}`,
      `  • 👤 mastnáček:        ${models.mastnacek || "nenastaven"}`,
      `  • ⚖️ Syntéza/Verdikt:  ${models.synthesis || "nenastaven"}`,
      "",
      "Rychlé přepnutí:",
      "  /apple preset glm|quality|high|balanced",
      "  /apple provider <providerId>",
      "  /apple setup",
    ];

    ctx.ui.notify(lines.join("\n"), "info");
  };

  const showAppleHelp = (ctx) => {
    const lines = [
      "🍎 Apple Advisory Board — Nápověda",
      "Multi-model deliberation s veterány Applu a advokátem kontextu.",
      "",
      "Použití:",
      "  /apple <téma / kód / dotaz> — svolá radu na zadané téma",
      "  /apple status               — zobrazí aktuální konfiguraci a modely",
      "  /apple preset <název>       — přepne preset (glm, quality, high, balanced)",
      "  /apple provider <název>     — přepne providera",
      "  /apple model <role> <model> — přenastaví model pro roli",
      "  /apple setup                — spustí interaktivního konfiguračního průvodce",
      "  /apple help                 — zobrazí tuto nápovědu",
      "",
      "Role v radě:",
      "  🍎 Steve Jobs     (Vize, produkt, radikální redukce)",
      "  🔧 Steve Wozniak  (Inženýrství, architektura, otevřenost)",
      "  ✏️ Jony Ive       (Design, UX, emoce, péče / care)",
      "  🤖 Andrej Karpathy(AI/ML, eval-first, Software 2.0/3.0)",
      "  👤 mastnáček      (Advokát kontextu: VSA, Deep Modules, 1 vývojář)",
      "  ⚖️ Verdikt        (Konkrétní akční kroky)",
    ];
    ctx.ui.notify(lines.join("\n"), "info");
  };

  // 1. Register a slash command: /apple <prompt>
  const runAppleCommand = async (args, ctx) => {
    const raw = (
      Array.isArray(args) ? args.join(" ") : String(args || "")
    ).trim();
    if (!raw) {
      showAppleHelp(ctx);
      return;
    }

    const tokens = raw.split(/\s+/).filter(Boolean);
    const cmd = tokens[0]?.toLowerCase();
    const arg1 = tokens[1]?.toLowerCase();
    const arg2 = tokens[2];

    if (cmd === "help") {
      showAppleHelp(ctx);
      return;
    }

    if (cmd === "status") {
      if (activeDeliberation) {
        ctx.ui.notify(
          `⏳ Právě probíhá jednání Apple rady: ${activeDeliberation.stage}\nZadání: "${activeDeliberation.prompt}"`,
          "info",
        );
        return;
      }
      showAppleStatus(ctx);
      return;
    }

    if (cmd === "detail" || cmd === "last" || cmd === "transcript") {
      if (!lastDeliberation) {
        ctx.ui.notify(
          "Zatím neproběhlo žádné jednání rady. Spusť nejprve: /apple <téma>",
          "warning",
        );
        return;
      }
      const d = lastDeliberation;
      const text = [
        "# 🍎 Apple Advisory Board — Detail posledního jednání",
        `**🎯 Zadání:** ${d.prompt}`,
        "",
        "---",
        "### 🍎 Steve Jobs (Vize, produkt & radikální redukce)",
        d.panelResponses?.jobs || "Není k dispozici",
        "",
        "---",
        "### 🔧 Steve Wozniak (Inženýrství, architektura & otevřenost)",
        d.panelResponses?.woz || "Není k dispozici",
        "",
        "---",
        "### ✏️ Jony Ive (Design, UX, emoce & péče)",
        d.panelResponses?.ive || "Není k dispozici",
        "",
        "---",
        "### 🤖 Andrej Karpathy (AI/ML, evaly & spolehlivost)",
        d.panelResponses?.karpathy || "Není k dispozici",
        "",
        "---",
        "### 👤 mastnáček (Advokát kontextu & Křížová palba)",
        d.contextAdvocateResponse || "Není k dispozici",
        "",
        "---",
        "### ⚖️ Finální verdikt",
        d.synthesis || "Není k dispozici",
        "",
        "---",
        `*Modely: Jobs (${d.models?.jobs}), Woz (${d.models?.woz}), Ive (${d.models?.ive}), Karpathy (${d.models?.karpathy}), mastnáček (${d.models?.mastnacek}), Syntéza (${d.models?.synthesis}) | Tokeny: ${d.usage?.totalTokens || 0}*`,
      ].join("\n\n");

      pi.sendMessage(
        { customType: "apple-rada-detail", content: text, display: true },
        { triggerTurn: false },
      );
      return;
    }

    if (cmd === "setup") {
      await configureHarness(ctx.ui, ctx);
      refreshAppleStatus(ctx);
      return;
    }

    if (cmd === "preset") {
      if (!arg1) {
        ctx.ui.notify(
          "Použití: /apple preset glm|quality|high|balanced",
          "warning",
        );
        return;
      }
      const config = getLocalConfig();
      if (arg1 === "glm" || arg1 === "glmrada") {
        applyPreset(config, PRESETS.glmRada);
        saveConfig(config);
        ctx.ui.notify(
          "Preset přepnut na: GLM-5.3 Apple Rada (OpenCode Go)",
          "info",
        );
      } else if (arg1 === "zenfree" || arg1 === "free") {
        applyPreset(config, PRESETS.zenFree);
        saveConfig(config);
        ctx.ui.notify(
          "Preset přepnut na: ZenFree (OpenCode Zen zdarma)",
          "info",
        );
      } else if (arg1 === "quality" || arg1 === "zen") {
        applyPreset(config, PRESETS.quality);
        saveConfig(config);
        ctx.ui.notify(
          "Preset přepnut na: Quality / Frontier (OpenCode Zen)",
          "info",
        );
      } else if (arg1 === "high" || arg1 === "highquality") {
        applyPreset(config, PRESETS.highQuality);
        saveConfig(config);
        ctx.ui.notify("Preset přepnut na: High Quality (OpenCode Go)", "info");
      } else if (arg1 === "balanced") {
        applyPreset(config, PRESETS.balanced);
        saveConfig(config);
        ctx.ui.notify("Preset přepnut na: Balanced (OpenCode Go)", "info");
      } else {
        ctx.ui.notify(
          `Neznámý preset "${arg1}". Dostupné: glm, quality, high, balanced`,
          "error",
        );
        return;
      }
      refreshAppleStatus(ctx);
      return;
    }

    if (cmd === "provider") {
      if (!arg1) {
        ctx.ui.notify("Použití: /apple provider <providerName>", "warning");
        return;
      }
      const providerDefaults = PROVIDERS[arg1] || {
        baseUrl: "",
        apiKeyEnv: "",
      };
      const config = getLocalConfig();
      config.provider = arg1;
      if (!config.providers) config.providers = {};
      if (!config.providers[arg1]) {
        config.providers[arg1] = {
          baseUrl: providerDefaults.baseUrl,
          apiKeyEnv: providerDefaults.apiKeyEnv,
          defaultModels: customFallbackModels(arg1),
        };
      }
      saveConfig(config);
      refreshAppleStatus(ctx);
      ctx.ui.notify(`Provider přepnut na: ${arg1}`, "info");
      return;
    }

    if (cmd === "model") {
      const validRoles = [
        "jobs",
        "woz",
        "ive",
        "karpathy",
        "mastnacek",
        "synthesis",
      ];
      if (!arg1 || !validRoles.includes(arg1) || !arg2) {
        ctx.ui.notify(
          "Použití: /apple model <jobs|woz|ive|karpathy|mastnacek|synthesis> <modelName>",
          "warning",
        );
        return;
      }
      const config = getLocalConfig();
      const provider = config.provider || "opencode-go";
      if (!config.providers[provider])
        config.providers[provider] = { defaultModels: {} };
      if (!config.providers[provider].defaultModels)
        config.providers[provider].defaultModels = {};
      config.providers[provider].defaultModels[arg1] = arg2;
      saveConfig(config);
      ctx.ui.notify(`Model pro ${arg1} nastaven na: ${arg2}`, "info");
      return;
    }

    let isVerbose = false;
    let prompt = raw;
    if (raw.startsWith("-v ") || raw.startsWith("--verbose ")) {
      isVerbose = true;
      prompt = raw.replace(/^-(v|-verbose)\s+/, "");
    }

    let config = getLocalConfig();
    if (!config || !config.configured) {
      config = await configureHarness(ctx.ui, ctx);
    }

    if (!config) {
      ctx.ui.notify("Konfigurace rady byla přerušena nebo selhala.", "error");
      return;
    }

    ctx.ui.setStatus("apple-rada", "🍎 Svolávám Apple Advisory Board…");
    activeDeliberation = { prompt, stage: "Zahájení..." };

    try {
      const deliberator = getDeliberator();
      const result = await deliberator.deliberate(prompt, {
        onProgress: (stage, data) => {
          if (stage === "panel-start") {
            activeDeliberation.stage = `Panel: Jobs (${data.models.jobs}), Woz (${data.models.woz}), Ive (${data.models.ive}), Karpathy (${data.models.karpathy})`;
            ctx.ui.setStatus("apple-rada", `⏳ ${activeDeliberation.stage}`);
          } else if (stage === "panel-end") {
            activeDeliberation.stage = "Vyjádření poradců přijata";
            ctx.ui.setStatus("apple-rada", "✅ Vyjádření poradců přijata");
          } else if (stage === "context-start") {
            activeDeliberation.stage = `Advokát kontextu mastnáček (${data.model})`;
            ctx.ui.setStatus("apple-rada", `👤 ${activeDeliberation.stage}`);
          } else if (stage === "context-end") {
            activeDeliberation.stage = "Uzemnění a křížová palba hotovy";
            ctx.ui.setStatus(
              "apple-rada",
              "✅ Uzemnění a křížová palba hotovy",
            );
          } else if (stage === "synthesis-start") {
            activeDeliberation.stage = `Sestavuji verdikt (${data.model})`;
            ctx.ui.setStatus("apple-rada", `⚖️ ${activeDeliberation.stage}`);
          } else if (stage === "synthesis-end") {
            activeDeliberation.stage = "Verdikt dokončen";
            ctx.ui.setStatus("apple-rada", "✅ Verdikt dokončen");
          }
        },
      });

      lastDeliberation = { prompt, ...result };

      // File-agent step: if code was produced, ask a cheap model to extract files
      ctx.ui.setStatus("apple-rada", "💾 Kontrola generovaných souborů…");
      const provider = config.provider || "opencode-go";
      const providerConfig = config.providers?.[provider] || {};
      const fileAgentModel = config.fileAgentModel || "deepseek-v4-flash";

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

      const savedFiles = [];
      try {
        const fileAgentResult = await apiClient.chatCompletion({
          model: fileAgentModel,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You are a file-saving agent. You receive an advisory synthesis that may contain code or file changes. Use the write tool to save every file the user would expect from the original request. If the synthesis contains no files to save (e.g. conceptual advice), do NOT call any tool — reply with a brief one-line confirmation.",
            },
            {
              role: "user",
              content: `Original user request: ${prompt}\n\nAdvisory synthesis:\n${result.synthesis}\n\nSave the file(s) now using the write tool, or confirm if nothing needs saving.`,
            },
          ],
          tools: WRITE_TOOL,
        });

        const toolCalls = fileAgentResult.toolCalls || [];
        for (const tc of toolCalls) {
          if (tc.name === "write" && tc.arguments) {
            const filePath = path.resolve(process.cwd(), tc.arguments.path);
            const dir = path.dirname(filePath);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, tc.arguments.content, "utf8");
            savedFiles.push(tc.arguments.path);
          }
        }
      } catch {
        // File agent optional
      }

      const filesSummary =
        savedFiles.length > 0
          ? `\n\n---\n💾 Uloženo ${savedFiles.length} soubor${savedFiles.length > 1 ? "ů" : ""}: ${savedFiles.map((f) => `\`${f}\``).join(", ")}`
          : "";

      if (isVerbose) {
        const fullDetail = [
          "# 🍎 Apple Advisory Board — Detailní vyjádření",
          `**🎯 Zadání:** ${prompt}`,
          "",
          "---",
          "### 🍎 Steve Jobs",
          result.panelResponses?.jobs || "",
          "",
          "---",
          "### 🔧 Steve Wozniak",
          result.panelResponses?.woz || "",
          "",
          "---",
          "### ✏️ Jony Ive",
          result.panelResponses?.ive || "",
          "",
          "---",
          "### 🤖 Andrej Karpathy",
          result.panelResponses?.karpathy || "",
          "",
          "---",
          "### 👤 mastnáček",
          result.contextAdvocateResponse || "",
          "",
          "---",
          "### ⚖️ Finální verdikt",
          result.synthesis || "",
        ].join("\n\n");

        pi.sendMessage(
          {
            customType: "apple-rada-detail",
            content: fullDetail + filesSummary,
            display: true,
          },
          { triggerTurn: false },
        );
      } else {
        pi.sendMessage(
          {
            customType: "apple-rada-answer",
            content: result.synthesis + filesSummary,
            display: true,
          },
          { triggerTurn: false },
        );
      }

      if (savedFiles.length > 0) {
        ctx.ui.notify(
          `Uloženo ${savedFiles.length} soubor${savedFiles.length > 1 ? "ů" : ""}: ${savedFiles.join(", ")}`,
          "info",
        );
      }
    } catch (error) {
      ctx.ui.notify(`Debata Apple rady selhala: ${error.message}`, "error");
    } finally {
      activeDeliberation = null;
      refreshAppleStatus(ctx);
    }
  };

  const getCompletions = (prefix) => {
    const tokens = prefix.split(/\s+/).filter(Boolean);
    const trailingSpace = /\s$/.test(prefix);
    const normalizedPrefix = tokens.join(" ").toLowerCase();

    // Second argument completions
    if (tokens.length > 1 || (trailingSpace && tokens.length === 1)) {
      const cmd = tokens[0]?.toLowerCase();

      if (cmd === "preset") {
        const items = [
          {
            value: "preset glm",
            label: "preset glm",
            description: "GLM-5.3 Apple Rada (OpenCode Go · Výchozí)",
          },
          {
            value: "preset zenfree",
            label: "preset zenfree",
            description: "ZenFree (OpenCode Zen modely zdarma · Bez klíče)",
          },
          {
            value: "preset quality",
            label: "preset quality",
            description:
              "Quality / Frontier (Grok 4.6 + GPT 5.6 Luna · OpenCode Zen)",
          },
          {
            value: "preset high",
            label: "preset high",
            description: "High Quality (Kimi K3 + Qwen 3.8 Max · OpenCode Go)",
          },
          {
            value: "preset balanced",
            label: "preset balanced",
            description:
              "Balanced (Kimi K3 + DeepSeek V4 Pro + GLM-5.3 · OpenCode Go)",
          },
        ];
        const filtered = items.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }

      if (cmd === "provider") {
        const providers = getConnectedPiProviders();
        const items = providers.map((p) => ({
          value: `provider ${p}`,
          label: `provider ${p}`,
          description: p,
        }));
        const filtered = items.filter((i) =>
          i.value.toLowerCase().startsWith(normalizedPrefix),
        );
        return filtered.length > 0 ? filtered : null;
      }

      if (cmd === "model") {
        const validRoles = [
          "jobs",
          "woz",
          "ive",
          "karpathy",
          "mastnacek",
          "synthesis",
        ];

        if (tokens.length === 2 && !trailingSpace) {
          const items = [
            {
              value: "model jobs ",
              label: "model jobs",
              description: "Steve Jobs (🍎 Vize & Redukce)",
            },
            {
              value: "model woz ",
              label: "model woz",
              description: "Steve Wozniak (🔧 Inženýrství)",
            },
            {
              value: "model ive ",
              label: "model ive",
              description: "Jony Ive (✏️ Design & Řemeslo)",
            },
            {
              value: "model karpathy ",
              label: "model karpathy",
              description: "Andrej Karpathy (🤖 AI/ML & Evaly)",
            },
            {
              value: "model mastnacek ",
              label: "model mastnacek",
              description: "Jaroslav Havel (👤 Kontext)",
            },
            {
              value: "model synthesis ",
              label: "model synthesis",
              description: "Syntetizátor / Verdikt (⚖️)",
            },
          ];
          const filtered = items.filter((i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix),
          );
          return filtered.length > 0 ? filtered : null;
        }

        if (tokens.length > 2 || (tokens.length === 2 && trailingSpace)) {
          const role = tokens[1]?.toLowerCase();
          if (!validRoles.includes(role)) return null;

          const config = getLocalConfig();
          const provider = config.provider || "opencode-go";
          const fallbacks = customFallbackModels(provider);
          const currentModel =
            config.providers?.[provider]?.defaultModels?.[role] ||
            fallbacks[role];

          const modelCandidates = new Set();
          if (currentModel) modelCandidates.add(currentModel);
          for (const m of Object.values(fallbacks)) {
            if (m) modelCandidates.add(m);
          }

          try {
            const agentDir =
              process.env.PI_CODING_AGENT_DIR ||
              path.join(os.homedir(), ".pi", "agent");
            const storePath = path.join(agentDir, "models-store.json");
            if (fs.existsSync(storePath)) {
              const data = JSON.parse(fs.readFileSync(storePath, "utf8"));
              const provData = data[provider];
              if (Array.isArray(provData?.models)) {
                for (const m of provData.models) {
                  const id = typeof m === "string" ? m : m?.id;
                  if (id) modelCandidates.add(id);
                }
              }
            }
          } catch {
            // Ignore
          }

          const items = Array.from(modelCandidates).map((m) => ({
            value: `model ${role} ${m}`,
            label: `model ${role} ${m}`,
            description: `Nastavit model pro ${role}`,
          }));

          const filtered = items.filter((i) =>
            i.value.toLowerCase().startsWith(normalizedPrefix),
          );
          return filtered.length > 0 ? filtered : null;
        }
      }

      return null;
    }

    // First word completions
    const typed = (tokens[0] ?? "").toLowerCase();
    const NON_TERMINAL = new Set(["preset", "provider", "model"]);
    const items = Object.entries(APPLE_DOCS)
      .filter(([key]) => key.toLowerCase().startsWith(typed))
      .map(([key, description]) => ({
        value: NON_TERMINAL.has(key) ? `${key} ` : key,
        label: key,
        description,
      }));
    return items.length > 0 ? items : null;
  };

  pi.registerCommand("apple", {
    description:
      "Svolá Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček -> Verdikt) nebo spravuje konfiguraci",
    getArgumentCompletions: getCompletions,
    handler: runAppleCommand,
  });

  pi.registerCommand("apple-rada", {
    description:
      "Svolá Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček -> Verdikt) nebo spravuje konfiguraci",
    getArgumentCompletions: getCompletions,
    handler: runAppleCommand,
  });

  // 2. Register custom agent tool: apple_rada
  pi.registerTool({
    name: "apple_rada",
    label: "Apple Advisory Board",
    description:
      "Svolá round-table radu veteránů Applu (Steve Jobs, Steve Wozniak, Jony Ive, Andrej Karpathy) a advokáta kontextu (mastnáček) pro řezavé posouzení architektury, designu, UX, evalů a osekání zbytečností.",
    promptSnippet:
      "Svolat Apple Advisory Board na posouzení nápadu, architektury nebo kódu",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Dotaz, kód, architektonická volba nebo feature k posouzení.",
        },
      },
      required: ["prompt"],
    },
    execute: async (_toolCallId, params) => {
      try {
        const deliberator = getDeliberator();
        const result = await deliberator.deliberate(params.prompt);
        return {
          content: [{ type: "text", text: result.synthesis }],
          details: {
            panelResponses: result.panelResponses,
            contextAdvocate: result.contextAdvocateResponse,
            models: result.models,
            usage: result.usage,
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text", text: `Debata Apple rady selhala: ${msg}` },
          ],
          details: { error: msg },
        };
      }
    },
  });

  // 3. Register model provider: apple-rada
  pi.registerProvider("apple-rada", {
    name: "Apple Advisory Board (Jobs/Woz/Ive/Karpathy/mastnáček)",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey: "dummy",
    api: "apple-rada-api",
    models: [
      {
        id: "apple-rada",
        name: "Apple Advisory Board Model",
        api: "apple-rada-api",
        provider: "apple-rada",
        baseUrl: "https://opencode.ai/zen/go/v1",
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
    streamSimple: (model, context, options) => {
      const outer = createAssistantMessageEventStream();

      const lastUserMsg = context.messages
        ?.filter((m) => m.role === "user")
        .pop();
      let prompt = "";
      if (lastUserMsg) {
        if (typeof lastUserMsg.content === "string") {
          prompt = lastUserMsg.content;
        } else if (Array.isArray(lastUserMsg.content)) {
          prompt = lastUserMsg.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        }
      }

      const freshUsage = () => ({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });
      const baseMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: freshUsage(),
        stopReason: "stop",
        timestamp: Date.now(),
      };
      const msg = (text, extra = {}) => {
        const { usage, ...rest } = extra;
        return {
          ...baseMessage,
          content: [{ type: "text", text }],
          usage: usage || freshUsage(),
          ...rest,
        };
      };
      const addUsageSafe = (total, u) => {
        if (!u) return;
        total.input += u.input || 0;
        total.output += u.output || 0;
        total.cacheRead += u.cacheRead || 0;
        total.cacheWrite += u.cacheWrite || 0;
        total.totalTokens += u.totalTokens || 0;
      };

      queueMicrotask(async () => {
        try {
          const msgs = context.messages || [];
          const writeResults = [];
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (m && m.role === "toolResult" && m.toolName === "write")
              writeResults.unshift(m);
            else break;
          }
          if (writeResults.length > 0) {
            const firstResultIdx = msgs.length - writeResults.length - 1;
            const assistantMsg = msgs[firstResultIdx];
            const savedPaths = [];
            for (const wr of writeResults) {
              let pathStr = "";
              if (assistantMsg && Array.isArray(assistantMsg.content)) {
                const tc = assistantMsg.content.find(
                  (c) => c.type === "toolCall" && c.id === wr.toolCallId,
                );
                if (tc?.arguments?.path) pathStr = tc.arguments.path;
              }
              savedPaths.push(pathStr);
            }
            const known = savedPaths.filter(Boolean);
            const confirmText =
              known.length > 0
                ? `✅ Uloženo ${known.length} soubor${known.length > 1 ? "ů" : ""}:\n` +
                  known.map((p) => `  • \`${p}\``).join("\n")
                : `✅ Uloženo ${writeResults.length} soubor${writeResults.length > 1 ? "ů" : ""}.`;
            outer.push({
              type: "start",
              partial: { ...baseMessage, content: [], usage: freshUsage() },
            });
            outer.push({
              type: "text_start",
              contentIndex: 0,
              partial: msg(""),
            });
            outer.push({
              type: "text_delta",
              contentIndex: 0,
              delta: confirmText,
              partial: msg(confirmText),
            });
            outer.push({
              type: "text_end",
              contentIndex: 0,
              content: confirmText,
              partial: msg(confirmText),
            });
            const done = msg(confirmText);
            outer.push({ type: "done", reason: "stop", message: done });
            outer.end(done);
            return;
          }

          if (options?.signal?.aborted) {
            const m = msg("", {
              stopReason: "aborted",
              errorMessage: "aborted",
            });
            outer.push({ type: "error", reason: "aborted", error: m });
            outer.end(m);
            return;
          }

          let config = getLocalConfig();
          if (!config || !config.configured) {
            config = getDefaultConfig();
          }

          if (options?.onResponse) {
            await options.onResponse({ status: 200, headers: {} }, model);
          }

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

          let streamedText = "";
          const sendDelta = (text) => {
            streamedText += text;
            outer.push({
              type: "text_delta",
              contentIndex: 0,
              delta: text,
              partial: msg(streamedText),
            });
          };

          outer.push({
            type: "start",
            partial: { ...baseMessage, content: [], usage: freshUsage() },
          });
          outer.push({ type: "text_start", contentIndex: 0, partial: msg("") });

          sendDelta(
            "🍎 **Svolávám Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček)**\n",
          );

          let synthesisStreamed = false;

          const deliberator = new Deliberator({ apiClient, config });
          const result = await deliberator.deliberate(prompt, {
            onProgress: (stage, data) => {
              if (stage === "panel-start") {
                sendDelta(
                  ` ├─ ⏳ Běží poradní panel: Jobs (${data.models.jobs}), Woz (${data.models.woz}), Ive (${data.models.ive}), Karpathy (${data.models.karpathy})...\n`,
                );
              } else if (stage === "panel-end") {
                sendDelta(` ├─ ✅ Vyjádření poradců přijata.\n`);
              } else if (stage === "context-start") {
                sendDelta(
                  ` ├─ 👤 Advokát kontextu mastnáček & křížová palba (${data.model})...\n`,
                );
              } else if (stage === "context-end") {
                sendDelta(` ├─ ✅ Uzemnění na realitu zpracováno.\n`);
              } else if (stage === "synthesis-start") {
                sendDelta(
                  ` ├─ ⚖️ Sestavuji finální verdikt Apple rady (${data.model})...\n\n`,
                );
              } else if (stage === "synthesis-end") {
                if (!synthesisStreamed && data.synthesis) {
                  sendDelta(data.synthesis);
                }
                sendDelta("\n\n---\n\n");
              }
            },
            onSynthesisDelta: (delta) => {
              synthesisStreamed = true;
              sendDelta(delta);
            },
          });

          if (options?.signal?.aborted) {
            const m = msg(streamedText, {
              stopReason: "aborted",
              errorMessage: "aborted",
            });
            outer.push({ type: "error", reason: "aborted", error: m });
            outer.end(m);
            return;
          }

          const finalUsage = result.usage || freshUsage();
          outer.push({
            type: "text_end",
            contentIndex: 0,
            content: streamedText,
            partial: msg(streamedText, { usage: finalUsage }),
          });

          // Optional file agent
          const fileAgentModel = config.fileAgentModel || "deepseek-v4-flash";
          let fileAgentResult;
          try {
            fileAgentResult = await apiClient.chatCompletion({
              model: fileAgentModel,
              temperature: 0.2,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a file-saving agent. You receive an advisory synthesis that may contain code or file changes. Use the write tool to save every file the user would expect from the original request. If the synthesis contains no files to save (e.g. conceptual advice), do NOT call any tool — reply with a brief one-line confirmation.",
                },
                {
                  role: "user",
                  content: `Original user request: ${prompt}\n\nAdvisory synthesis:\n${result.synthesis}\n\nSave the file(s) now using the write tool, or confirm if nothing needs saving.`,
                },
              ],
              tools: WRITE_TOOL,
              onDelta: (delta) => {
                if (delta) sendDelta(delta);
              },
            });
          } catch {
            const finalMessage = msg(streamedText, { usage: finalUsage });
            outer.push({ type: "done", reason: "stop", message: finalMessage });
            outer.end(finalMessage);
            return;
          }
          addUsageSafe(finalUsage, fileAgentResult.usage);

          try {
            const { calculateCost } = await loadPiAi();
            calculateCost(model, finalUsage);
          } catch {
            // calculateCost is optional
          }

          const toolCalls = fileAgentResult.toolCalls || [];
          const contentBlocks = [{ type: "text", text: streamedText }];
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const tcBlock = {
              type: "toolCall",
              id: tc.id || `call_${Date.now()}_${i}`,
              name: tc.name,
              arguments: tc.arguments,
            };
            contentBlocks.push(tcBlock);
            outer.push({
              type: "toolcall_start",
              contentIndex: 1 + i,
              partial: {
                ...baseMessage,
                content: [...contentBlocks],
                usage: finalUsage,
                stopReason: "toolUse",
              },
            });
            outer.push({
              type: "toolcall_end",
              contentIndex: 1 + i,
              toolCall: tcBlock,
              partial: {
                ...baseMessage,
                content: [...contentBlocks],
                usage: finalUsage,
                stopReason: "toolUse",
              },
            });
          }

          const stopReason = toolCalls.length > 0 ? "toolUse" : "stop";
          const finalMessage = {
            ...baseMessage,
            content: contentBlocks,
            usage: finalUsage,
            stopReason,
          };
          outer.push({
            type: "done",
            reason: stopReason,
            message: finalMessage,
          });
          outer.end(finalMessage);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const m = msg(`Chyba při běhu Apple rady: ${errMsg}`, {
            stopReason: "error",
            errorMessage: errMsg,
          });
          outer.push({ type: "error", reason: "error", error: m });
          outer.end(m);
        }
      });

      return outer;
    },
  });

  // 4. Register slash command: /apple-config
  pi.registerCommand("apple-config", {
    description: "Konfigurace modelů a presetů pro Apple Advisory Board",
    getArgumentCompletions: () => null,
    handler: async (_args, ctx) => {
      await configureHarness(ctx.ui, ctx);
      refreshAppleStatus(ctx);
    },
  });
}
