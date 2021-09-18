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
      const plain = `Vlang\0${1}\0${l}\0VTIO_OPTIONS\0${0}\0F.code.tio\0${
        c.length
      }\0${c}F.input.tio\0${0}\0Vargs\0${0}\0R`;

      const response = await fetch("https://tio.run/cgi-bin/run/api/", {
        method: "POST",
        body: new Blob([deflateRaw(plain)]),
      });

      if (!response.ok) {
        return `${response.status} ${response.statusText}`;
      }

      const lines = (await response.text()).split("\n");
      const result = lines.slice(0, lines.length - 5).join("\n");
      const splitter = result.slice(0, 16);

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
