const argv = require("minimist")(process.argv.slice(2));
const prompts = require("prompts");
const fse = require("fs-extra");
const path = require("path");
const render = require("./render");

async function createNetlessApp() {
  const templateTypes = await fse.readdir(path.join(__dirname, "template"));

  console.log("\n -= Netless App Generator =- \n");

  const renderConfig = await prompts([
    {
      name: "template",
      type: "autocomplete",
      message: "Choose template type:",
      initial: "vanilla",
      choices: templateTypes.map(title => ({ title })),
    },
    {
      name: "name",
      type: "text",
      message: 'Enter project name. Must starts with "app-":',
      validate: value => (/^app-[\w\d-]+$/.test(value) ? true : 'Must starts with "app-"'),
      initial: "app-my-demo",
      format: value => (value.startsWith("app-") ? value : `app-${value}`),
    },
    {
      name: "title",
      type: "text",
      message: "Title for the demo window:",
      initial: "New Window",
    },
  ]);

  try {
    const result = await render(renderConfig);
    console.log(
      `\n\n New package "${result.fullName}" has been created at ${result.packagePath}\n`
    );
    console.log("\n Run `pnpm dev` at project root to develop the package.\n");
  } catch (e) {
    if (argv.debug) {
      throw e;
    } else {
      console.error(`\n${e.message}\n`);
    }
  }
}

module.exports = createNetlessApp;
