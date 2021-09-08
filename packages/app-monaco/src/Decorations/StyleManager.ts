export class StyleManager {
  public style: HTMLStyleElement;

  constructor() {
    this.style = document.createElement("style");
    document.body.appendChild(this.style);
  }

  addRule(rule: string): CSSStyleRule | null {
    try {
      const sheet = this.style.sheet;
      if (sheet) {
        const index = sheet.insertRule(rule);
        return sheet.cssRules.item(index) as CSSStyleRule | null;
      }
    } catch {
      return null;
    }
    return null;
  }

  deleteRule(rule: CSSStyleRule): void {
    try {
      const sheet = this.style.sheet;
      if (sheet) {
        for (let i = 0; i < sheet.cssRules.length; i++) {
          if (rule === sheet.cssRules.item(i)) {
            sheet.deleteRule(i);
            break;
          }
        }
      }
    } catch {
      return;
    }
  }

  destroy(): void {
    this.style.remove();
  }
}
