// The apple-rada provider definition: model catalog + streaming deliberation.
import { ApiClient } from "./api.js";
import { WRITE_TOOL } from "./apple-docs.js";
import { apiKeyEnvName, getDefaultConfig, loadConfig } from "./config.js";
import { configureHarness } from "./config-wizard.js";
import { Deliberator } from "./deliberation.js";
import { createAssistantMessageEventStream } from "./event-stream.js";
import { getLocalConfig } from "./harness.js";
import { getPiAuth } from "./pi-auth.js";
import { loadPiAi } from "./pi-ai.js";
import { PROVIDERS } from "./presets.js";
import { refreshAppleStatus } from "./status.js";

export function appleRadaProvider() {
  return {
    name: "Apple Advisory Board (Jobs/Woz/Ive/Karpathy/mastnáček)",
    baseUrl: "https://opencode.ai/zen/go/v1",
    apiKey: "dummy",
    api: "apple-rada-api",
    models: [
      {
        id: "apple-rada",
        name: "Apple Advisory Board Model",
        api: "apple-rada-api",
        provider: "apple-rada",
        baseUrl: "https://opencode.ai/zen/go/v1",
        reasoning: false,
        input: ["text"],
        contextWindow: 128000,
        maxTokens: 4096,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      },
    ],
    streamSimple: (model, context, options) => {
      const outer = createAssistantMessageEventStream();

      const lastUserMsg = context.messages
        ?.filter((m) => m.role === "user")
        .pop();
      let prompt = "";
      if (lastUserMsg) {
        if (typeof lastUserMsg.content === "string") {
          prompt = lastUserMsg.content;
        } else if (Array.isArray(lastUserMsg.content)) {
          prompt = lastUserMsg.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        }
      }

      const freshUsage = () => ({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      });
      const baseMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: freshUsage(),
        stopReason: "stop",
        timestamp: Date.now(),
      };
      const msg = (text, extra = {}) => {
        const { usage, ...rest } = extra;
        return {
          ...baseMessage,
          content: [{ type: "text", text }],
          usage: usage || freshUsage(),
          ...rest,
        };
      };
      const addUsageSafe = (total, u) => {
        if (!u) return;
        total.input += u.input || 0;
        total.output += u.output || 0;
        total.cacheRead += u.cacheRead || 0;
        total.cacheWrite += u.cacheWrite || 0;
        total.totalTokens += u.totalTokens || 0;
      };

      queueMicrotask(async () => {
        try {
          const msgs = context.messages || [];
          const writeResults = [];
          for (let i = msgs.length - 1; i >= 0; i--) {
            const m = msgs[i];
            if (m && m.role === "toolResult" && m.toolName === "write")
              writeResults.unshift(m);
            else break;
          }
          if (writeResults.length > 0) {
            const firstResultIdx = msgs.length - writeResults.length - 1;
            const assistantMsg = msgs[firstResultIdx];
            const savedPaths = [];
            for (const wr of writeResults) {
              let pathStr = "";
              if (assistantMsg && Array.isArray(assistantMsg.content)) {
                const tc = assistantMsg.content.find(
                  (c) => c.type === "toolCall" && c.id === wr.toolCallId,
                );
                if (tc?.arguments?.path) pathStr = tc.arguments.path;
              }
              savedPaths.push(pathStr);
            }
            const known = savedPaths.filter(Boolean);
            const confirmText =
              known.length > 0
                ? `✅ Uloženo ${known.length} soubor${known.length > 1 ? "ů" : ""}:\n` +
                  known.map((p) => `  • \`${p}\``).join("\n")
                : `✅ Uloženo ${writeResults.length} soubor${writeResults.length > 1 ? "ů" : ""}.`;
            outer.push({
              type: "start",
              partial: { ...baseMessage, content: [], usage: freshUsage() },
            });
            outer.push({
              type: "text_start",
              contentIndex: 0,
              partial: msg(""),
            });
            outer.push({
              type: "text_delta",
              contentIndex: 0,
              delta: confirmText,
              partial: msg(confirmText),
            });
            outer.push({
              type: "text_end",
              contentIndex: 0,
              content: confirmText,
              partial: msg(confirmText),
            });
            const done = msg(confirmText);
            outer.push({ type: "done", reason: "stop", message: done });
            outer.end(done);
            return;
          }

          if (options?.signal?.aborted) {
            const m = msg("", {
              stopReason: "aborted",
              errorMessage: "aborted",
            });
            outer.push({ type: "error", reason: "aborted", error: m });
            outer.end(m);
            return;
          }

          let config = getLocalConfig();
          if (!config || !config.configured) {
            config = getDefaultConfig();
          }

          if (options?.onResponse) {
            await options.onResponse({ status: 200, headers: {} }, model);
          }

          const provider = config.provider || "opencode-go";
          const providerConfig = config.providers?.[provider] || {};

          let apiKey = config.apiKey || "";
          const auth = getPiAuth();
          if (auth[provider]) {
            apiKey =
              auth[provider].key ||
              auth[provider].access ||
              auth[provider].token ||
              apiKey;
          }

          const apiClient = new ApiClient({
            provider: provider,
            baseUrl: providerConfig?.baseUrl || PROVIDERS[provider]?.baseUrl,
            apiKeyEnvVar: apiKeyEnvName(providerConfig),
            apiKey: apiKey,
          });

          let streamedText = "";
          const sendDelta = (text) => {
            streamedText += text;
            outer.push({
              type: "text_delta",
              contentIndex: 0,
              delta: text,
              partial: msg(streamedText),
            });
          };

          outer.push({
            type: "start",
            partial: { ...baseMessage, content: [], usage: freshUsage() },
          });
          outer.push({ type: "text_start", contentIndex: 0, partial: msg("") });

          sendDelta(
            "🍎 **Svolávám Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček)**\n",
          );

          let synthesisStreamed = false;

          const deliberator = new Deliberator({ apiClient, config });
          const result = await deliberator.deliberate(prompt, {
            onProgress: (stage, data) => {
              if (stage === "panel-start") {
                sendDelta(
                  ` ├─ ⏳ Běží poradní panel: Jobs (${data.models.jobs}), Woz (${data.models.woz}), Ive (${data.models.ive}), Karpathy (${data.models.karpathy})...\n`,
                );
              } else if (stage === "panel-end") {
                sendDelta(` ├─ ✅ Vyjádření poradců přijata.\n`);
              } else if (stage === "context-start") {
                sendDelta(
                  ` ├─ 👤 Advokát kontextu mastnáček & křížová palba (${data.model})...\n`,
                );
              } else if (stage === "context-end") {
                sendDelta(` ├─ ✅ Uzemnění na realitu zpracováno.\n`);
              } else if (stage === "synthesis-start") {
                sendDelta(
                  ` ├─ ⚖️ Sestavuji finální verdikt Apple rady (${data.model})...\n\n`,
                );
              } else if (stage === "synthesis-end") {
                if (!synthesisStreamed && data.synthesis) {
                  sendDelta(data.synthesis);
                }
                sendDelta("\n\n---\n\n");
              }
            },
            onSynthesisDelta: (delta) => {
              synthesisStreamed = true;
              sendDelta(delta);
            },
          });

          if (options?.signal?.aborted) {
            const m = msg(streamedText, {
              stopReason: "aborted",
              errorMessage: "aborted",
            });
            outer.push({ type: "error", reason: "aborted", error: m });
            outer.end(m);
            return;
          }

          const finalUsage = result.usage || freshUsage();
          outer.push({
            type: "text_end",
            contentIndex: 0,
            content: streamedText,
            partial: msg(streamedText, { usage: finalUsage }),
          });

          // Optional file agent
          const fileAgentModel = config.fileAgentModel || "deepseek-v4-flash";
          let fileAgentResult;
          try {
            fileAgentResult = await apiClient.chatCompletion({
              model: fileAgentModel,
              temperature: 0.2,
              messages: [
                {
                  role: "system",
                  content:
                    "You are a file-saving agent. You receive an advisory synthesis that may contain code or file changes. Use the write tool to save every file the user would expect from the original request. If the synthesis contains no files to save (e.g. conceptual advice), do NOT call any tool — reply with a brief one-line confirmation.",
                },
                {
                  role: "user",
                  content: `Original user request: ${prompt}\n\nAdvisory synthesis:\n${result.synthesis}\n\nSave the file(s) now using the write tool, or confirm if nothing needs saving.`,
                },
              ],
              tools: WRITE_TOOL,
              onDelta: (delta) => {
                if (delta) sendDelta(delta);
              },
            });
          } catch {
            const finalMessage = msg(streamedText, { usage: finalUsage });
            outer.push({ type: "done", reason: "stop", message: finalMessage });
            outer.end(finalMessage);
            return;
          }
          addUsageSafe(finalUsage, fileAgentResult.usage);

          try {
            const { calculateCost } = await loadPiAi();
            calculateCost(model, finalUsage);
          } catch {
            // calculateCost is optional
          }

          const toolCalls = fileAgentResult.toolCalls || [];
          const contentBlocks = [{ type: "text", text: streamedText }];
          for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const tcBlock = {
              type: "toolCall",
              id: tc.id || `call_${Date.now()}_${i}`,
              name: tc.name,
              arguments: tc.arguments,
            };
            contentBlocks.push(tcBlock);
            outer.push({
              type: "toolcall_start",
              contentIndex: 1 + i,
              partial: {
                ...baseMessage,
                content: [...contentBlocks],
                usage: finalUsage,
                stopReason: "toolUse",
              },
            });
            outer.push({
              type: "toolcall_end",
              contentIndex: 1 + i,
              toolCall: tcBlock,
              partial: {
                ...baseMessage,
                content: [...contentBlocks],
                usage: finalUsage,
                stopReason: "toolUse",
              },
            });
          }

          const stopReason = toolCalls.length > 0 ? "toolUse" : "stop";
          const finalMessage = {
            ...baseMessage,
            content: contentBlocks,
            usage: finalUsage,
            stopReason,
          };
          outer.push({
            type: "done",
            reason: stopReason,
            message: finalMessage,
          });
          outer.end(finalMessage);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          const m = msg(`Chyba při běhu Apple rady: ${errMsg}`, {
            stopReason: "error",
            errorMessage: errMsg,
          });
          outer.push({ type: "error", reason: "error", error: m });
          outer.end(m);
        }
      });

      return outer;
    },
  };
}
