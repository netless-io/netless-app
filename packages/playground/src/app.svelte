<script context="module" lang="ts">
  import categorySVG from "./icons/category.svg";
  import appSVG from "./icons/app.svg";

  import type { Room, RoomState, ApplianceNames } from "white-web-sdk";

  import { createRoom, QueryVersion, replaceURL, share, store, type RoomInfo } from "./common";
  import { init, joinRoom, prepare, tools, reset } from "./room";
  import type { AppGroup } from "./apps";
  import { registerApps } from "./apps";
  import { copyToClipboard } from "./clipboard";

  let copyTimer = 0;
  let matchDark = window.matchMedia("(prefers-color-scheme: dark)");
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import Loading from "./loading.svelte";

  let phase: "prepare" | "404" | "join-room" | "main" = "prepare";
  let apps: AppGroup[];
  let room: Room;
  let tool: ApplianceNames;
  let shareMode: "share" | "new-room" = "share";
  let copyTip = "";
  let darkMode = matchDark.matches;

  $: {
    window.manager && window.manager.setPrefersColorScheme(darkMode ? "dark" : "light");
    document.documentElement.className = darkMode
      ? "netless-color-scheme-dark"
      : "netless-color-scheme-light";
  }

  $: PhaseLoadingMsg =
    phase === "prepare"
      ? "Preparing..."
      : phase === "404"
        ? "404 Room Not Found."
        : phase === "join-room"
          ? "Joining Room..."
          : "Loading...";

  onMount(async () => {
    matchDark.addEventListener("change", ev => {
      darkMode = ev.matches;
    });

    const roomInfo = await prepare();
    if (!roomInfo) {
      phase = "404";
      return;
    }

    apps = registerApps();

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
      store.setItem("currentApplianceName", nextTool);
    }
  }

  function openApp(e: MouseEvent) {
    const target = e.target as HTMLButtonElement;
    if (target?.dataset?.appKind && target?.dataset?.appIndex) {
      const kind = target.dataset.appKind;
      const index = +target.dataset.appIndex;
      const { configs } = apps.find(a => a.kind === kind) as AppGroup;
      if (index >= 0) {
        const config = configs[index];
        if (config.getAttributes) {
          const attributes = config.getAttributes();
          if (attributes == null) {
            return;
          }
          window.manager.addApp({
            kind,
            attributes,
            src: configs[0].src,
          });
        } else {
          window.manager.addApp(config);
        }
      }
    }
  }

  function resetAll(e: MouseEvent) {
    reset({ clearScreen: e.shiftKey, reload: e.ctrlKey || e.metaKey });
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === "Shift" && e.shiftKey && import.meta.env.VITE_TOKEN) {
      shareMode = "new-room";
    }
  }

  function keyup(e: KeyboardEvent) {
    if (e.key === "Shift" && !e.shiftKey) {
      shareMode = "share";
    }
  }

  async function shareOrCreateRoom(e: MouseEvent) {
    if (shareMode === "share") {
      const { uuid, roomToken } = room;
      const query: RoomInfo = { uuid, roomToken };
      const url = share(query);
      if (QueryVersion !== 2) {
        replaceURL(e.ctrlKey || e.metaKey ? "" : url);
      }
      try {
        await copyToClipboard(url);
        showTip("Copied share url.");
      } catch {
        showTip("Failed to write clipboard.");
      }
    }
    if (shareMode === "new-room") {
      const roomInfo = await createRoom();
      const url = share(roomInfo);
      window.open(url, "_blank");
      shareMode = "share";
    }
  }

  function showTip(str: string) {
    copyTip = str;
    clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => {
      copyTimer = 0;
      copyTip = "";
    }, 3000);
  }

  function toggleDarkMode() {
    darkMode = !darkMode;
  }
</script>

/** eslint-disable a11y-click-events-have-key-events */
<svelte:window on:keydown={keydown} on:keyup={keyup} />

{#if phase !== "main"}
  <div class="page-loading-wrap" transition:fade>
    <Loading>{PhaseLoadingMsg}</Loading>
  </div>
{:else}
  <div class="two-side">
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div id="actions" class="app-list" on:click={openApp}>
      {#each apps as { kind, configs, url } (kind)}
        <h2 class="app-list-kind">
          <a class="app-list-kind-link" href={url} target="_blank">
            <img class="app-list-kind-icon" src={categorySVG} alt={kind} />
            <span>{kind}</span>
          </a>
        </h2>
        {#each configs as app, i}
          <button class="app-list-open" data-app-kind={kind} data-app-index={i}>
            <img class="app-list-open-icon" src={appSVG} alt={app.options?.title} />
            {app.options?.title || `${app.kind} ${i + 1}`}
          </button>
        {/each}
      {/each}
    </div>
    <div class="right-side">
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <div class="nav-bar" on:click={changeTool}>
        <div class="nav-bar-tools-cursor-hider">
          <div class="nav-bar-tools">
            {#each tools as name (name)}
              <button data-tool={name} class:active={name === tool}>{name}</button>
            {/each}
          </div>
        </div>
        <div class="nav-bar-btns">
          <button
            class="new-page-btn"
            title="copy share url to clipboard
    press ctrl/meta to clear address bar
    press shift to create new room (only available with sdk token)"
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
          <a
            class="github-btn"
            href="https://github.com/netless-io/netless-app"
            target="_blank"
            title="View my source"
          >
            GITHUB
          </a>
          <button class="dark-mode-btn" on:click={toggleDarkMode} />
        </div>
      </div>
      <div id="whiteboard" use:init />
    </div>
  </div>
{/if}

{#if copyTip}
  <div class="tip" class:error={copyTip.includes("Failed")} in:fly={{ x: 200 }} out:fade>
    {copyTip}
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    bottom: 1em;
    right: 1em;
    color: #fff;
    background-color: #0074d9;
    padding: 1em;
    border-radius: 4px;
    box-shadow:
      0 4px 5px 0 rgba(0, 0, 0, 0.14),
      0 1px 10px 0 rgba(0, 0, 0, 0.12),
      0 2px 4px -1px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    font-family: Arial, sans-serif;
    font-size: small;
  }
  .tip.error {
    background-color: #ff4136;
  }
  .app-list-open * {
    pointer-events: none;
  }
</style>
