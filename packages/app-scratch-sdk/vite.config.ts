import path from "path";
import { createViteConfig } from "../../scripts/create-vite-config";

export default createViteConfig({
  entry: path.join(__dirname, "src", "index.js"),
  formats: ["es", "cjs"],
});
