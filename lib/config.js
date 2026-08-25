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

export const GLOBAL_CONFIG_FILE = path.join(
  process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent"),
  "pi-apple-rada.json",
);

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

/**
 * Load a workspace, global or explicit config file, falling back to the packaged default.
 * @param {string} [configPath]
 */
export function loadConfig(configPath) {
  const candidates = [
    configPath,
    path.join(process.cwd(), "pi-apple-rada.config.json"),
    path.join(process.cwd(), "pi-harness.config.json"),
    GLOBAL_CONFIG_FILE,
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      }
    } catch {
      // Ignore and check next path
    }
  }

  return getDefaultConfig();
}

/**
 * Save configuration to local workspace if exists, otherwise global config.
 * @param {object} config
 * @param {string} [targetPath]
 */
export function saveConfig(config, targetPath) {
  const dest =
    targetPath ||
    (fs.existsSync(path.join(process.cwd(), "pi-apple-rada.config.json"))
      ? path.join(process.cwd(), "pi-apple-rada.config.json")
      : GLOBAL_CONFIG_FILE);

  try {
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(config, null, 2), "utf8");
    return dest;
  } catch {
    return null;
  }
}

/** Config files have used both apiKeyEnv and apiKeyEnvVar. */
export function apiKeyEnvName(providerConfig) {
  return providerConfig?.apiKeyEnv || providerConfig?.apiKeyEnvVar;
}
