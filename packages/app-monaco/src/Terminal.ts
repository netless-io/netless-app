import type { AppContext } from "@netless/window-manager";
import type { Compiler } from "./compiler/typings";
import type { NetlessAppMonacoAttributes } from "./typings";

import { SideEffectManager } from "side-effect-manager";

export class Terminal {
  public readonly $content: HTMLElement;
  public content = "";

  public constructor(
    public readonly context: AppContext<NetlessAppMonacoAttributes>,
    public readonly compiler: Compiler
  ) {
    this.$content = document.createElement("pre");
    this.$content.className = `${this.namespace} tele-fancy-scrollbar`;

    this.content = this.context.storage.state.terminal;
    this.render();

    this.sideEffect.addDisposer(
      this.context.storage.addStateChangedListener(diff => {
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
    if (content !== this.context.storage.state.terminal) {
      this.context.storage.setState({ terminal: content });
    }
  }

  private updateCodeRunning(codeRunning: boolean): void {
    if (codeRunning !== this.context.storage.state.codeRunning) {
      this.context.storage.setState({ codeRunning });
      if (codeRunning) {
        this.context.storage.setState({ terminal: "" });
      }
    }
  }

  private render(): void {
    if (this.context.storage.state.codeRunning) {
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
