<script lang="ts">
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let url = "about:blank";
  export let dummyURL = url;
  let status: "Ready" | "Loading" = "Ready";

  function onload() {
    status = "Ready";
  }

  function go() {
    url = dummyURL;
    status = "Loading";
  }

  $: dispatch("update", url);
</script>

<div class="netless-app-browser" data-kind="browser">
  <div class="netless-app-browser-omnibox">
    <span
      class="netless-app-browser-status"
      class:loading={status === "Loading"}
      class:ready={status === "Ready"}
    >
      {status}
    </span>
    <input
      class="netless-app-browser-url"
      autocomplete="off"
      spellcheck="false"
      bind:value={dummyURL}
      on:keypress={ev => ev.key === "Enter" && go()}
    />
    <button class="netless-app-browser-go" on:click={go}>GO</button>
  </div>
  <iframe
    title="Netless App Browser"
    class="netless-app-browser-content"
    frameborder="0"
    on:load={onload}
    src={url}
  />
</div>
