// Throwaway: threads the config scope through pi-apple-rada/index.js.
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "index.js";
let src = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
const before = src.split("\n").length;

function must(from, to, label) {
	if (!src.includes(from)) throw new Error(`anchor missing: ${label}`);
	src = src.replace(from, to);
}

/* 1. Import the scope describer. */
must(
	'import {\n  apiKeyEnvName,\n  loadConfig,\n  saveConfig,\n  getDefaultConfig,\n} from "./lib/config.js";',
	'import {\n  apiKeyEnvName,\n  describeScope,\n  loadConfig,\n  saveConfig,\n  getDefaultConfig,\n} from "./lib/config.js";',
	"config import",
);

/* 2. The wizard takes the scope from its caller. */
must(
	"  const configureHarness = async (ui, ctx) => {",
	"  const configureHarness = async (ui, ctx, isGlobal = false) => {",
	"configureHarness signature",
);
must(
	"    saveConfig(config);\n    return config;\n  };",
	"    saveConfig(config, undefined, { isGlobal });\n    return config;\n  };",
	"configureHarness save",
);

/* 3. /apple accepts --global as a prefix or a suffix. */
must(
	'  const runAppleCommand = async (args, ctx) => {\n    const raw = (\n      Array.isArray(args) ? args.join(" ") : String(args || "")\n    ).trim();\n    if (!raw) {',
	'  const runAppleCommand = async (args, ctx) => {\n    const rawInput = (\n      Array.isArray(args) ? args.join(" ") : String(args || "")\n    ).trim();\n    // `--global` is accepted as a prefix or a suffix and is stripped here.\n    const isGlobal = /(^|\\s)--global(\\s|$)/.test(rawInput);\n    const raw = rawInput.replace(/(^|\\s)--global(\\s|$)/g, " ").trim();\n    if (!raw) {',
	"runAppleCommand head",
);

/* 4. Scope every persistence call inside the command + wizard. */
must(
	"      await configureHarness(ctx.ui, ctx);",
	"      await configureHarness(ctx.ui, ctx, isGlobal);",
	"configureHarness call (preset path)",
);
must(
	"      config = await configureHarness(ctx.ui, ctx);",
	"      config = await configureHarness(ctx.ui, ctx, isGlobal);",
	"configureHarness call (edit path)",
);

const remaining = (src.match(/saveConfig\(config\);/g) ?? []).length;
if (remaining !== 7) throw new Error(`expected 7 remaining saveConfig calls, found ${remaining}`);
src = src.replace(
	/saveConfig\(config\);/g,
	"saveConfig(config, undefined, { isGlobal });",
);

/* 5. /apple-config passes the scope through and reports the destination. */
must(
	'  pi.registerCommand("apple-config", {\n    description: "Konfigurace modelů a presetů pro Apple Advisory Board",\n    getArgumentCompletions: () => null,\n    handler: async (_args, ctx) => {\n      await configureHarness(ctx.ui, ctx);\n      refreshAppleStatus(ctx);\n    },\n  });',
	'  pi.registerCommand("apple-config", {\n    description: "Konfigurace modelů a presetů pro Apple Advisory Board",\n    getArgumentCompletions: () => null,\n    handler: async (args, ctx) => {\n      // `--global` is accepted as a prefix or a suffix.\n      const isGlobal = /(^|\\s)--global(\\s|$)/.test(String(args || ""));\n      await configureHarness(ctx.ui, ctx, isGlobal);\n      refreshAppleStatus(ctx);\n      if (ctx.hasUI) {\n        ctx.ui.notify(\n          `Konfigurace uložena do: ${describeScope(isGlobal, ctx.cwd)}`,\n          "info",\n        );\n      }\n    },\n  });',
	"apple-config handler",
);

writeFileSync(FILE, src);
console.log(`index.js: ${before} -> ${src.split("\n").length - 1} lines`);
