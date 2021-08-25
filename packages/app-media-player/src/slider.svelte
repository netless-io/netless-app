<script lang="ts">
  export let volume = 50

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher()
  $: dispatch("update:attrs", { volume })
</script>

<code>{JSON.stringify({ volume })}</code>
