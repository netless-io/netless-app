import type { AppContext } from "@netless/window-manager";
import { SideEffectManager } from "side-effect-manager";
import type { Compiler } from "./compiler/typings";
import type { NetlessAppMonacoAttributes } from "./typings";

export class Terminal {
  public readonly $content: HTMLElement;
  public content = "";

  public constructor(
    public readonly context: AppContext<NetlessAppMonacoAttributes>,
    public readonly attrs: NetlessAppMonacoAttributes,
    public readonly compiler: Compiler
  ) {
    this.$content = document.createElement("pre");
    this.$content.className = this.namespace;

    this.content = this.attrs.terminal;
    this.render();

    this.sideEffect.add(() =>
      this.context.mobxUtils.reaction(
        () => this.attrs.terminal,
        terminal => {
          if (terminal != null && terminal !== this.content) {
            this.content = terminal;
            this.render();
          }
        }
      )
    );

    this.sideEffect.add(() =>
      this.context.mobxUtils.reaction(
        () => this.attrs.codeRunning,
        () => {
          this.render();
        }
      )
    );
  }

  public async runCode(source: string, lang: string): Promise<void> {
    this.updateCodeRunning(true);
    this.updateTerminal(await this.compiler.runCode(source, lang));
    this.updateCodeRunning(false);
  }

  private updateTerminal(content: string): void {
    if (content !== this.attrs.terminal) {
      this.context.updateAttributes(["terminal"], content);
    }
  }

  private updateCodeRunning(codeRunning: boolean): void {
    if (codeRunning !== this.attrs.codeRunning) {
      this.context.updateAttributes(["codeRunning"], codeRunning);
    }
  }

  private render(): void {
    if (this.attrs.codeRunning) {
      this.$content.textContent = "Code Running...\n";
    } else {
      this.$content.textContent = this.content;
    }
  }

  public readonly namespace = "netless-app-monaco-terminal";

  public wrapClassName(className: string): string {
    return `${this.namespace}-${className}`;
  }

  private sideEffect = new SideEffectManager();
}
