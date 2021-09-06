<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let list: string[] = [];
  let value: string = "";

  function remove(i: number) {
    list = list.slice(0, i).concat(list.slice(i + 1));
  }

  function submit(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.stopPropagation();
      e.preventDefault();
      list = list.concat([value]);
      value = "";
    }
  }

  const dispatch = createEventDispatcher();
  $: dispatch("update", list);
</script>

<div data-kind="todo-app">
  <input bind:value on:keydown={submit} />
  <ul>
    {#each list as item, i}
      <li>{item} <button on:click={() => remove(i)}>&cross;</button></li>
    {/each}
  </ul>
</div>
