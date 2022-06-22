import { SvelteComponentTyped } from "svelte/internal";

declare class App extends SvelteComponentTyped<
  { url?: string; dummyURL?: string },
  { update: CustomEvent<string> }
> {}

export default App;
