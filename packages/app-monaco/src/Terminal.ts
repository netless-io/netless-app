import type { Storage } from "@netless/window-manager";
import type { Compiler } from "./compiler/typings";
import type { NetlessAppMonacoAttributes } from "./typings";

import { SideEffectManager } from "side-effect-manager";

export class Terminal {
  public readonly $content: HTMLElement;
  public content = "";

  public constructor(
    public readonly storage: Storage<NetlessAppMonacoAttributes>,
    public readonly compiler: Compiler
  ) {
    this.$content = document.createElement("pre");
    this.$content.className = `${this.namespace} tele-fancy-scrollbar`;

    this.content = this.storage.state.terminal;
    this.render();

    this.sideEffect.addDisposer(
      this.storage.on("stateChanged", diff => {
        if (diff.terminal && diff.terminal.newValue !== this.content) {
          this.content = diff.terminal.newValue || "";
          this.render();
        }
        if (diff.codeRunning) {
          this.render();
        }
      })
    );
  }

  public async runCode(source: string, lang: string): Promise<void> {
    this.updateCodeRunning(true);
    this.updateTerminal(await this.compiler.runCode(source, lang));
    this.updateCodeRunning(false);
  }

  private updateTerminal(content: string): void {
    if (content !== this.storage.state.terminal) {
      this.storage.setState({ terminal: content });
    }
  }

  private updateCodeRunning(codeRunning: boolean): void {
    if (codeRunning !== this.storage.state.codeRunning) {
      this.storage.setState({ codeRunning });
      if (codeRunning) {
        this.storage.setState({ terminal: "" });
      }
    }
  }

  private render(): void {
    if (this.storage.state.codeRunning) {
      this.$content.style.display = "block";
      this.$content.textContent = "Code Running...\n";
    } else if (this.content) {
      this.$content.style.display = "block";
      this.$content.textContent = this.content;
    } else {
      this.$content.style.display = "none";
    }
  }

  public readonly namespace = "netless-app-monaco-terminal";

  public wrapClassName(className: string): string {
    return `${this.namespace}-${className}`;
  }

  private sideEffect = new SideEffectManager();
}
