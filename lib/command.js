// /apple (and /apple-rada) command handler.
import { ApiClient } from "./api.js";
import { WRITE_TOOL } from "./apple-docs.js";
import { apiKeyEnvName, loadConfig, saveConfig } from "./config.js";
import { configureHarness } from "./config-wizard.js";
import { harness } from "./harness-state.js";
import { getDeliberator, getLocalConfig } from "./harness.js";
import { getPiAuth } from "./pi-auth.js";
import { applyPreset, customFallbackModels, PRESETS, PROVIDERS } from "./presets.js";
import { refreshAppleStatus, showAppleHelp, showAppleStatus } from "./status.js";

export const runAppleCommand = async (args, ctx) => {
  const rawInput = (
    Array.isArray(args) ? args.join(" ") : String(args || "")
  ).trim();
  // `--global` is accepted as a prefix or a suffix and is stripped here.
  const isGlobal = /(^|\s)--global(\s|$)/.test(rawInput);
  const raw = rawInput.replace(/(^|\s)--global(\s|$)/g, " ").trim();
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
    if (harness.activeDeliberation) {
      ctx.ui.notify(
        `⏳ Právě probíhá jednání Apple rady: ${harness.activeDeliberation.stage}\nZadání: "${harness.activeDeliberation.prompt}"`,
        "info",
      );
      return;
    }
    showAppleStatus(ctx);
    return;
  }

  if (cmd === "detail" || cmd === "last" || cmd === "transcript") {
    if (!harness.lastDeliberation) {
      ctx.ui.notify(
        "Zatím neproběhlo žádné jednání rady. Spusť nejprve: /apple <téma>",
        "warning",
      );
      return;
    }
    const d = harness.lastDeliberation;
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
    await configureHarness(ctx.ui, ctx, isGlobal);
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
    const config = getLocalConfig(ctx.cwd);
    if (arg1 === "glm" || arg1 === "glmrada") {
      applyPreset(config, PRESETS.glmRada);
      saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
      ctx.ui.notify(
        "Preset přepnut na: GLM-5.3 Apple Rada (OpenCode Go)",
        "info",
      );
    } else if (arg1 === "zenfree" || arg1 === "free") {
      applyPreset(config, PRESETS.zenFree);
      saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
      ctx.ui.notify(
        "Preset přepnut na: ZenFree (OpenCode Zen zdarma)",
        "info",
      );
    } else if (arg1 === "quality" || arg1 === "zen") {
      applyPreset(config, PRESETS.quality);
      saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
      ctx.ui.notify(
        "Preset přepnut na: Quality / Frontier (OpenCode Zen)",
        "info",
      );
    } else if (arg1 === "high" || arg1 === "highquality") {
      applyPreset(config, PRESETS.highQuality);
      saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
      ctx.ui.notify("Preset přepnut na: High Quality (OpenCode Go)", "info");
    } else if (arg1 === "balanced") {
      applyPreset(config, PRESETS.balanced);
      saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
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
    const config = getLocalConfig(ctx.cwd);
    config.provider = arg1;
    if (!config.providers) config.providers = {};
    if (!config.providers[arg1]) {
      config.providers[arg1] = {
        baseUrl: providerDefaults.baseUrl,
        apiKeyEnv: providerDefaults.apiKeyEnv,
        defaultModels: customFallbackModels(arg1),
      };
    }
    saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
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
    const config = getLocalConfig(ctx.cwd);
    const provider = config.provider || "opencode-go";
    if (!config.providers[provider])
      config.providers[provider] = { defaultModels: {} };
    if (!config.providers[provider].defaultModels)
      config.providers[provider].defaultModels = {};
    config.providers[provider].defaultModels[arg1] = arg2;
    saveConfig(config, undefined, { isGlobal, cwd: ctx.cwd });
    ctx.ui.notify(`Model pro ${arg1} nastaven na: ${arg2}`, "info");
    return;
  }

  let isVerbose = false;
  let prompt = raw;
  if (raw.startsWith("-v ") || raw.startsWith("--verbose ")) {
    isVerbose = true;
    prompt = raw.replace(/^-(v|-verbose)\s+/, "");
  }

  let config = getLocalConfig(ctx.cwd);
  if (!config || !config.configured) {
    config = await configureHarness(ctx.ui, ctx, isGlobal);
  }

  if (!config) {
    ctx.ui.notify("Konfigurace rady byla přerušena nebo selhala.", "error");
    return;
  }

  ctx.ui.setStatus("apple-rada", "🍎 Svolávám Apple Advisory Board…");
  harness.activeDeliberation = { prompt, stage: "Zahájení..." };

  try {
    const deliberator = getDeliberator();
    const result = await deliberator.deliberate(prompt, {
      onProgress: (stage, data) => {
        if (stage === "panel-start") {
          harness.activeDeliberation.stage = `Panel: Jobs (${data.models.jobs}), Woz (${data.models.woz}), Ive (${data.models.ive}), Karpathy (${data.models.karpathy})`;
          ctx.ui.setStatus("apple-rada", `⏳ ${harness.activeDeliberation.stage}`);
        } else if (stage === "panel-end") {
          harness.activeDeliberation.stage = "Vyjádření poradců přijata";
          ctx.ui.setStatus("apple-rada", "✅ Vyjádření poradců přijata");
        } else if (stage === "context-start") {
          harness.activeDeliberation.stage = `Advokát kontextu mastnáček (${data.model})`;
          ctx.ui.setStatus("apple-rada", `👤 ${harness.activeDeliberation.stage}`);
        } else if (stage === "context-end") {
          harness.activeDeliberation.stage = "Uzemnění a křížová palba hotovy";
          ctx.ui.setStatus(
            "apple-rada",
            "✅ Uzemnění a křížová palba hotovy",
          );
        } else if (stage === "synthesis-start") {
          harness.activeDeliberation.stage = `Sestavuji verdikt (${data.model})`;
          ctx.ui.setStatus("apple-rada", `⚖️ ${harness.activeDeliberation.stage}`);
        } else if (stage === "synthesis-end") {
          harness.activeDeliberation.stage = "Verdikt dokončen";
          ctx.ui.setStatus("apple-rada", "✅ Verdikt dokončen");
        }
      },
    });

    harness.lastDeliberation = { prompt, ...result };

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
    harness.activeDeliberation = null;
    refreshAppleStatus(ctx);
  }
};
