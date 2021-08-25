import { SvelteComponent } from "svelte";
declare module "*.svelte" {
  const app: SvelteComponent;
  export default app;
}
