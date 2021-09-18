import { decode, encode } from "js-base64";
import type { Compiler } from "./typings";

export class Judge0 implements Compiler {
  public constructor(public apiKey: string) {}

  public hasLanguage(lang: string): lang is keyof typeof Judge0.lanMap {
    return Object.prototype.hasOwnProperty.call(Judge0.lanMap, lang);
  }

  public getLanguages(): string[] {
    return Object.keys(Judge0.lanMap);
  }

  public async runCode(source: string, lang: string): Promise<string> {
    if (!this.hasLanguage(lang)) {
      return "Language not supported!\n";
    }

    try {
      const response = await fetch(
        "https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true&fields=*",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-rapidapi-host": "judge0-ce.p.rapidapi.com",
            "x-rapidapi-key": this.apiKey,
          },
          body: JSON.stringify({
            language_id: Judge0.lanMap[lang],
            source_code: encode(source),
          }),
        }
      );

      if (!response.ok) {
        return `${response.status} ${response.statusText}`;
      }

      const data = await response.json();

      if (data.stderr) {
        return decode(data.stderr);
      } else if (data.stdout) {
        return decode(data.stdout);
      }
      return "Unknown error\n";
    } catch (err) {
      return `${err instanceof Error ? err.message : String(err)}\n`;
    }
  }

  private static lanMap = {
    shell: 46,
    c: 50,
    cpp: 54,
    clojure: 86,
    csharp: 51,
    elixir: 57,
    fsharp: 87,
    go: 60,
    java: 62,
    javascript: 63,
    kotlin: 78,
    lua: 64,
    "objective-c": 79,
    pascal: 67,
    perl: 85,
    php: 68,
    plaintext: 43,
    python: 71,
    r: 80,
    ruby: 72,
    rust: 73,
    scala: 81,
    sql: 82,
    swift: 83,
    typescript: 74,
    vb: 84,
  };
}
