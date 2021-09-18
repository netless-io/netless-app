export interface Compiler {
  hasLanguage(lang: string): boolean;
  getLanguages(): string[];
  runCode(source: string, lang: string): Promise<string>;
}
