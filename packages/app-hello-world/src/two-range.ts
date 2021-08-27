import type { NetlessApp } from "@netless/window-manager";

const TwoRange: NetlessApp<{ a: number; b: number }> = {
  kind: "TwoRange",
  config: {
    minwidth: 200,
    minheight: 100,
  },
  setup(context) {
    context.getBox().mountStyles(`
      .netless-app-two-range {
        padding: 8px;
        display: flex;
        flex-flow: column nowrap;
        justify-content: center;
        gap: 8px;
        width: 100%; height: 100%;
        overflow: hidden;
        background: #fafbfc;
      }
   `);

    const attrs = { a: 50, b: 50, ...context.getAttributes() };

    const container = document.createElement("div");
    container.classList.add("netless-app-two-range");

    const ranges: Record<string, HTMLInputElement> = {};

    const createRange = (x: "a" | "b") => {
      const input = document.createElement("input");
      input.type = "range";
      input.valueAsNumber = attrs[x];
      input.oninput = () => {
        const value = input.valueAsNumber;
        context.updateAttributes([x], (attrs[x] = value));
      };
      ranges[x] = input;
      container.append(input);
    };

    createRange("a");
    createRange("b");

    context.getBox().mountContent(container);

    context.emitter.on("attributesUpdate", attrs => {
      if (!attrs) return;
      for (const x in attrs) {
        ranges[x].valueAsNumber = attrs[x as "a" | "b"];
      }
    });

    context.emitter.on("destroy", () => {
      container.remove();
    });
  },
};

export default TwoRange;
