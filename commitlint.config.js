/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-env node */

const path = require("path");
const fs = require("fs");

module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        ...fs.readdirSync(path.join(__dirname, "packages")).map(name => name.replace(/^app-/, "")),
        "deployment",
        "env",
        "i18n",
        "version",
        "scripts",
        "readme",
      ],
    ],
  },
};
