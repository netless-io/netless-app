## @netless/app-plyr

Netless App for playing video and audio.

### Usage

```ts
manager.addApp({
  kind: "Plyr",
  options: {
    title: "YouTube",
  },
  attributes: {
    src: "https://www.youtube.com/embed/bTqVqk7FSmY",
    provider: "youtube",
  },
});
```

### `m3u8` support

HLS support is provided by [video-dev/hls.js](https://github.com/video-dev/hls.js).

NOTES:

- To reduce the package size, hls.js is loaded [dynamically](https://cdn.jsdelivr.net/npm/hls.js/) using script tag.
- If you do not believe in this cdn, you can prepare `window.Hls` before this app downloads.
- If you do not need HLS, you can set `window.Hls` to `false` or `null` to disable this loading, in which case you will not able to play hls streaming unless the browser support it natively.

### YouTube captions with the existing custom UI

Keep the current Plyr integration and enable the YouTube CC/settings entry when creating an App:

```ts
await manager.addApp({
  kind: "Plyr",
  options: { title: "YouTube" },
  attributes: {
    src: "https://www.youtube.com/embed/POq5FCnwCbI",
    provider: "youtube",
    useNewPlayer: true, // Existing Controller path; does not mean upgrading the Plyr library.
    useCustomControls: true,
    youtubeNativeControls: true,
    paused: true,
  },
});
```

`youtubeNativeControls` is optional, defaults to disabled, and is read at creation time. With it enabled, the original custom playback bar keeps its overlay layout, gradient and show/hide behavior. YouTube CC/settings remain inside the video. The integration sets `youtube.controls=1` while keeping Plyr's UI initialization, event forwarding, and teardown. Setting `youtube.customControls=false` skips that lifecycle in Plyr 3.7.x and is unsuitable for the existing Controller.

The tested/default example configuration is `useCustomControls: true`. Native play/pause actions from a writable client also update the existing `playTimeState`. Remote synchronization has a two-second acknowledgement guard; rapid transport changes during this window still need further testing. A read-only client cannot write playback state; YouTube's cross-origin native UI can change its local playback temporarily, and the existing synchronization check restores the shared state.

YouTube does not provide a "CC/settings only" mode: `controls=0` also hides those two buttons, and the parent page cannot inject CSS into the cross-origin iframe. `fs=0` hides the native fullscreen button. Other native controls remain available. The integration samples the public `getVolume()` / `isMuted()` API every 250ms to keep Plyr's cached state and the original custom volume UI consistent after native changes. `syncVolume` / `syncMuted` and writable permissions still apply; the sampler stops on destruction.

The Controller exposes local caption preferences:

```ts
const controller = manager.queryOne(appId)?.appResult?.controller;
const options = controller?.getYouTubeCaptionOptions() ?? [];
if (options.includes("fontSize")) {
  controller?.setYouTubeCaptionFontSize(1); // Integer from -1 to 3.
}
controller?.reloadYouTubeCaptions();
```

Call these after the YouTube caption module becomes available (`onApiChange` on `controller.player.embed`), or check the options again after enabling CC. The setters return `false` when the module/option is unavailable, the size is invalid, or the Controller was destroyed. `true` means the command was submitted; it is not a YouTube server acknowledgement.

For the tested video, English automatic captions render through native CC even though `getOption("captions", "tracklist")` returns `[]`. An empty list does not prove that subtitles are unavailable. Plyr's own captions setup skips YouTube, and initial caption parameters do not guarantee automatic captions will start enabled. YouTube's saved user preferences can also affect the default.

Caption visibility, language and font size remain local preferences. This integration uses the documented `fontSize` and `reload` options; it does not promise programmatic language/translation selection through undocumented `track` APIs. See the [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference).

Verified in current Chromium with the branch's locked Plyr 3.7.8, with standalone comparisons on 3.7.2 and 3.8.4. Older iOS/Android/WebView devices still require device testing; generating an ES5 bundle alone does not establish device compatibility.

### `autoplay` not working

Autoplay is generally not recommended as it is seen as a negative user experience. It is also disabled in many browsers. Before raising issues, do your homework. More info can be found here:

- https://webkit.org/blog/6784/new-video-policies-for-ios
- https://developers.google.com/web/updates/2017/09/autoplay-policy-changes
- https://hacks.mozilla.org/2019/02/firefox-66-to-block-automatically-playing-audible-video-and-audio

### License

MIT @ [netless](https://github.com/netless-io)
