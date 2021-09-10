<script lang="ts">
  import pencilSVG from "./icons/pencil.svg";
  import pencilOffSVG from "./icons/pencil-off.svg";
  import plusSVG from "./icons/plus.svg";
  import closeSVG from "./icons/close.svg";
  import upSVG from "./icons/up.svg";

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let writable = false;

  let phase: "edit" | "vote" = "vote";
  export let title = "";
  export let items: string[] = ["lorem", "ipsum", "dolo", "sit", "amet"];
  export let votes: number[] = [0, 0, 0, 0, 0];

  $: editing = phase === "edit";

  function switchPhase() {
    phase = editing ? "vote" : "edit";
    if (phase === "vote") {
      votes = Array(items.length).fill(0);
      saveChanges();
    }
  }

  function updateTitle(e: Event) {
    title = (e.target as HTMLHeadingElement).textContent || "";
  }

  function addItem() {
    items = items.concat([""]);
  }

  function removeItem(i: number) {
    items = items.slice(0, i).concat(items.slice(i + 1));
  }

  function saveChanges() {
    if (writable) {
      votes.forEach((n, i) => {
        dispatch("update", { votes: [i, n] });
      });
      dispatch("update", { title, items });
    }
  }

  function voteItem(i: number) {
    if (writable) {
      dispatch("update", { votes: [i, votes[i] + 1] });
    }
  }
</script>

<div class="netless-app-vote" data-kind="vote">
  <div class="netless-app-vote-controls">
    {#if editing}
      <button title="Add" disabled={items.length >= 20} on:click={addItem}>
        <img draggable="false" src={plusSVG} alt="add" />
      </button>
    {/if}
    {#if writable}
      <button title="Edit" on:click={switchPhase}>
        <img draggable="false" src={editing ? pencilOffSVG : pencilSVG} alt="edit" />
      </button>
    {/if}
  </div>
  <div class="netless-app-vote-title">
    <h2 contenteditable={editing} class:editing on:input={updateTitle}>
      {title || "what to eat"}
    </h2>
  </div>
  <ul class="netless-app-vote-items">
    {#each items as item, i}
      <li>
        <input class="netless-app-vote-item" readonly={!editing} bind:value={item} />
        {#if !editing}
          <span class="netless-app-vote-count">({votes[i] || 0})</span>
          <button title="Vote" on:click={() => voteItem(i)}>
            <img draggable="false" src={upSVG} alt="vote" />
          </button>
        {/if}
        {#if editing}
          <button title="Delete" on:click={() => removeItem(i)}>
            <img draggable="false" src={closeSVG} alt="delete" />
          </button>
        {/if}
      </li>
    {/each}
  </ul>
</div>
