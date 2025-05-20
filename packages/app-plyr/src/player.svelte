<script lang="ts">
  import type { Storage } from "@netless/window-manager";
  import type { Attributes } from ".";
  import type { Sync } from "./sync";

  import { onDestroy, onMount } from "svelte";
  import { guessTypeFromSrc, hlsTypes } from "./mime";
  import { cannotPlayHLSNatively, loadHLS } from "./utils";
  import Plyr from "plyr";

  export let storage: Storage<Attributes>;
  export let sync: Sync;

  const type = storage.state.provider
    ? undefined
    : storage.state.type || guessTypeFromSrc(storage.state.src);
  const { src, poster } = storage.state;
  const useHLS = hlsTypes.includes(String(type).toLowerCase());

  let player_element: HTMLAudioElement | HTMLVideoElement | HTMLDivElement | undefined;
  let player: Plyr | undefined;
  let pcmAudioSource: MediaElementAudioSourceNode | undefined;

  const connectToPcmProxyIfPossible = (element: HTMLElement) => {
    const pcmProxy = (window as any).__pcmProxy;
    if (pcmProxy) {
      if (element instanceof HTMLVideoElement || element instanceof HTMLAudioElement) {
        console.log("[Plyr] connect pcm");
        pcmAudioSource = pcmProxy.connect?.(element);
      }
    }
  };

  onMount(async () => {
    if (player_element) {
      connectToPcmProxyIfPossible(player_element);

      if (useHLS && cannotPlayHLSNatively(player_element)) {
        const hls = await loadHLS();
        hls.loadSource(src);
        hls.attachMedia(player_element);
      }
      player = new Plyr(player_element, {
        fullscreen: { enabled: false },
        controls: ["play", "progress", "current-time", "mute", "volume"],
        clickToPlay: false,
        youtube: { autoplay: true },
      });
      sync.player = player;

      (window as any).__plyr = player;
      if (!pcmAudioSource) {
        const media = (player as any).media;
        if (media) {
          connectToPcmProxyIfPossible(media);
        }
      }
    }
  });

  onDestroy(() => {
    try {
      sync.dispose();
      player?.destroy();
      pcmAudioSource?.disconnect();
    } catch (e) {
      console.warn("[Plyr] destroy plyr error", e);
    }
  });
</script>

{#if storage.state.provider === "youtube"}
  <div
    data-app-kind="Plyr"
    class="plyr__video-embed"
    data-plyr-provider="youtube"
    data-plyr-embed-id={src}
    data-poster={poster}
    bind:this={player_element}
  />
{:else if !type}
  <div data-app-kind="Plyr" class="plyr--audio">
    Invalid "src" or "type".
    {JSON.stringify({ src: src, type: storage.state.type })}
  </div>
{:else if type.startsWith("audio/")}
  <audio
    data-app-kind="Plyr"
    crossorigin="anonymous"
    data-poster={poster}
    bind:this={player_element}
  >
    <source {src} {type} />
  </audio>
{:else}
  <!-- svelte-ignore a11y-media-has-caption -->
  <video
    data-app-kind="Plyr"
    crossorigin="anonymous"
    playsinline
    data-poster={poster}
    bind:this={player_element}
  >
    <source {src} {type} />
  </video>
{/if}
