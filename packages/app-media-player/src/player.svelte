<svelte:options immutable />

<script lang="ts">
  import Plyr from "plyr";
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import { guessTypeFromSrc, hlsTypes } from "./mime";
  import { importScript, loadHLS, safePlay } from "./utils";
  const dispatch = createEventDispatcher();

  export let src: string;
  export let type: string | undefined = undefined;
  export let poster: string | undefined = undefined;
  const computedType = type || guessTypeFromSrc(src);
  const useHLS = hlsTypes.includes(String(computedType).toLowerCase());

  let playerEl: HTMLAudioElement | HTMLVideoElement | undefined;
  let player: Plyr | undefined;

  export let volume = 100;
  export let muted = false;
  export let paused = true;
  export let currentTime = 0;

  $: {
    if (player) {
      if (player.volume !== volume) player.volume = volume;
      if (player.muted !== muted) player.muted = muted;
      if (player.paused !== paused) {
        paused ? player.pause() : safePlay(player);
      }
      let diff = currentTime - player.currentTime;
      if (paused ? diff !== 0 : Math.abs(diff) > 1) {
        player.currentTime = currentTime;
      }
    }
  }

  function setup(player: Plyr) {
    if (import.meta.env.DEV) {
      (window as any).player = player;
    }

    player.once("canplay", () => {
      player.currentTime = currentTime;
    });

    player.on("ended", () => {
      player.stop();
      dispatch("update:attrs", {
        paused: true,
        currentTime: 0,
      });
    });

    let playBtn: HTMLButtonElement | undefined;
    let seekBar: HTMLInputElement | undefined;
    let muteBtn: HTMLButtonElement | undefined;
    let volumeBar: HTMLInputElement | undefined;

    const playBtns = player.elements.buttons.play;
    if (playBtns) {
      playBtn = Array.isArray(playBtns) ? playBtns[0] : playBtns;
    }
    if (player.elements.controls) {
      seekBar = player.elements.controls.querySelector(
        'input[data-plyr="seek"]'
      ) as HTMLInputElement;

      muteBtn = player.elements.controls.querySelector(
        'button[data-plyr="mute"]'
      ) as HTMLButtonElement;

      volumeBar = player.elements.controls.querySelector(
        'input[data-plyr="volume"]'
      ) as HTMLInputElement;
    }

    playBtn?.addEventListener("click", () => {
      dispatch("update:attrs", {
        paused: player.paused,
        currentTime: player.currentTime,
      });
    });

    seekBar?.addEventListener("change", () => {
      dispatch("update:attrs", {
        currentTime: player.currentTime,
      });
    });

    muteBtn?.addEventListener("click", () => {
      dispatch("update:attrs", {
        muted: player.muted,
      });
    });

    volumeBar?.addEventListener("change", () => {
      dispatch("update:attrs", {
        volume: player.volume,
      });
    });
  }

  function setupPlayer(playerEl: HTMLAudioElement | HTMLVideoElement) {
    player = new Plyr(playerEl, {
      fullscreen: { enabled: false },
      controls: ["play", "progress", "current-time", "mute", "volume"],
    });
    setup(player);
  }

  onMount(async () => {
    if (playerEl) {
      if (useHLS && !playerEl.canPlayType("application/vnd.apple.mpegurl")) {
        const hls = await loadHLS();
        hls.loadSource(src);
        hls.attachMedia(playerEl);
      }
      setupPlayer(playerEl);
    }
  });

  onDestroy(() => {
    try {
      player?.destroy();
    } catch {}
  });
</script>

{#if !computedType}
  <div class="plyr--audio">
    Invalid "src" or "type".
    {JSON.stringify({ src, type })}
  </div>
{:else if computedType.startsWith("audio/")}
  <audio data-app-kind="MediaPlayer" data-poster={poster} bind:this={playerEl}>
    <source {src} type={computedType} />
  </audio>
{:else}
  <!-- svelte-ignore a11y-media-has-caption -->
  <video
    data-app-kind="MediaPlayer"
    crossorigin="anonymous"
    playsinline
    data-poster={poster}
    bind:this={playerEl}
  >
    <source {src} type={computedType} />
  </video>
{/if}
