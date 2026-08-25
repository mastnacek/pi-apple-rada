# 🍎 Pi Apple Rada (`pi-apple-rada`)

Multi-model deliberation harness a poradní sbor veteránů Applu pro **[Pi Coding Agent](https://pi.dev)** a příkazovou řádku (CLI).

Kombinuje mechanismus multi-model deliberation pipeline (paralelní panel, křížová palba/advokát kontextu a syntéza s verdiktem) s autentickými personami: **Steve Jobs**, **Steve Wozniak**, **Jony Ive**, **Andrej Karpathy** a **advokát kontextu (mastnáček)**.

---

## 🏛️ Složení Apple rady

| Člen | Objektiv | Charakteristika |
| ------ | ---------- | ----------------- |
| 🍎 **Steve Jobs** | Vize, produkt, byznys, redukce | Binární, brutálně upřímný, *„That sucks!"* jako test ohněm, focus = říkat ne tisícovce věcí. |
| 🔧 **Steve Wozniak** | Inženýrství, architektura, otevřenost | Skromný hacker, nadšený, *„jde to udělat jednodušeji a s méně řádky kódu?"*, otevřená API. |
| ✏️ **Jony Ive** | Design, UX, emoce, řemeslo | Tichý perfekcionista, *„care / inelegant / inevitable"*, hluboká jednoduchost a iterace. |
| 🤖 **Andrej Karpathy** | AI/ML, evaly, kognitivní systémy | Eval-first, *„LLMs automate what you can verify"*, first principles, bez hype, Software 2.0/3.0. |
| 👤 **mastnáček** | Kontext & realita uživatele | Advokát kontextu — *„na to jsem sám, vedle Veby, 4 dětí a domu v Otovicích"*, VSA + Deep Modules, offline-first. |

---

## ⚙️ Jak funguje deliberation pipeline

```
                          [Zadání uživatele]
                                  │
         ┌──────────────┬─────────┴────────┬──────────────┐
         ▼              ▼                  ▼              ▼
   [🍎 Jobs]       [🔧 Woz]            [✏️ Ive]    [🤖 Karpathy]   Tier 1: Paralelní panel
   (Vize/Redukce) (Inženýrství)       (Design/UX)     (AI/Evaly)     (4 modely paralelně)
         │              │                  │              │
         └──────────────┴─────────┬────────┴──────────────┘
                                  │
                                  ▼
                    [👤 Advokát kontextu / mastnáček]             Tier 2: Kontext & Křížová palba
                    (Uzemnění na realitu, kapacitu a VSA)
                                  │
                                  ▼
                       [⚖️ Syntetizátor & Verdikt]                Tier 3: Finální verdikt
                       (Strukturovaný výstup rady)
                                  │
                                  ▼
                         [🎯 Výstup Apple rady]
```

### Formát výstupu

```markdown
**🎯 Co hodnotíme:** <stručné orámování>

**🍎 Steve Jobs**
<přímá řeč v 1. osobě s autentickými hláškami>

**🔧 Steve Wozniak**
<přímá řeč o technické eleganci a jednoduchosti>

**✏️ Jony Ive**
<přímá řeč o designu, péči a pocitu>

**🤖 Andrej Karpathy**
<přímá řeč o měření, eval-first přístupu a architektuře>

**💥 Křížová palba**
<živá výměna a střety mezi personami>

**👤 mastnáček**
<uzemnění na realitu kapacity, stacku a reálného provozu>

**⚖️ Verdikt**
- <akční bod 1>
- <akční bod 2>
```

---

## 🚀 Instalace a použití

### 1. Jako Pi Extension

V kořenovém adresáři pluginu:

```bash
pi install .
```

Nebo registrací v konfiguračním souboru Pi (`~/.pi/agent/settings.json`).

### 2. Příkazy v Pi

* **`/apple <téma / kód / nápad>`** — Svolá radu a vygeneruje kompletní round-table.
* **`/apple status`** — Zobrazí aktuální stav konfigurace, přiřazení modelů a providera.
* **`/apple preset <glm|quality|high|balanced>`** — Okamžité přepnutí přednastavení s našeptáváním.
* **`/apple provider <opencode-go|opencode-zen|openai|xai>`** — Přepnutí providera.
* **`/apple model <role> <modelId>`** — Přepsání modelu pro konkrétního člena rady.
* **`/apple setup`** (nebo `/apple-config`) — Interaktivní průvodce výběrem modelů.
* **`/apple help`** — Přehled příkazů a person rady.
* **Nástroj `apple_rada`** — Pi agent může radu sám povolat při řešení složitých architektonických rozhodnutí.
* **Model Provider `apple-rada`** — Můžeš si v Pi vybrat `apple-rada` přímo jako aktivní model.

---

## 💻 Samostatné CLI

Spuštění dotazu z terminálu:

```bash
node bin/pi-apple-rada.js "Jak navrhnout autentizační flow pro offline-first aplikaci?"
```

Interaktivní REPL režim:

```bash
node bin/pi-apple-rada.js --interactive
```

Podrobný výpis jednotlivých person:

```bash
node bin/pi-apple-rada.js "Zhodnoť VSA architekturu" --verbose
```

Konfigurační průvodce:

```bash
node bin/pi-apple-rada.js --setup
```

---

## 🎛️ Presety a modely

| Preset | Popis | Katalog |
| -------- | ------- | --------- |
| **GLM-5.3 Apple Rada** | Všechny sloty `glm-5.3` (Výchozí) | OpenCode Go |
| **Quality / Frontier** | Jobs (`grok-4.6`), Woz (`kimi-k3`), Ive (`gpt-5.6-luna`), Karpathy (`gpt-5.6-luna`), mastnáček (`kimi-k3`) | OpenCode Zen |
| **High Quality** | Jobs (`kimi-k3`), Woz (`qwen3.8-max`), Ive (`kimi-k3`), Karpathy (`qwen3.8-max`), mastnáček (`kimi-k3`) | OpenCode Go |
| **Balanced** | Jobs (`kimi-k3`), Woz (`deepseek-v4-pro`), Ive (`glm-5.3`), Karpathy (`deepseek-v4-pro`), mastnáček (`glm-5.3`) | OpenCode Go |
| **Custom** | Vlastní modely pro každý slot | Libovolný |

---

## 🧪 Testování

```bash
npm test          # Offline jednotkové testy syntaxe, presetů a konfigurace
npm run test:stream # Test streamovacího protokolu (streamSimple)
npm run test:all  # Kompletní sada testů
```

---

## 📄 Licence

[MIT](LICENSE)
