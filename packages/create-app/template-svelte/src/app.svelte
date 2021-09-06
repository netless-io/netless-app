<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let list: string[] = [];
  let value: string = "";

  function remove(i: number) {
    list = list.slice(0, i).concat(list.slice(i + 1));
  }

  function submit() {
    list = list.concat([value]);
    value = "";
  }

  const dispatch = createEventDispatcher();
  $: dispatch("update", list);
</script>

<input bind:value on:keydown={submit} />
<ul>
  {#each list as item, i}
    <li>{item} <button on:click={() => remove(i)}>&cross;</button></li>
  {/each}
</ul>
