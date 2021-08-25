<script lang="ts">
  export let volume = 50

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher()
  $: dispatch("update:attrs", { volume })
</script>

<input type="range" bind:value={volume}>
