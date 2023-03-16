import path from "path";
import { createViteConfig } from "../../scripts/create-vite-config";

export default createViteConfig({ entry: path.resolve(process.cwd(), "src/index.tsx"), formats: ["es", "cjs"] });
