import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const config = JSON.parse(
  fs.readFileSync(path.join(root, "pi-apple-rada.config.json"), "utf8"),
);

describe("syntax", () => {
  it("parses shipped JS with node --check", () => {
    const files = [
      "index.js",
      "bin/pi-apple-rada.js",
      "lib/api.js",
      "lib/config.js",
      "lib/deliberation.js",
      "lib/event-stream.js",
      "lib/pi-ai.js",
      "lib/presets.js",
      "lib/ui.js",
      "test/offline.test.js",
    ];
    for (const file of files) {
      const result = spawnSync(
        process.execPath,
        ["--check", path.join(root, file)],
        {
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, `${file}: ${result.stderr}`);
    }
  });
});

describe("package metadata", () => {
  it("declares @earendil-works/pi-ai as an optional peer", () => {
    assert.equal(pkg.peerDependencies["@earendil-works/pi-ai"], "*");
    assert.equal(
      pkg.peerDependenciesMeta["@earendil-works/pi-ai"].optional,
      true,
    );
  });

  it("exports the Pi extension as the package default", () => {
    assert.equal(pkg.exports["."], "./index.js");
    assert.equal(pkg.exports["./index.js"], "./index.js");
    assert.deepEqual(pkg.pi.extensions, ["./index.js"]);
  });

  it("points npm test at files shipped in the package", () => {
    assert.match(pkg.scripts.test, /test\/offline\.test\.js/);
    assert.ok(pkg.files.includes("test/"));
  });
});

describe("default config", () => {
  it("has default models for all veterans and advocates on OpenCode Go", () => {
    assert.equal(config.provider, "opencode-go");
    const models = config.providers["opencode-go"].defaultModels;
    for (const role of [
      "jobs",
      "woz",
      "ive",
      "karpathy",
      "mastnacek",
      "synthesis",
    ]) {
      assert.equal(models[role], "glm-5.3", role);
    }
    assert.equal(
      config.providers["opencode-go"].baseUrl,
      "https://opencode.ai/zen/go/v1",
    );
  });

  it("has panel prompts for Jobs, Woz, Ive, Karpathy, mastnáček, and synthesis", () => {
    assert.ok(config.panel.jobs.systemPrompt.includes("Steve Jobs"));
    assert.ok(config.panel.woz.systemPrompt.includes("Steve Wozniak"));
    assert.ok(config.panel.ive.systemPrompt.includes("Jony Ive"));
    assert.ok(config.panel.karpathy.systemPrompt.includes("Andrej Karpathy"));
    assert.ok(config.contextAdvocate.systemPrompt.includes("mastnáček"));
    assert.ok(config.synthesis.systemPrompt.includes("Verdikt"));
  });

  it("puts grok-4.6 on OpenCode Zen, not Go", () => {
    const zen = config.providers["opencode-zen"];
    assert.equal(zen.baseUrl, "https://opencode.ai/zen/v1");
    assert.equal(zen.defaultModels.jobs, "grok-4.6");
    assert.equal(zen.defaultModels.synthesis, "grok-4.6");
    assert.equal(zen.defaultModels.ive, "gpt-5.6-luna");
    assert.equal(zen.defaultModels.karpathy, "gpt-5.6-luna");
    assert.equal(zen.defaultModels.woz, "kimi-k3");
  });
});

describe("presets", () => {
  it("keeps Go presets on Go ids and Quality on Zen grok-4.6", async () => {
    const { PRESETS, applyPreset } = await import(
      pathToFileUrl(path.join(root, "lib/presets.js"))
    );
    assert.equal(PRESETS.glmRada.provider, "opencode-go");
    assert.equal(PRESETS.glmRada.defaultModels.jobs, "glm-5.3");
    assert.equal(PRESETS.balanced.defaultModels.jobs, "kimi-k3");
    assert.equal(PRESETS.balanced.defaultModels.karpathy, "deepseek-v4-pro");
    assert.equal(PRESETS.highQuality.defaultModels.woz, "qwen3.8-max");
    assert.equal(PRESETS.quality.provider, "opencode-zen");
    assert.equal(PRESETS.quality.defaultModels.jobs, "grok-4.6");

    const applied = applyPreset({ providers: {} }, PRESETS.quality);
    assert.equal(
      applied.providers["opencode-zen"].baseUrl,
      "https://opencode.ai/zen/v1",
    );
    assert.ok(!JSON.stringify(PRESETS.glmRada).includes("grok-4.6"));
    assert.ok(!JSON.stringify(PRESETS.balanced).includes("grok-4.6"));
  });
});

describe("CLI", () => {
  it("--version matches package.json", () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "bin/pi-apple-rada.js"), "--version"],
      {
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), pkg.version);
  });
});

describe("Pi entry", () => {
  it("loads without @earendil-works/pi-ai installed", async () => {
    const spec = pathToFileUrl(path.join(root, "index.js"));
    const mod = await import(spec);
    assert.equal(typeof mod.default, "function");

    const registered = { commands: [], tools: [], providers: [] };
    mod.default({
      on() {},
      registerCommand(name) {
        registered.commands.push(name);
      },
      registerTool(tool) {
        registered.tools.push(tool.name);
      },
      registerProvider(name) {
        registered.providers.push(name);
      },
    });
    assert.ok(registered.commands.includes("apple"));
    assert.ok(registered.commands.includes("apple-rada"));
    assert.ok(registered.commands.includes("apple-config"));
    assert.ok(registered.tools.includes("apple_rada"));
    assert.ok(registered.providers.includes("apple-rada"));
  });
});

function pathToFileUrl(filePath) {
  let resolved = path.resolve(filePath);
  if (path.sep === "\\") resolved = resolved.replace(/\\/g, "/");
  if (!resolved.startsWith("/")) resolved = `/${resolved}`;
  return `file://${resolved}`;
}
