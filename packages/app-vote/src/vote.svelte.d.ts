import { SvelteComponentTyped } from "svelte";

declare class App extends SvelteComponentTyped<
  { writable?: boolean; title?: string; items?: string[]; votes?: number[] },
  { update: CustomEvent<{ votes?: [i: number, n: number]; title?: string; items?: string[] }> }
> {}

export default App;
