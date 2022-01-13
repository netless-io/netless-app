const path = require("path");
const fs = require("fs");

const rootPkgPath = path.join(__dirname, "..", "..", "..", "package.json");
const rootPkg = require(rootPkgPath);

const templates = fs.readdirSync(path.dirname(__dirname)).filter(e => e.startsWith("template-"));
for (const t of templates) {
  const pkgPath = path.join(__dirname, "..", t, "package.json");
  const pkg = require(pkgPath);
  let updated = false;
  for (const key of Object.keys(pkg.devDependencies)) {
    if (
      key in rootPkg.devDependencies &&
      pkg.devDependencies[key] !== rootPkg.devDependencies[key]
    ) {
      pkg.devDependencies[key] = rootPkg.devDependencies[key];
      updated = true;
    }
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  if (updated) {
    console.log("write", path.relative(process.cwd(), pkgPath));
  }
}
