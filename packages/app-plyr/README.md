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

### YouTube native controls with one publisher (experimental)

Create a player with the stable UID of the user who adds it:

```ts
manager.addApp({
  kind: "Plyr",
  options: { title: "YouTube" },
  attributes: {
    src: "https://www.youtube.com/embed/POq5FCnwCbI",
    provider: "youtube",
    useNewPlayer: true,
    useCustomControls: true,
    youtubeInteractionMode: "owner",
    youtubeOwnerUid: room.uid,
    paused: true,
  },
});
```

Native YouTube controls, CC and settings remain open, with no input shield or
button coordinates. The writable creator publishes stable native play/pause,
progress and playback rate. Buffering/loading never publishes; after recovery,
a progress difference over one second re-anchors the room to the creator.

All other clients follow the room, including other writable users. Their native
play/pause/seek is corrected locally using seek or rate adjustment; it never
publishes. Writable users can still issue room commands using the original custom
controls. Read-only users cannot issue custom transport commands. CC stays local.
The custom UI's appearance and input handlers are unchanged.

`youtubePlayback` is an atomic target containing a unique ID, author, source,
play-time anchor and base rate. New room commands take priority until observed
on the creator's engine. No fixed ignore timeout is used. Refresh/reconnect and
publisher handback first restore the current target. The newest live writable
room connection with the creator UID is the only native publisher. The host must
supply stable `room.uid` and matching `userPayload.uid`. There is no automatic
promotion to a different user if the creator leaves; other writers' custom
controls still work.

Stable playback and rate events recheck the newest target if a native operation
replaced a pending command. Frame sampling alone keeps unconfirmed commands
deduplicated; buffering does not release them or authorize native publication.
Paused scrubbing may emit no state event. A new paused position also permits
a retry; unchanged observations do not. Target confirmation keeps the existing
one-second tolerance.

Native volume/mute update the custom UI from actual observations. `syncVolume`
shares both volume and mute; `syncMuted` can also share mute alone when volume
sync is off. Only the native publisher can publish native audio; writable custom
audio commands use the same effective sync flags. On other clients, including
read-only clients, shared audio fields return to room values after native input;
fields with synchronization disabled stay local and mirror the custom UI.
Correction waits until transport application and muted decoder priming finish.

Audio command targets and rendering are separate. Known old observations and
superseded command values do not echo into the room. A different observed volume
can supersede an unconfirmed audio command; this is a conflict policy, not proof
of a native click. YouTube has no command IDs, so coincident values cannot always
be attributed. Pending confirmation never freezes the custom audio UI. Playback
and progress retain their separate room-target priority rules.

On creation, an existing playback target is preserved; otherwise the initial
target respects `paused` (default `true`). Autoplay still follows browser policy.

This mode changes native playback synchronization only for YouTube. Default/
`legacy` behavior and other providers retain the original playback/seek logic;
the zero-volume fix, effective mute sync and permission cursors apply to all
Controller-based players. The
previous coordinate-based `overlay` mode is retained as an explicit opt-in but is
no longer used by the window-manager example.

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

### License

MIT @ [netless](https://github.com/netless-io)
