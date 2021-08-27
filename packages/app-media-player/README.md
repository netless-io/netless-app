## @netless/app-media-player

### Usage

See [playground.ts](./playground.ts).

### `m3u8` support

HLS support is provided by [video-dev/hls.js](https://github.com/video-dev/hls.js).

NOTES:

- To reduce the package size, hls.js is loaded [dynamically](https://cdn.jsdelivr.net/npm/hls.js/) using script tag.
- If you do not believe in this cdn, you can prepare `window.Hls` before this app downloads.
- If you do not need HLS, you can set `window.Hls` to `false` or `null` to disable this loading, in which case you will not able to play hls streaming unless the browser support it natively.

### `autoplay` not working

Autoplay is generally not recommended as it is seen as a negative user experience. It is also disabled in many browsers. Before raising issues, do your homework. More info can be found here:

- https://webkit.org/blog/6784/new-video-policies-for-ios
- https://developers.google.com/web/updates/2017/09/autoplay-policy-changes
- https://hacks.mozilla.org/2019/02/firefox-66-to-block-automatically-playing-audible-video-and-audio

### Licence

MIT @ [netless](https://github.com/netless-io)
