// Static documentation + tool schema for the Apple Advisory Board.

export const WRITE_TOOL = [
  {
    type: "function",
    function: {
      name: "write",
      description:
        "Write content to a file. Create one file per tool call. Use relative paths from the project root.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to the file to write (relative or absolute)",
          },
          content: {
            type: "string",
            description: "Full content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  },
];

export const APPLE_DOCS = {
  status: "zobrazí aktuální stav konfigurace nebo probíhajícího jednání",
  detail:
    "zobrazí kompletní detailní vyjádření všech person z posledního jednání",
  preset:
    "rychlé přepnutí presetu modelů (glm | zenfree | quality | high | balanced)",
  provider:
    "výběr providera (openrouter | zai-coding-cn | kimi-coding | google | ...)",
  model: "přepsání modelu pro konkrétního člena rady",
  setup: "spustí interaktivního průvodce výběrem modelů",
  help: "zobrazí nápovědu a přehled členů rady",
};
