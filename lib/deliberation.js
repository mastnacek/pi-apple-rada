/**
 * Apple Advisory Board multi-model deliberation manager (Jobs, Woz, Ive, Karpathy, mastnáček -> Verdict).
 */
export class Deliberator {
  /**
   * @param {object} params
   * @param {import('./api.js').ApiClient} params.apiClient
   * @param {object} params.config
   */
  constructor({ apiClient, config }) {
    this.api = apiClient;
    this.config = config;
  }

  /**
   * Runs the full Apple Advisory deliberation pipeline.
   * @param {string} prompt The user prompt to deliberate on.
   * @param {object} [options] Custom overrides
   * @param {string} [options.provider] Provider name to use (e.g. 'opencode-go', 'openai')
   * @param {function} [options.onProgress] Callback for progress updates: (event, data) => void
   * @param {function} [options.onSynthesisDelta] Called with each synthesis content token as it streams.
   * @returns {Promise<{synthesis: string, panelResponses: object, contextAdvocateResponse: string, models: object, usage: object}>}
   */
  async deliberate(prompt, options = {}) {
    const providerName =
      options.provider || this.config.provider || "opencode-go";
    const providerConfig = this.config.providers[providerName];

    if (!providerConfig) {
      throw new Error(`Provider "${providerName}" is not configured.`);
    }

    const models = providerConfig.defaultModels;
    const onProgress = options.onProgress || (() => {});

    // Accumulate real token usage across all LLM calls
    const totalUsage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const addUsage = (u) => {
      if (!u) return;
      totalUsage.input += u.input || 0;
      totalUsage.output += u.output || 0;
      totalUsage.cacheRead += u.cacheRead || 0;
      totalUsage.cacheWrite += u.cacheWrite || 0;
      totalUsage.totalTokens += u.totalTokens || 0;
    };

    const getTemp = (model, defaultTemp) =>
      model?.toLowerCase().includes("kimi") ? 1.0 : defaultTemp;

    // ==========================================
    // Tier 1: Panel (Jobs, Woz, Ive, Karpathy in parallel)
    // ==========================================
    onProgress("panel-start", {
      models: {
        jobs: models.jobs,
        woz: models.woz,
        ive: models.ive,
        karpathy: models.karpathy,
      },
    });

    const panelPromises = [
      // 🍎 Steve Jobs
      this.api.chatCompletion({
        model: models.jobs,
        messages: [
          { role: "system", content: this.config.panel.jobs.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: getTemp(models.jobs, 0.7),
      }),

      // 🔧 Steve Wozniak
      this.api.chatCompletion({
        model: models.woz,
        messages: [
          { role: "system", content: this.config.panel.woz.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: getTemp(models.woz, 0.6),
      }),

      // ✏️ Jony Ive
      this.api.chatCompletion({
        model: models.ive,
        messages: [
          { role: "system", content: this.config.panel.ive.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: getTemp(models.ive, 0.5),
      }),

      // 🤖 Andrej Karpathy
      this.api.chatCompletion({
        model: models.karpathy,
        messages: [
          { role: "system", content: this.config.panel.karpathy.systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: getTemp(models.karpathy, 0.5),
      }),
    ];

    const panelSettled = await Promise.allSettled(panelPromises);
    const panelNames = ["jobs", "woz", "ive", "karpathy"];
    const failures = panelSettled.filter((r) => r.status === "rejected");
    if (failures.length === panelSettled.length) {
      throw new Error(
        `Panel phase failed: all advisors errored. First: ${failures[0].reason?.message || failures[0].reason}`,
      );
    }

    for (const r of panelSettled) {
      if (r.status === "fulfilled") addUsage(r.value.usage);
    }

    const panelResponses = {};
    for (let i = 0; i < panelSettled.length; i++) {
      if (panelSettled[i].status === "fulfilled") {
        panelResponses[panelNames[i]] = panelSettled[i].value.content;
      } else {
        panelResponses[panelNames[i]] =
          `[${panelNames[i]} nedostupný: ${panelSettled[i].reason?.message || "neznámá chyba"}]`;
      }
    }

    onProgress("panel-end", { panelResponses });

    // ==========================================
    // Tier 2: Context Advocate & Cross-fire (mastnáček)
    // ==========================================
    onProgress("context-start", { model: models.mastnacek });

    const mastnacekPrompt = `Téma k posouzení:
"${prompt}"

Pohledy čtyř poradců z panelu:

---
🍎 STEVE JOBS:
${panelResponses.jobs}

---
🔧 STEVE WOZNIAK:
${panelResponses.woz}

---
✏️ JONY IVE:
${panelResponses.ive}

---
🤖 ANDREJ KARPATHY:
${panelResponses.karpathy}
---

Jako Jaroslav Havel (mastnáček) – advokát kontextu:
1. Stručně pojmenuj nejostřejší spory a neshody mezi poradci (Křížová palba).
2. Nemilosrdně uzemni celou radu na realitu: kapacita 1 vývojáře, Veba, rodina v Otovicích, ~49 projektů, architektura VSA + Deep Modules, kód anglicky / komentáře česky, offline-first a dlouhodobá udržitelnost.
3. Utni přebytečné abstrakce, balast a vzdušné zámky. Mluv v 1. osobě.`;

    let contextAdvocateResult;
    try {
      contextAdvocateResult = await this.api.chatCompletion({
        model: models.mastnacek,
        messages: [
          { role: "system", content: this.config.contextAdvocate.systemPrompt },
          { role: "user", content: mastnacekPrompt },
        ],
        temperature: getTemp(models.mastnacek, 0.4),
      });
    } catch (error) {
      throw new Error(`Context advocate phase failed: ${error.message}`);
    }
    addUsage(contextAdvocateResult.usage);
    const contextAdvocateResponse = contextAdvocateResult.content;

    onProgress("context-end", { contextAdvocateResponse });

    // ==========================================
    // Tier 3: Final Synthesis & Verdict
    // ==========================================
    onProgress("synthesis-start", { model: models.synthesis });

    const synthesisPrompt = `Původní zadání uživatele:
"${prompt}"

Vyjádření poradců z panelu:
- 🍎 Steve Jobs:
${panelResponses.jobs}

- 🔧 Steve Wozniak:
${panelResponses.woz}

- ✏️ Jony Ive:
${panelResponses.ive}

- 🤖 Andrej Karpathy:
${panelResponses.karpathy}

Zhodnocení advokáta kontextu a křížové palby (mastnáček):
${contextAdvocateResponse}

Sestav finální ucelený výstup Apple poradní rady v přesné struktuře:
**🎯 Co hodnotíme:** <shrnuti>
**🍎 Steve Jobs**
<přímá řeč>
**🔧 Steve Wozniak**
<přímá řeč>
**✏️ Jony Ive**
<přímá řeč>
**🤖 Andrej Karpathy**
<přímá řeč>
**💥 Křížová palba**
<klíčové spory a výměny>
**👤 mastnáček**
<uzemnění na realitu>
**⚖️ Verdikt**
- <akční bod 1>
- <akční bod 2>
...`;

    let synthesisResult;
    try {
      synthesisResult = await this.api.chatCompletion({
        model: models.synthesis,
        messages: [
          { role: "system", content: this.config.synthesis.systemPrompt },
          { role: "user", content: synthesisPrompt },
        ],
        temperature: getTemp(models.synthesis, 0.5),
        onDelta: options.onSynthesisDelta,
      });
    } catch (error) {
      throw new Error(`Synthesis phase failed: ${error.message}`);
    }
    addUsage(synthesisResult.usage);
    const synthesis = synthesisResult.content;

    onProgress("synthesis-end", { synthesis });

    return {
      synthesis,
      panelResponses,
      contextAdvocateResponse,
      models: {
        jobs: models.jobs,
        woz: models.woz,
        ive: models.ive,
        karpathy: models.karpathy,
        mastnacek: models.mastnacek,
        synthesis: models.synthesis,
      },
      usage: totalUsage,
    };
  }
}
