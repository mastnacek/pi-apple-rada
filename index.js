// pi-apple-rada — composition root.
//
// Everything else lives in lib/: auth, providers, status, harness, the config
// wizard, the command handler, completions, tools and the stream provider.
import { appleRadaProvider } from "./lib/stream-provider.js";
import { registerAppleRadaTools } from "./lib/tools.js";
import { getCompletions } from "./lib/completions.js";
import { runAppleCommand } from "./lib/command.js";
import { configureHarness } from "./lib/config-wizard.js";
import { describeScope } from "./lib/config.js";
import { harness } from "./lib/harness-state.js";
import { refreshAppleStatus } from "./lib/status.js";

export default function (pi) {
  /** Unsubscribers from every `pi.on()`; drained on session_shutdown (AGENTS §5). */
  const unsubscribers = [];

  /** Retain a `pi.on()` return value; older engine typings declare it void. */
  const track = (result) => {
    if (typeof result === "function") unsubscribers.push(result);
  };

  track(pi.on("agent_start", (_event, ctx) => {
    harness.activeUi = ctx?.ui;
  }));

  track(pi.on("session_start", (_event, ctx) => {
    refreshAppleStatus(ctx);
  }));

  pi.on("session_shutdown", () => {
    while (unsubscribers.length > 0) unsubscribers.pop()?.();
    harness.activeUi = null;
    harness.lastDeliberation = null;
    harness.activeDeliberation = null;
  });

  registerAppleRadaTools(pi);
  pi.registerProvider("apple-rada", appleRadaProvider());

  pi.registerCommand("apple", {
    description:
      "Svolá Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček -> Verdikt) nebo spravuje konfiguraci",
    getArgumentCompletions: getCompletions,
    handler: runAppleCommand,
  });

  pi.registerCommand("apple-rada", {
    description:
      "Svolá Apple Advisory Board (Jobs, Woz, Ive, Karpathy, mastnáček -> Verdikt) nebo spravuje konfiguraci",
    getArgumentCompletions: getCompletions,
    handler: runAppleCommand,
  });

  pi.registerCommand("apple-config", {
    description: "Konfigurace modelů a presetů pro Apple Advisory Board",
    getArgumentCompletions: () => null,
    handler: async (args, ctx) => {
      // `--global` is accepted as a prefix or a suffix.
      const isGlobal = /(^|\s)--global(\s|$)/.test(String(args || ""));
      await configureHarness(ctx.ui, ctx, isGlobal);
      refreshAppleStatus(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Konfigurace uložena do: ${describeScope(isGlobal, ctx.cwd)}`,
          "info",
        );
      }
    },
  });
}
