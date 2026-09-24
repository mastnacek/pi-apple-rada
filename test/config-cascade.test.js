import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// The package root ships pi-apple-rada.config.json; it must never be treated as
// a user config layer, so tests read it but never write it.
const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const packagedFile = join(pluginRoot, "pi-apple-rada.config.json");

// lib/config.js derives GLOBAL_CONFIG_FILE at import time, so the agent dir has
// to be redirected before the module is loaded — hence the dynamic import.
const root = mkdtempSync(join(tmpdir(), "pi-apple-rada-cascade-"));
const agentDir = join(root, "agent");
const projectDir = join(root, "project");
fs.mkdirSync(agentDir, { recursive: true });
fs.mkdirSync(join(projectDir, ".pi"), { recursive: true });
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
process.env.PI_CODING_AGENT_DIR = agentDir;

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

describe("pi-apple-rada config cascade", () => {
	let config;

	before(async () => {
		config = await import("../lib/config.js");
	});

	after(() => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		rmSync(root, { recursive: true, force: true });
	});

	it("points the layers at the redirected agent dir and the project .pi dir", () => {
		assert.equal(config.GLOBAL_CONFIG_FILE, join(agentDir, "pi-apple-rada.json"));
		assert.equal(
			config.projectConfigPath(projectDir),
			join(projectDir, ".pi", "pi-apple-rada.json"),
		);
		assert.equal(
			config.legacyWorkspaceConfigPath(projectDir),
			join(projectDir, "pi-apple-rada.config.json"),
		);
	});

	it("merges global then project, the project layer winning per key", () => {
		write(config.GLOBAL_CONFIG_FILE, {
			provider: "global-prov",
			mode: "global-mode",
			providers: { a: { baseUrl: "g" } },
		});
		write(config.projectConfigPath(projectDir), {
			provider: "project-prov",
			providers: { b: { baseUrl: "p" } },
		});

		const cfg = config.loadConfig(undefined, projectDir);
		assert.equal(cfg.provider, "project-prov", "the project layer must win");
		assert.equal(cfg.mode, "global-mode", "untouched global keys must survive");
		// The packaged defaults also contribute a providers map, so assert the
		// per-entry merge rather than the exact key set.
		assert.deepEqual(cfg.providers.a, { baseUrl: "g" }, "global provider entry must survive");
		assert.deepEqual(cfg.providers.b, { baseUrl: "p" }, "project provider entry must be added");
	});

	it("reads the legacy workspace file below the project layer", () => {
		fs.rmSync(config.projectConfigPath(projectDir), { force: true });
		write(config.legacyWorkspaceConfigPath(projectDir), { provider: "legacy-prov" });

		assert.equal(config.loadConfig(undefined, projectDir).provider, "legacy-prov");
	});

	it("keeps editing the layer it loaded from instead of migrating silently", () => {
		fs.rmSync(config.projectConfigPath(projectDir), { force: true });
		write(config.legacyWorkspaceConfigPath(projectDir), { provider: "legacy-prov" });

		const cfg = config.loadConfig(undefined, projectDir);
		cfg.mode = "edited";
		const dest = config.saveConfig(cfg, undefined, { cwd: projectDir });

		assert.equal(
			dest,
			config.legacyWorkspaceConfigPath(projectDir),
			"an existing workspace file must keep receiving the edits",
		);
		assert.equal(read(dest).mode, "edited");
		assert.equal(
			fs.existsSync(config.projectConfigPath(projectDir)),
			false,
			"no second config file may appear",
		);
	});

	it("writes the global layer when --global is given", () => {
		const cfg = config.loadConfig(undefined, projectDir);
		const dest = config.saveConfig(cfg, undefined, { isGlobal: true, cwd: projectDir });

		assert.equal(dest, config.GLOBAL_CONFIG_FILE);
		assert.equal(read(config.GLOBAL_CONFIG_FILE).mode, cfg.mode);
	});

	it("creates the project layer when no layer exists yet", () => {
		const freshDir = join(root, "fresh");
		fs.mkdirSync(freshDir, { recursive: true });
		fs.rmSync(config.GLOBAL_CONFIG_FILE, { force: true });

		const cfg = config.loadConfig(undefined, freshDir);
		const dest = config.saveConfig(cfg, undefined, { cwd: freshDir });

		assert.equal(
			dest,
			config.projectConfigPath(freshDir),
			"the default scope for a new config is the project layer",
		);
		assert.equal(fs.existsSync(dest), true);
	});

	it("lets an explicit path replace the whole cascade", () => {
		const explicit = join(root, "explicit.json");
		write(explicit, { provider: "explicit-prov" });

		assert.equal(config.loadConfig(explicit, projectDir).provider, "explicit-prov");
		assert.equal(config.saveConfig({ provider: "x" }, explicit), explicit);
		assert.equal(read(explicit).provider, "x");
	});

	it("describes the destination for a scope", () => {
		assert.equal(config.describeScope(true, projectDir), config.GLOBAL_CONFIG_FILE);

		// With no existing layer the origin is cleared, so the default scope is the
		// project layer; make the expectation independent of the earlier tests.
		const freshDir = join(root, "scope-fresh");
		fs.mkdirSync(freshDir, { recursive: true });
		fs.rmSync(config.projectConfigPath(freshDir), { force: true });
		fs.rmSync(config.legacyWorkspaceConfigPath(freshDir), { force: true });
		fs.rmSync(config.GLOBAL_CONFIG_FILE, { force: true });
		config.loadConfig(undefined, freshDir);

		assert.equal(config.describeScope(false, freshDir), config.projectConfigPath(freshDir));
	});

	it("never treats the shipped packaged config as a config layer", () => {
		// Regression: with the package dir as cwd, the shipped
		// pi-apple-rada.config.json used to qualify as a workspace layer, so a save
		// rewrote the shipped defaults.
		const before = fs.readFileSync(packagedFile, "utf8");
		config.loadConfig(undefined, pluginRoot);

		assert.notEqual(
			config.describeScope(false, pluginRoot),
			packagedFile,
			"the shipped defaults must never be a config layer or write target",
		);
		assert.equal(
			fs.readFileSync(packagedFile, "utf8"),
			before,
			"reading must leave the shipped defaults byte-identical",
		);
	});
});
