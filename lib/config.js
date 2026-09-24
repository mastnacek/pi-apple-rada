import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packagedConfigPath = path.join(packageRoot, "pi-apple-rada.config.json");
const packageJsonPath = path.join(packageRoot, "package.json");

/** agent dir root; PI_CODING_AGENT_DIR overrides it (custom layouts, tests). */
export function agentDir() {
  const override = process.env.PI_CODING_AGENT_DIR?.trim?.();
  return override && override.length > 0
    ? override
    : path.join(os.homedir(), ".pi", "agent");
}

/** Global layer: written by `--global`. */
export const GLOBAL_CONFIG_FILE = path.join(agentDir(), "pi-apple-rada.json");

/** Project layer: written when no `--global` is given. */
export function projectConfigPath(cwd = process.cwd()) {
  return path.join(cwd, ".pi", "pi-apple-rada.json");
}

/** Legacy workspace file, still read (and still updated when it is the origin). */
export function legacyWorkspaceConfigPath(cwd = process.cwd()) {
  return path.join(cwd, "pi-apple-rada.config.json");
}

export function getPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return { name: "pi-apple-rada", version: "1.0.0" };
  }
}

export function getDefaultConfig() {
  try {
    return JSON.parse(fs.readFileSync(packagedConfigPath, "utf8"));
  } catch {
    return { configured: false, providers: {} };
  }
}

/** Raw contents of one layer; null when the file is absent or unreadable. */
function readLayer(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch {
    // Ignore and fall through to the next layer
  }
  return null;
}

/** Layer the effective configuration came from, so saved edits land there. */
let originLayerPath = null;

function mergeLayer(target, layer) {
  if (!layer || typeof layer !== "object") return target;
  const merged = { ...target, ...layer };
  // `providers` is a nested map; merge one level so a layer only overrides the
  // provider entries it actually mentions.
  if (target.providers || layer.providers) {
    merged.providers = { ...(target.providers || {}), ...(layer.providers || {}) };
  }
  return merged;
}

/**
 * Load the configuration cascade:
 *   packaged defaults <- global <- legacy workspace <- <cwd>/.pi/ project layer
 * An explicit `configPath` replaces the cascade entirely.
 * @param {string} [configPath]
 * @param {string} [cwd]
 */
export function loadConfig(configPath, cwd = process.cwd()) {
  if (configPath) {
    originLayerPath = configPath;
    return readLayer(configPath) ?? getDefaultConfig();
  }

  const globalLayer = readLayer(GLOBAL_CONFIG_FILE);
  // The shipped pi-apple-rada.config.json sits next to package.json. When the
  // session cwd IS the package directory it must not be read as a user layer,
  // otherwise a save would overwrite the shipped defaults.
  const legacyPath = legacyWorkspaceConfigPath(cwd);
  const legacyLayer = legacyPath === packagedConfigPath ? null : readLayer(legacyPath);
  const projectPath = projectConfigPath(cwd);
  const projectLayer = readLayer(projectPath);

  // Highest-priority existing layer becomes the write origin, so edits update
  // the file the user already has instead of spawning a second one.
  originLayerPath =
    (projectLayer && projectPath) ||
    (legacyLayer && legacyPath) ||
    (globalLayer && GLOBAL_CONFIG_FILE) ||
    null;

  let config = getDefaultConfig();
  config = mergeLayer(config, globalLayer);
  config = mergeLayer(config, legacyLayer);
  config = mergeLayer(config, projectLayer);
  return config;
}

/**
 * Save the configuration.
 * @param {object} config
 * @param {string} [targetPath] explicit destination (CLI --config) wins
 * @param {{isGlobal?: boolean, cwd?: string}} [options]
 */
export function saveConfig(config, targetPath, options = {}) {
  const cwd = options.cwd || process.cwd();
  // Never write into the shipped defaults file, even if an earlier code path
  // recorded it as the origin layer.
  const origin = originLayerPath === packagedConfigPath ? null : originLayerPath;
  const dest =
    targetPath ||
    (options.isGlobal
      ? GLOBAL_CONFIG_FILE
      : origin || projectConfigPath(cwd));

  try {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf8");
    fs.renameSync(tmp, dest);
    originLayerPath = dest;
    return dest;
  } catch {
    return null;
  }
}

/** Human-readable destination for a scope, used in notifications. */
export function describeScope(isGlobal, cwd = process.cwd()) {
  return isGlobal ? GLOBAL_CONFIG_FILE : originLayerPath || projectConfigPath(cwd);
}

/** Config files have used both apiKeyEnv and apiKeyEnvVar. */
export function apiKeyEnvName(providerConfig) {
  return providerConfig?.apiKeyEnv || providerConfig?.apiKeyEnvVar;
}
