import chalk from "chalk";
import ora from "ora";

/**
 * Terminal UI helper for formatting Apple Advisory stages.
 */
export class TerminalUi {
  constructor() {
    this.spinner = null;
  }

  /**
   * Starts a spinner for a specific stage.
   * @param {string} stage
   * @param {object} [data]
   */
  startStage(stage, data = {}) {
    if (this.spinner) {
      this.spinner.stop();
    }

    let text = "";
    switch (stage) {
      case "panel-start":
        text = chalk.cyan(
          `🍎 Tier 1: Svolávám poradní panel (${chalk.red("🍎 Jobs")}: ${chalk.gray(data.models.jobs)}, ${chalk.cyan("🔧 Woz")}: ${chalk.gray(data.models.woz)}, ${chalk.magenta("✏️ Ive")}: ${chalk.gray(data.models.ive)}, ${chalk.blue("🤖 Karpathy")}: ${chalk.gray(data.models.karpathy)})`,
        );
        this.spinner = ora({ text, color: "cyan" }).start();
        break;
      case "context-start":
        text = chalk.green(
          `👤 Tier 2: Advokát kontextu a křížová palba (mastnáček: ${chalk.gray(data.model)})`,
        );
        this.spinner = ora({ text, color: "green" }).start();
        break;
      case "synthesis-start":
        text = chalk.yellow(
          `⚖️ Tier 3: Sestavuji finální verdikt rady (${chalk.gray(data.model)})`,
        );
        this.spinner = ora({ text, color: "yellow" }).start();
        break;
    }
  }

  /**
   * Succeeds the current spinner.
   * @param {string} text
   */
  succeedStage(text) {
    if (this.spinner) {
      this.spinner.succeed(chalk.gray(text));
      this.spinner = null;
    }
  }

  /**
   * Fails the current spinner.
   * @param {string} text
   */
  failStage(text) {
    if (this.spinner) {
      this.spinner.fail(chalk.red(text));
      this.spinner = null;
    }
  }

  /**
   * Prints the raw panel expert responses.
   * @param {object} panelResponses
   */
  printPanelResponses(panelResponses) {
    console.log(
      "\n" + chalk.bold.underline("--- 🍎 VYJÁDŘENÍ PORADCŮ APPLE RADY ---"),
    );

    // Steve Jobs
    console.log("\n" + chalk.bold.red("🍎 STEVE JOBS:"));
    console.log(chalk.gray("========================================"));
    console.log((panelResponses.jobs || "").trim());
    console.log(chalk.gray("========================================"));

    // Steve Wozniak
    console.log("\n" + chalk.bold.cyan("🔧 STEVE WOZNIAK:"));
    console.log(chalk.gray("========================================"));
    console.log((panelResponses.woz || "").trim());
    console.log(chalk.gray("========================================"));

    // Jony Ive
    console.log("\n" + chalk.bold.magenta("✏️ JONY IVE:"));
    console.log(chalk.gray("========================================"));
    console.log((panelResponses.ive || "").trim());
    console.log(chalk.gray("========================================"));

    // Andrej Karpathy
    console.log("\n" + chalk.bold.blue("🤖 ANDREJ KARPATHY:"));
    console.log(chalk.gray("========================================"));
    console.log((panelResponses.karpathy || "").trim());
    console.log(chalk.gray("========================================"));
    console.log("");
  }

  /**
   * Formats and prints the Context Advocate analysis.
   * @param {string} contextAdvocateResponse
   */
  printContextAdvocate(contextAdvocateResponse) {
    console.log(
      "\n" +
        chalk.bold.black.bgGreen(
          "  👤 ADVOKÁT KONTEXTU (mastnáček) & KŘÍŽOVÁ PALBA  ",
        ) +
        "\n",
    );
    console.log(chalk.gray("========================================"));
    console.log((contextAdvocateResponse || "").trim());
    console.log(chalk.gray("========================================\n"));
  }

  /**
   * Formats and prints the final Synthesis response.
   * @param {string} synthesis
   */
  printSynthesis(synthesis) {
    console.log(
      "\n" +
        chalk.bold.black.bgYellow("  ⚖️ FINÁLNÍ VERDIKT APPLE RADY  ") +
        "\n",
    );
    console.log(synthesis.trim());
    console.log(
      "\n" + chalk.gray("========================================\n"),
    );
  }
}
