// Status line refresh and the status/help views.
import { loadConfig } from "./config.js";
import { getLocalConfig } from "./harness.js";
import { getConnectedPiProviders } from "./providers.js";
import { getPiAuth, isProviderConnected } from "./pi-auth.js";

export const refreshAppleStatus = (ctx) => {
  if (!ctx?.hasUI) return;
  const cfg = loadConfig(undefined, ctx.cwd);
  const provider = cfg?.provider || "opencode-go";
  ctx.ui.setStatus("apple-rada", `🍎 rada: ${provider}`);
};

export const showAppleStatus = (ctx) => {
  const config = getLocalConfig(ctx?.cwd);
  const provider = config.provider || "opencode-go";
  const providerConfig = config.providers?.[provider] || {};
  const models = providerConfig.defaultModels || {};
  const auth = getPiAuth();
  const connected = isProviderConnected(provider, auth);

  const lines = [
    "🍎 Apple Advisory Board – Aktuální konfigurace",
    `Provider: ${provider} (${connected ? "připojeno" : "bez klíče"}) [URL: ${providerConfig.baseUrl || "N/A"}]`,
    `Režim: ${config.mode || "standard"}`,
    "",
    "Přiřazení modelů:",
    `  • 🍎 Steve Jobs:       ${models.jobs || "nenastaven"}`,
    `  • 🔧 Steve Wozniak:    ${models.woz || "nenastaven"}`,
    `  • ✏️ Jony Ive:         ${models.ive || "nenastaven"}`,
    `  • 🤖 Andrej Karpathy:  ${models.karpathy || "nenastaven"}`,
    `  • 👤 mastnáček:        ${models.mastnacek || "nenastaven"}`,
    `  • ⚖️ Syntéza/Verdikt:  ${models.synthesis || "nenastaven"}`,
    "",
    "Rychlé přepnutí:",
    "  /apple preset glm|quality|high|balanced",
    "  /apple provider <providerId>",
    "  /apple setup",
  ];

  ctx.ui.notify(lines.join("\n"), "info");
};

export const showAppleHelp = (ctx) => {
  const lines = [
    "🍎 Apple Advisory Board — Nápověda",
    "Multi-model deliberation s veterány Applu a advokátem kontextu.",
    "",
    "Použití:",
    "  /apple <téma / kód / dotaz> — svolá radu na zadané téma",
    "  /apple status               — zobrazí aktuální konfiguraci a modely",
    "  /apple preset <název>       — přepne preset (glm, quality, high, balanced)",
    "  /apple provider <název>     — přepne providera",
    "  /apple model <role> <model> — přenastaví model pro roli",
    "  /apple setup                — spustí interaktivního konfiguračního průvodce",
    "  /apple help                 — zobrazí tuto nápovědu",
    "",
    "Role v radě:",
    "  🍎 Steve Jobs     (Vize, produkt, radikální redukce)",
    "  🔧 Steve Wozniak  (Inženýrství, architektura, otevřenost)",
    "  ✏️ Jony Ive       (Design, UX, emoce, péče / care)",
    "  🤖 Andrej Karpathy(AI/ML, eval-first, Software 2.0/3.0)",
    "  👤 mastnáček      (Advokát kontextu: VSA, Deep Modules, 1 vývojář)",
    "  ⚖️ Verdikt        (Konkrétní akční kroky)",
  ];
  ctx.ui.notify(lines.join("\n"), "info");
};
