<script context="module" lang="ts">
  import type { Room, RoomState, ApplianceNames } from "white-web-sdk";

  import { createRoom, share } from "./common";
  import { init, joinRoom, prepare, tools, reset } from "./room";
  import type { AppGroup } from "./apps";
  import { registerApps } from "./apps";
</script>

<script lang="ts">
  import { onMount } from "svelte";

  let phase: "prepare" | "404" | "register-apps" | "join-room" | "main" = "prepare";
  let apps: AppGroup[];
  let room: Room;
  let tool: ApplianceNames;
  let shareMode: "share" | "new-room" = "share";

  onMount(async () => {
    const roomInfo = await prepare();
    if (!roomInfo) {
      phase = "404";
      return;
    }

    phase = "register-apps";
    apps = await registerApps();

    phase = "join-room";
    room = await joinRoom(roomInfo);
    tool = room.state.memberState.currentApplianceName;
    room.callbacks.on("onRoomStateChanged", (mod: Partial<RoomState>) => {
      if (mod.memberState) {
        tool = mod.memberState.currentApplianceName;
      }
    });

    phase = "main";
  });

  function changeTool(e: MouseEvent) {
    const target = e.target as HTMLButtonElement;
    if (target?.dataset?.tool) {
      const nextTool = target.dataset.tool as ApplianceNames;
      room.setMemberState({ currentApplianceName: nextTool });
    }
  }

  function openApp(e: MouseEvent) {
    const target = e.target as HTMLButtonElement;
    if (target?.dataset?.appKind && target?.dataset?.appIndex) {
      const kind = target.dataset.appKind;
      const index = +target.dataset.appIndex;
      const { configs } = apps.find(a => a.kind === kind) as AppGroup;
      window.manager.addApp(configs[index]);
    }
  }

  function resetAll(e: MouseEvent) {
    reset({ clearScreen: e.shiftKey, reload: e.ctrlKey || e.metaKey });
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === "Shift" && e.shiftKey) {
      shareMode = "new-room";
    }
  }

  function keyup(e: KeyboardEvent) {
    if (e.key === "Shift" && !e.shiftKey) {
      shareMode = "share";
    }
  }

  async function shareOrCreateRoom() {
    if (shareMode === "share") {
      const { uuid, roomToken } = room;
      const query = new URLSearchParams();
      query.set("uuid", uuid);
      query.set("roomToken", roomToken);
      const url = share(query);
      let fail = false;
      await navigator.clipboard.writeText(url).catch(() => {
        fail = true;
      });
      prompt(`${fail ? "Failed to copy" : "Copied"} share url`, url);
    }
    if (shareMode === "new-room") {
      const roomInfo = await createRoom();
      const url = share(roomInfo);
      window.open(url, "_blank");
      shareMode = "share";
    }
  }
</script>

<svelte:window on:keydown={keydown} on:keyup={keyup} />

{#if phase === "prepare"}
  <div>Preparing...</div>
{:else if phase === "404"}
  <div>404 Not Found Room.</div>
{:else if phase === "register-apps"}
  <div>Registering Apps...</div>
{:else if phase === "join-room"}
  <div>Joining Room...</div>
{:else}
  <div id="tools" on:click={changeTool}>
    {#each tools as name}
      <button data-tool={name} class:active={name === tool}>{name}</button>
    {/each}
    <button
      class="new-page-btn"
      title="copy share url to clipboard
press shift to create new room"
      on:click={shareOrCreateRoom}
    >
      {shareMode
        .split("-")
        .map(e => e.toUpperCase())
        .join(" ")}
    </button>
    <button
      class="reset-btn"
      title="remove all apps, reset camera
press ctrl/meta to reload page
press shift to clear screen"
      on:click={resetAll}
    >
      RESET
    </button>
  </div>
  <div class="two-side">
    <div id="actions" on:click={openApp}>
      {#each apps as { kind, configs }}
        <strong>{kind}</strong>
        {#each configs as app, i}
          <button data-app-kind={kind} data-app-index={i}>
            {app.options?.title || `${app.kind} ${i + 1}`}
          </button>
        {/each}
      {/each}
    </div>
    <div id="whiteboard" use:init />
  </div>
{/if}
