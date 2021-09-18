import type { Compiler } from "./compiler/typings";

export class Terminal {
  public readonly $content: HTMLElement;
  public content = "";

  public constructor(public compiler: Compiler) {
    this.$content = document.createElement("pre");
    this.$content.className = this.namespace;
  }

  public async runCode(source: string, lang: string): Promise<void> {
    this.setContent("Code Running...\n");
    this.setContent(await this.compiler.runCode(source, lang));
  }

  public appendContent(content: string): void {
    this.content += content;
    this.render();
  }

  public setContent(content: string): void {
    if (content !== this.content) {
      this.content = content;
      this.render();
    }
  }

  public render(): void {
    this.$content.textContent = this.content;
    this.$content.scrollTo({ top: this.$content.scrollHeight, behavior: "smooth" });
  }

  public readonly namespace = "netless-app-monaco-terminal";

  public wrapClassName(className: string): string {
    return `${this.namespace}-${className}`;
  }
}
