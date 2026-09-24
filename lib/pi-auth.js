// Pi credential helpers (auth.json lookup + provider connectivity).
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";

export const getPiAuth = () => {
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

export const isProviderConnected = (provider, auth) => {
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
