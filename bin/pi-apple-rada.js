#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api.js";
import {
  apiKeyEnvName,
  getPackageJson,
  loadConfig,
  saveConfig,
} from "../lib/config.js";
import {
  applyPreset,
  customFallbackModels,
  PRESETS,
  PROVIDERS,
} from "../lib/presets.js";
import { Deliberator } from "../lib/deliberation.js";
import { TerminalUi } from "../lib/ui.js";

// Interactive prompt utility
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

// Wizard to set configurations
async function runSetupWizard(configPath) {
  console.log(
    chalk.bold.cyan("\n🍎  Apple Advisory Board – Konfigurační průvodce"),
  );
  console.log("Vyber preset modelů:");
  console.log(
    `[1] ${chalk.bold.magenta("GLM-5.3 Apple Rada")} (OpenCode Go · Výchozí)`,
  );
  console.log(
    `[2] ${chalk.bold.yellow("Quality / Frontier")} (Grok 4.6 + GPT 5.6 Luna + Kimi K3 · OpenCode Zen)`,
  );
  console.log(
    `[3] ${chalk.bold.cyan("High Quality / OpenCode Go")} (Kimi K3 + Qwen 3.8 Max)`,
  );
  console.log(
    `[4] ${chalk.bold.green("Balanced / OpenCode Go")} (Kimi K3 + DeepSeek V4 Pro + GLM-5.3)`,
  );
  console.log(`[5] ${chalk.bold.blue("Vlastní konfigurace (Custom)")}`);

  let choice = "";
  while (!["1", "2", "3", "4", "5"].includes(choice)) {
    choice = await askQuestion("\nZvol preset [1-5]: ");
  }

  const config = loadConfig(configPath);
  if (!config.providers) config.providers = {};

  if (choice === "1") {
    applyPreset(config, PRESETS.glmRada);
    console.log(chalk.green("\n✓ GLM-5.3 Apple Rada preset nakonfigurován."));
  } else if (choice === "2") {
    applyPreset(config, PRESETS.quality);
    console.log(
      chalk.green(
        "\n✓ Quality / Frontier (OpenCode Zen) preset nakonfigurován.",
      ),
    );
  } else if (choice === "3") {
    applyPreset(config, PRESETS.highQuality);
    console.log(
      chalk.green("\n✓ High Quality / OpenCode Go preset nakonfigurován."),
    );
  } else if (choice === "4") {
    applyPreset(config, PRESETS.balanced);
    console.log(
      chalk.green("\n✓ Balanced / OpenCode Go preset nakonfigurován."),
    );
  } else {
    // Custom Configuration
    console.log(chalk.bold.blue("\n--- Vlastní konfigurace modelů ---"));
    const provider =
      (await askQuestion(
        "Vyber providera (opencode-go / opencode-zen / openai) [default: opencode-go]: ",
      )) || "opencode-go";
    config.provider = provider;
    config.configured = true;
    config.mode = "standard";

    const providerDefaults = PROVIDERS[provider] || PROVIDERS["opencode-go"];
    if (!config.providers[provider]) {
      config.providers[provider] = {
        baseUrl:
          (await askQuestion("API Base URL: ")) || providerDefaults.baseUrl,
        apiKeyEnv:
          (await askQuestion("Název Env proměnné pro klíč: ")) ||
          providerDefaults.apiKeyEnv,
        defaultModels: {},
      };
    }

    const defaultModels = config.providers[provider].defaultModels;
    const fallbacks = customFallbackModels(provider);
    defaultModels.jobs =
      (await askQuestion("Steve Jobs Model: ")) || fallbacks.jobs;
    defaultModels.woz =
      (await askQuestion("Steve Wozniak Model: ")) || fallbacks.woz;
    defaultModels.ive =
      (await askQuestion("Jony Ive Model: ")) || fallbacks.ive;
    defaultModels.karpathy =
      (await askQuestion("Andrej Karpathy Model: ")) || fallbacks.karpathy;
    defaultModels.mastnacek =
      (await askQuestion("mastnáček (Kontext) Model: ")) || fallbacks.mastnacek;
    defaultModels.synthesis =
      (await askQuestion("Syntéza / Verdikt Model: ")) || fallbacks.synthesis;

    console.log(chalk.green("\n✓ Vlastní konfigurace uložena."));
  }

  const finalConfigPath = saveConfig(config, configPath);
  console.log(
    chalk.cyan(`Konfigurace byla úspěšně uložena do: ${finalConfigPath}\n`),
  );
  return config;
}

function parseModelOverrides(overridesStr, config, provider) {
  if (!overridesStr) return;
  const parts = overridesStr.split(",");
  for (const part of parts) {
    const [key, value] = part.split("=");
    if (
      key &&
      value &&
      config.providers[provider] &&
      config.providers[provider].defaultModels[key] !== undefined
    ) {
      config.providers[provider].defaultModels[key] = value;
    }
  }
}

async function runQuery(prompt, deliberator, ui, options) {
  const provider = options.provider || deliberator.config.provider;

  try {
    const result = await deliberator.deliberate(prompt, {
      provider,
      onProgress: (stage, data) => {
        switch (stage) {
          case "panel-start":
            ui.startStage("panel-start", data);
            break;
          case "panel-end":
            ui.succeedStage("Vyjádření poradců přijata.");
            if (options.verbose) {
              ui.printPanelResponses(data.panelResponses);
            }
            break;
          case "context-start":
            ui.startStage("context-start", data);
            break;
          case "context-end":
            ui.succeedStage("Advokát kontextu a křížová palba hotovy.");
            if (options.verbose) {
              ui.printContextAdvocate(data.contextAdvocateResponse);
            }
            break;
          case "synthesis-start":
            ui.startStage("synthesis-start", data);
            break;
          case "synthesis-end":
            ui.succeedStage("Verdikt Apple rady dokončen.");
            break;
        }
      },
    });

    ui.printSynthesis(result.synthesis);
  } catch (error) {
    ui.failStage("Debata Apple rady selhala.");
    console.error(chalk.red(`\nChyba: ${error.message}\n`));
  }
}

function startRepl(deliberator, ui, options) {
  console.log(
    chalk.bold.cyan("\n🍎 Apple Advisory Board – Interaktivní režim"),
  );
  console.log(
    chalk.gray(`Provider: ${options.provider || deliberator.config.provider}`),
  );
  console.log(
    chalk.gray(
      'Zadej téma nebo kód k posouzení. Napiš "exit" nebo "quit" pro ukončení.\n',
    ),
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold.red("apple-rada> "),
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === "exit" || input.toLowerCase() === "quit") {
      console.log(chalk.cyan("Měj se!"));
      rl.close();
      return;
    }

    rl.pause();
    await runQuery(input, deliberator, ui, options);
    rl.resume();
    rl.prompt();
  }).on("close", () => {
    process.exit(0);
  });
}

const program = new Command();

program
  .name("pi-apple-rada")
  .description(
    "Apple Advisory Board multi-model deliberation harness (Jobs, Woz, Ive, Karpathy, mastnáček)",
  )
  .version(getPackageJson().version)
  .argument("[prompt]", "Dotaz, feature, nápad nebo kód k posouzení")
  .option(
    "-v, --verbose",
    "Zobrazit jednotlivé odpovědi person a kontextu",
    false,
  )
  .option("-i, --interactive", "Spustit interaktivní REPL režim", false)
  .option("-s, --setup", "Spustit konfiguračního průvodce", false)
  .option(
    "-p, --provider <name>",
    "Vybrat providera (opencode-go, opencode-zen, openai)",
  )
  .option("-c, --config <path>", "Cesta k vlastnímu konfiguračnímu souboru")
  .option(
    "-m, --models <overrides>",
    "Přepsat modely (např. jobs=kimi-k3,synthesis=glm-5.3)",
  )
  .action(async (prompt, options) => {
    const targetConfigPath =
      options.config || path.join(process.cwd(), "pi-apple-rada.config.json");

    let config = loadConfig(options.config);

    if (options.setup || !config.configured) {
      config = await runSetupWizard(targetConfigPath);
    }

    const provider = options.provider || config.provider || "opencode-go";

    if (options.models) {
      parseModelOverrides(options.models, config, provider);
    }

    const providerConfig = config.providers[provider];
    if (!providerConfig) {
      console.error(
        chalk.red(`Chyba: Provider "${provider}" není nakonfigurován.`),
      );
      process.exit(1);
    }

    const apiClient = new ApiClient({
      baseUrl: providerConfig.baseUrl,
      apiKeyEnvVar: apiKeyEnvName(providerConfig),
    });

    const deliberator = new Deliberator({ apiClient, config });
    const ui = new TerminalUi();

    if (options.interactive) {
      startRepl(deliberator, ui, options);
    } else if (prompt) {
      await runQuery(prompt, deliberator, ui, options);
    } else {
      program.help();
    }
  });

program.parse(process.argv);
