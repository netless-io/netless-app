/* eslint-env node */

module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "rollup-plugin-peer-deps-external" && pkg.peerDependencies) {
        // vite manages rollup
        delete pkg.peerDependencies.rollup;
      }
      return pkg;
    },
  },
};
