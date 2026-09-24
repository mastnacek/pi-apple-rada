// Argument completion for /apple, including the `--global` prefix.
import { APPLE_DOCS } from "./apple-docs.js";
import { getLocalConfig } from "./harness.js";
import { customFallbackModels } from "./presets.js";
import { getConnectedPiProviders } from "./providers.js";

export const getCompletions = (prefix) => {
  // `--global` prefix: complete the remainder, then re-prefix the suggestions.
  const globalTrimmed = prefix.trimStart();
  if (globalTrimmed.startsWith("--global")) {
    const afterGlobal = globalTrimmed.slice(8).trimStart();
    const hasTrailingSpace = globalTrimmed.length > 8 || /\s$/.test(prefix);
    if (!hasTrailingSpace && afterGlobal === "") {
      return [
        {
          value: "--global ",
          label: "--global",
          description: "Uložit nastavení globálně (~/.pi/agent/)",
        },
      ];
    }
    const subItems = getCompletions(afterGlobal);
    if (!subItems) return null;
    const remapped = [];
    for (const item of subItems) {
      if (item.label === "--global") continue;
      remapped.push({
        value: `--global ${item.value}`,
        label: item.label,
        description: item.description,
      });
    }
    return remapped.length > 0 ? remapped : null;
  }

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
  if ("--global".startsWith(typed)) {
    items.push({
      value: "--global ",
      label: "--global",
      description: "Uložit nastavení globálně (~/.pi/agent/)",
    });
  }
  return items.length > 0 ? items : null;
};
