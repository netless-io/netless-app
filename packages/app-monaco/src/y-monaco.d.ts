/* eslint-disable @typescript-eslint/consistent-type-imports */

declare module "y-monaco" {
  export class MonacoBinding {
    constructor(
      text: import("yjs").Text,
      modal: import("monaco-editor").editor.ITextModel | null,
      editors: Set<import("monaco-editor").editor.IStandaloneCodeEditor>,
      awareness: import("y-protocols/awareness").Awareness
    ): void;
    destroy(): void;
  }
}
