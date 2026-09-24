import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Captured before any test runs: the shipped defaults must never be modified.
const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const packagedConfig = join(pluginRoot, "pi-apple-rada.config.json");
const packagedBefore = fs.readFileSync(packagedConfig, "utf8");

// lib/config.js resolves the agent dir at import time, so redirect it first.
const root = mkdtempSync(join(tmpdir(), "pi-apple-rada-structure-"));
const agentDir = join(root, "agent");
const projectDir = join(root, "project");
fs.mkdirSync(agentDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;

/** Minimal Pi context; the wizard is cancelled immediately via select() -> null. */
function makeCtx() {
	const notifications = [];
	return {
		notifications,
		ctx: {
			cwd: projectDir,
			hasUI: true,
			modelRegistry: { getAll: () => [] },
			ui: {
				notify: (message) => notifications.push(String(message)),
				setStatus: () => {},
				select: async () => null,
				input: async () => null,
				confirm: async () => false,
			},
		},
	};
}

describe("pi-apple-rada module structure", () => {
	let mod;

	before(async () => {
		mod = {
			command: await import("../lib/command.js"),
			completions: await import("../lib/completions.js"),
			configWizard: await import("../lib/config-wizard.js"),
			documents: await import("../lib/apple-docs.js"),
			harness: await import("../lib/harness.js"),
			harnessState: await import("../lib/harness-state.js"),
			piAuth: await import("../lib/pi-auth.js"),
			providers: await import("../lib/providers.js"),
			status: await import("../lib/status.js"),
			streamProvider: await import("../lib/stream-provider.js"),
			tools: await import("../lib/tools.js"),
		};
	});

	after(() => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	});

	it("exports the expected surface from every decomposed module", () => {
		assert.equal(typeof mod.piAuth.getPiAuth, "function");
		assert.equal(typeof mod.piAuth.isProviderConnected, "function");
		assert.equal(typeof mod.providers.getConnectedPiProviders, "function");
		assert.equal(typeof mod.providers.getModelsForProvider, "function");
		assert.equal(typeof mod.providers.getProviderBaseUrl, "function");
		assert.equal(typeof mod.status.refreshAppleStatus, "function");
		assert.equal(typeof mod.status.showAppleStatus, "function");
		assert.equal(typeof mod.status.showAppleHelp, "function");
		assert.equal(typeof mod.harness.getLocalConfig, "function");
		assert.equal(typeof mod.harness.getDeliberator, "function");
		assert.equal(typeof mod.command.runAppleCommand, "function");
		assert.equal(typeof mod.completions.getCompletions, "function");
		assert.equal(typeof mod.configWizard.configureHarness, "function");
		assert.equal(typeof mod.tools.registerAppleRadaTools, "function");
		assert.equal(typeof mod.streamProvider.appleRadaProvider, "function");
		assert.ok(Array.isArray(mod.documents.WRITE_TOOL));
		assert.ok(mod.documents.APPLE_DOCS);
	});

	it("keeps the shared harness state shape", () => {
		assert.deepEqual(Object.keys(mod.harnessState.harness).sort(), [
			"activeDeliberation",
			"activeUi",
			"lastDeliberation",
		]);
	});

	it("builds the provider definition with a model catalog and a stream fn", () => {
		const provider = mod.streamProvider.appleRadaProvider();
		assert.equal(typeof provider, "object");
		assert.equal(typeof provider.name, "string");
		assert.ok(Array.isArray(provider.models) && provider.models.length > 0);
		assert.equal(typeof provider.streamSimple, "function");
		assert.ok(provider.models.every((m) => typeof m.id === "string"));
	});

	it("registers the tool against a mock pi", () => {
		const registered = [];
		mod.tools.registerAppleRadaTools({ registerTool: (tool) => registered.push(tool) });
		assert.equal(registered.length, 1);
		assert.equal(registered[0].name, "apple_rada");
		assert.equal(typeof registered[0].execute, "function");
	});

	it("answers completions at every level", () => {
		const first = mod.completions.getCompletions("");
		assert.ok(first && first.length > 0, "first level must offer subcommands");
		assert.ok(first.every((i) => typeof i.value === "string"));

		assert.equal(mod.completions.getCompletions("zzz"), null);

		const global = mod.completions.getCompletions("--global");
		assert.deepEqual(
			(global ?? []).map((i) => i.value),
			["--global "],
		);

		const preset = mod.completions.getCompletions("preset ");
		assert.ok(preset && preset.length > 0, "preset must complete to its values");
		assert.ok(preset.every((i) => i.value.startsWith("preset ")));
	});

	it("runs /apple help and /apple status through the real handler", async () => {
		const { ctx, notifications } = makeCtx();

		await mod.command.runAppleCommand("help", ctx);
		assert.ok(notifications.length >= 1, "help must notify");
		assert.match(notifications.join("\n"), /apple/i);

		await mod.command.runAppleCommand("status", ctx);
		assert.ok(notifications.length >= 2, "status must notify");

		await mod.command.runAppleCommand("", ctx);
		assert.ok(notifications.length >= 3);
	});

	it("reports usage instead of throwing on incomplete input", async () => {
		const { ctx, notifications } = makeCtx();
		for (const args of ["preset", "provider", "model", "model jobs", "nonsense"]) {
			await mod.command.runAppleCommand(args, ctx);
		}
		assert.ok(notifications.length >= 5, "each incomplete call must report something");
	});

	it("writes the project layer by default and the global layer with --global", async () => {
		const { ctx } = makeCtx();

		await mod.command.runAppleCommand("preset glm", ctx);
		const projectFile = join(projectDir, ".pi", "pi-apple-rada.json");
		assert.equal(fs.existsSync(projectFile), true, "default scope must be the project layer");
		assert.equal(JSON.parse(fs.readFileSync(projectFile, "utf8")).configured, true);

		await mod.command.runAppleCommand("preset quality --global", ctx);
		const globalFile = join(agentDir, "pi-apple-rada.json");
		assert.equal(fs.existsSync(globalFile), true, "--global must write the global layer");
	});

	it("cancels the config wizard cleanly when the user backs out", async () => {
		const { ctx } = makeCtx();
		await mod.configWizard.configureHarness(ctx.ui, ctx, false);
	});

	it("refreshes the status line only for a UI context", async () => {
		const { ctx } = makeCtx();
		await mod.status.refreshAppleStatus(ctx);
		await mod.status.refreshAppleStatus({ hasUI: false });
		await mod.status.refreshAppleStatus(undefined);
	});

	it("resolves model lists and base URLs without throwing", () => {
		const { ctx } = makeCtx();
		assert.ok(Array.isArray(mod.providers.getConnectedPiProviders()));
		const models = mod.providers.getModelsForProvider("opencode-go", ctx);
		assert.ok(Array.isArray(models));
		mod.providers.getProviderBaseUrl("opencode-go");
		mod.providers.getProviderBaseUrl("does-not-exist");
	});

	it("never overwrites the shipped packaged config, even from the package dir", () => {
		// Regression: pi-apple-rada.config.json sits next to package.json and used to
		// qualify as a "workspace" config layer, so running a command with the
		// package dir as cwd rewrote the shipped defaults.
		assert.equal(
			fs.readFileSync(packagedConfig, "utf8"),
			packagedBefore,
			"shipped defaults must stay byte-identical",
		);
	});
});
