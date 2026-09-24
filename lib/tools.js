// The apple_rada LLM tool.
import { getDeliberator } from "./harness.js";

export function registerAppleRadaTools(pi) {
  pi.registerTool({
    name: "apple_rada",
    label: "Apple Advisory Board",
    description:
      "Svolá round-table radu veteránů Applu (Steve Jobs, Steve Wozniak, Jony Ive, Andrej Karpathy) a advokáta kontextu (mastnáček) pro řezavé posouzení architektury, designu, UX, evalů a osekání zbytečností.",
    promptSnippet:
      "Svolat Apple Advisory Board na posouzení nápadu, architektury nebo kódu",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Dotaz, kód, architektonická volba nebo feature k posouzení.",
        },
      },
      required: ["prompt"],
    },
    execute: async (_toolCallId, params) => {
      try {
        const deliberator = getDeliberator();
        const result = await deliberator.deliberate(params.prompt);
        return {
          content: [{ type: "text", text: result.synthesis }],
          details: {
            panelResponses: result.panelResponses,
            contextAdvocate: result.contextAdvocateResponse,
            models: result.models,
            usage: result.usage,
          },
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`Debata Apple rady selhala: ${msg}`);
      }
    },
  });
}
