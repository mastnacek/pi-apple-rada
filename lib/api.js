import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { PROVIDERS } from "./presets.js";

const getPiAuthKey = (provider) => {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
  const authPath = path.join(agentDir, "auth.json");
  if (fs.existsSync(authPath)) {
    try {
      const auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
      const p = auth[provider];
      if (p) {
        return p.key || p.access || p.token || "";
      }
    } catch {
      // Ignore
    }
  }
  return "";
};

/**
 * API client to communicate with OpenAI-compatible endpoints.
 */
export class ApiClient {
  /**
   * @param {object} config
   * @param {string} [config.provider]
   * @param {string} [config.baseUrl]
   * @param {string} [config.apiKey]
   * @param {string} [config.apiKeyEnvVar]
   */
  constructor(config = {}) {
    this.provider = config.provider || "";
    this.baseUrl =
      config.baseUrl ||
      (this.provider ? PROVIDERS[this.provider]?.baseUrl : "") ||
      "https://opencode.ai/zen/go/v1";

    // Resolve API key
    const envVarName =
      config.apiKeyEnvVar ||
      (this.provider ? PROVIDERS[this.provider]?.apiKeyEnv : "") ||
      "OC_GO_CC_API_KEY";
    this.apiKey = config.apiKey || process.env[envVarName] || "";

    // Check direct Pi auth token
    if (!this.apiKey && this.provider) {
      this.apiKey = getPiAuthKey(this.provider);
    }

    const opencodeEnvFallbacks = [
      "OPENCODE_API_KEY",
      "ZEN_API_KEY",
      "OC_GO_CC_API_KEY",
    ];
    if (!this.apiKey && this.baseUrl.includes("opencode.ai")) {
      for (const name of opencodeEnvFallbacks) {
        if (process.env[name]) {
          this.apiKey = process.env[name];
          break;
        }
      }
    }

    if (!this.apiKey) {
      const authProviders = [];
      if (this.baseUrl.includes("/zen/go")) {
        authProviders.push("opencode-go", "opencode", "opencode-zen");
      } else if (this.baseUrl.includes("opencode.ai")) {
        authProviders.push("opencode-zen", "opencode", "opencode-go");
      } else if (
        this.baseUrl.includes("openrouter.ai") ||
        envVarName.includes("OPENROUTER")
      ) {
        authProviders.push("openrouter");
      } else if (
        this.baseUrl.includes("bigmodel.cn") ||
        envVarName.includes("ZAI")
      ) {
        authProviders.push("zai-coding-cn", "zai");
      } else if (
        this.baseUrl.includes("moonshot") ||
        this.baseUrl.includes("kimi")
      ) {
        authProviders.push("kimi-coding", "moonshotai");
      } else if (
        envVarName === "OPENAI_API_KEY" ||
        this.baseUrl.includes("api.openai.com")
      ) {
        authProviders.push("openai");
      } else if (
        envVarName === "XAI_API_KEY" ||
        this.baseUrl.includes("api.x.ai")
      ) {
        authProviders.push("xai");
      } else if (this.baseUrl.includes("11434")) {
        authProviders.push("ollama");
      }
      for (const p of authProviders) {
        this.apiKey = getPiAuthKey(p);
        if (this.apiKey) break;
      }
    }

    if (!this.apiKey) {
      if (
        process.env.OPENROUTER_API_KEY &&
        this.baseUrl.includes("openrouter")
      ) {
        this.apiKey = process.env.OPENROUTER_API_KEY;
      } else if (process.env.OPENAI_API_KEY) {
        this.apiKey = process.env.OPENAI_API_KEY;
        if (!config.baseUrl) {
          this.baseUrl =
            process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
        }
      }
    }

    // Default dummy for local ollama and free zenfree
    if (!this.apiKey && this.baseUrl.includes('11434')) {
      this.apiKey = 'ollama';
    }
    if (!this.apiKey && (this.provider === 'zenfree' || this.baseUrl.includes('opencode.ai/zen/v1'))) {
      this.apiKey = 'public';
    }

    let keySource = "none";
    if (config.apiKey) {
      keySource = "explicit config";
    } else if (process.env[envVarName]) {
      keySource = `env var ${envVarName}`;
    } else if (this.provider && getPiAuthKey(this.provider)) {
      keySource = `Pi auth.json (${this.provider})`;
    } else if (process.env.OPENAI_API_KEY) {
      keySource = "fallback env var OPENAI_API_KEY";
    }

    const obfKey = this.apiKey
      ? `${this.apiKey.slice(0, 5)}...${this.apiKey.slice(Math.max(0, this.apiKey.length - 5))}`
      : "None";
    if (process.env.DEBUG) {
      console.warn(
        `[ApiClient] Resolved API Key for ${this.provider || this.baseUrl} from ${keySource}: ${obfKey}`,
      );
    }
  }

  /**
   * Sends a chat completion request to the configured API endpoint.
   * @param {object} params
   * @param {string} params.model
   * @param {Array<object>} params.messages
   * @param {number} [params.temperature]
   * @param {number} [params.maxTokens]
   * @param {boolean} [params.jsonMode]
   * @param {function} [params.onDelta] Called with each content token chunk as it streams.
   * @param {Array} [params.tools] OpenAI-format tool definitions.
   * @param {string} [params.toolChoice] OpenAI tool_choice value.
   * @returns {Promise<{content: string, usage: object, toolCalls: Array<{id, name, arguments}>}>}
   */
  async chatCompletion(
    {
      model,
      messages,
      temperature = 0.7,
      maxTokens,
      jsonMode = false,
      onDelta,
      tools,
      toolChoice,
    },
    attempt = 1,
  ) {
    if (!this.apiKey) {
      throw new Error(
        `API klíč pro provider "${this.provider || this.baseUrl}" nebyl nalezen. Připoj provider v Pi nebo nastav env proměnnou.`,
      );
    }

    const url = `${this.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const requestBody = {
      model,
      messages,
      temperature,
    };

    if (maxTokens) {
      requestBody.max_tokens = maxTokens;
    }

    if (jsonMode && !this.baseUrl.includes("opencode.ai")) {
      requestBody.response_format = { type: "json_object" };
    }

    if (tools) {
      requestBody.tools = tools;
      if (toolChoice) requestBody.tool_choice = toolChoice;
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
      'Connection': 'keep-alive',
      'User-Agent': 'opencode/1.18.18 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14',
    };

    try {
      requestBody.stream = true;
      requestBody.stream_options = { include_usage: true };

      const liveOnDelta = attempt === 1 ? onDelta : undefined;

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = `HTTP ${response.status} ${response.statusText}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error && parsed.error.message) {
            errorMsg = parsed.error.message;
          }
        } catch {
          errorMsg = errorText || errorMsg;
        }
        throw new Error(`API call failed: ${errorMsg}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulatedContent = "";
      const toolCallAccum = new Map();
      const usage = {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.usage) {
              usage.input = parsed.usage.prompt_tokens ?? usage.input;
              usage.output = parsed.usage.completion_tokens ?? usage.output;
              usage.totalTokens =
                parsed.usage.total_tokens ?? usage.input + usage.output;
              if (parsed.usage.prompt_tokens_details?.cached_tokens != null) {
                usage.cacheRead =
                  parsed.usage.prompt_tokens_details.cached_tokens;
              }
            }
            const delta = parsed.choices?.[0]?.delta;
            if (delta) {
              if (delta.content) {
                accumulatedContent += delta.content;
                if (liveOnDelta) liveOnDelta(delta.content);
              }
              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const acc = toolCallAccum.get(idx) || {
                    id: "",
                    name: "",
                    arguments: "",
                  };
                  if (tc.id) acc.id = tc.id;
                  if (tc.function?.name) acc.name = tc.function.name;
                  if (tc.function?.arguments)
                    acc.arguments += tc.function.arguments;
                  toolCallAccum.set(idx, acc);
                }
              }
            }
          } catch {
            // Ignore incomplete line parse failures
          }
        }
      }

      const toolCalls = [...toolCallAccum.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, acc]) => {
          let args = {};
          try {
            args = JSON.parse(acc.arguments);
          } catch {
            args = {};
          }
          return { id: acc.id, name: acc.name, arguments: args };
        });

      if (!accumulatedContent && toolCalls.length === 0 && !usage.totalTokens) {
        throw new Error(
          "Malformed API response: no streamed content, tool calls, or usage data received.",
        );
      }

      return { content: accumulatedContent, usage, toolCalls };
    } catch (error) {
      const isTransient =
        error.message.includes("fetch failed") ||
        error.message.includes("closed") ||
        error.message.includes("hang up") ||
        error.message.includes("reset") ||
        error.message.includes("ENOTFOUND");

      if (attempt < 5 && isTransient) {
        const backoffMs = attempt * 2000;
        const cause = error.cause
          ? ` (Cause: ${error.cause.message || error.cause})`
          : "";
        console.warn(
          `\n⚠️ [ApiClient] Request failed (attempt ${attempt}): ${error.message}${cause}. Retrying in ${backoffMs / 1000} seconds...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        return this.chatCompletion(
          {
            model,
            messages,
            temperature,
            maxTokens,
            jsonMode,
            tools,
            toolChoice,
          },
          attempt + 1,
        );
      }

      const causeStr = error.cause
        ? ` (Cause: ${error.cause.message || error.cause})`
        : "";
      throw new Error(`[ApiClient Error] ${error.message}${causeStr}`);
    }
  }

  /**
   * Helper to verify if the API connection and credentials are valid.
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const url = `${this.baseUrl.replace(/\/$/, "")}/models`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
