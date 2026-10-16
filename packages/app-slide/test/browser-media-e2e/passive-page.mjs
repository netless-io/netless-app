// Playwright's Chromium evaluation sends userGesture:true. Permission tests
// must use the actual CDP runtime without granting activation while sampling
// or dispatching room commands. Only real locator clicks grant activation.
export async function installPassiveEvaluation(context, page) {
  const session = await context.newCDPSession(page);
  const expression = (fn, arg) =>
    typeof fn === "string"
      ? fn
      : `(${fn.toString()})(${arg === undefined ? "undefined" : JSON.stringify(arg)})`;
  async function evaluate(source, returnByValue = true) {
    const response = await session.send("Runtime.evaluate", {
      expression: source,
      awaitPromise: true,
      returnByValue,
      userGesture: false,
    });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description || response.exceptionDetails.text
      );
    }
    return response.result;
  }
  page.evaluate = async (fn, arg) => (await evaluate(expression(fn, arg))).value;
  page.waitForFunction = async (fn, arg, options = {}) => {
    const timeout = options.timeout ?? 30000;
    const interval = typeof options.polling === "number" ? options.polling : 16;
    const result = await evaluate(
      `(async () => {
      const predicate = (${fn.toString()});
      const arg = ${arg === undefined ? "undefined" : JSON.stringify(arg)};
      const deadline = performance.now() + ${timeout};
      do {
        const value = await predicate(arg);
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, ${interval}));
      } while (performance.now() < deadline);
      throw new Error("Passive waitForFunction timed out after ${timeout}ms");
    })()`,
      false
    );
    return {
      async jsonValue() {
        if (!result.objectId) return result.value;
        const response = await session.send("Runtime.callFunctionOn", {
          objectId: result.objectId,
          functionDeclaration: "function() { return this; }",
          returnByValue: true,
          userGesture: false,
        });
        if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
        return response.result.value;
      },
      async dispose() {
        if (result.objectId)
          await session.send("Runtime.releaseObject", { objectId: result.objectId });
      },
    };
  };
}
