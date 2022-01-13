const argv = require("minimist")(process.argv.slice(2));

if (argv.standalone) {
  require("./standalone");
} else {
  const createNetlessApp = require("./create-netless-app");

  createNetlessApp();
}
