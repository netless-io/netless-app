import { deflateRaw } from "pako";
import type { Compiler } from "./typings";

export class Tio implements Compiler {
  public hasLanguage(lang: string): lang is keyof typeof Tio.lanMap {
    return Object.prototype.hasOwnProperty.call(Tio.lanMap, lang);
  }

  public getLanguages(): string[] {
    return Object.keys(Tio.lanMap);
  }

  public async runCode(source: string, lang: string): Promise<string> {
    if (!this.hasLanguage(lang)) {
      return "Language not supported!\n";
    }

    try {
      const l = unescape(encodeURIComponent(Tio.lanMap[lang]));
      const c = unescape(encodeURIComponent(source));
      const plain = `Vlang\0${1}\0${l}\0VTIO_CFLAGS\0${0}\0F.code.tio\0${
        c.length
      }\0${c}F.input.tio\0${0}\0Vargs\0${0}\0R`;

      const response = await fetch("https://tio.run/cgi-bin/run/api/", {
        method: "POST",
        body: new Blob([deflateRaw(encodeText(plain), { level: 9 })]),
      });

      if (!response.ok) {
        return `${response.status} ${response.statusText}`;
      }

      const rawText = await response.text();
      const splitter = rawText.slice(0, 16);
      const lines = rawText.split("\n");

      if (!rawText.includes("Real time:")) {
        return rawText.split(splitter).join("");
      }

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (line.startsWith(splitter)) {
          break;
        }
        lines.pop();
        if (line.startsWith("Real time:")) {
          break;
        }
      }

      const result = lines.join("\n");

      const [out, err] = result.slice(16).split(splitter);

      return err || out;
    } catch (err) {
      return `${err instanceof Error ? err.message : String(err)}\n`;
    }
  }

  private static lanMap = {
    clojure: "clojure",
    coffeescript: "coffeescript",
    c: "c-gcc",
    cpp: "cpp-gcc",
    csharp: "cs-mono",
    dart: "dart",
    elixir: "elixir",
    fsharp: "fs-mono",
    go: "go",
    java: "java-jdk",
    javascript: "javascript-node",
    julia: "julia",
    kotlin: "kotlin",
    lua: "lua",
    "objective-c": "objective-c-gcc",
    pascal: "pascal-fpc",
    perl: "perl6",
    php: "php",
    powershell: "powershell",
    python: "python3",
    r: "r",
    ruby: "ruby",
    rust: "rust",
    scala: "scala",
    shell: "bash",
    sql: "spl",
    swift: "swift4",
    tcl: "tcl",
    typescript: "typescript",
    vb: "vb-core",
  };
}

function encodeText(text: string): Uint8Array {
  const byteArray = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    byteArray[index] = text.charCodeAt(index);
  }
  return byteArray;
}
