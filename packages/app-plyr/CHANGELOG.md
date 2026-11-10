# Changelog

## 0.2.14 - 2026-11-10

- Route Controller, legacy player, HLS and autoplay diagnostics through the
  current room logger, with a single `[Plyr]` prefix and a replay logger fallback.
- Deduplicate unchanged audio observations, consolidate seek and autoplay retry
  diagnostics, and report sync results instead of intermediate entry traces.
- Serialize structured details for SDK text logs instead of `[object Object]`.

## 0.2.13 - 2026-11-10

- Add opt-in YouTube `owner` interaction mode: the writable creator publishes
  stable native playback, position and rate; other clients follow room targets.
- Keep native captions and settings available, with captions remaining local.
  Writable clients can continue controlling the room through the existing custom
  controls, including seek.
- Recover pending transport commands when a newer stable result or paused
  position replaces a command. Apply the newest room target before allowing
  native observations to publish; buffering does not publish playback state.
- Mirror native audio into the custom UI and restore shared audio on followers.
  `syncVolume` now includes mute; `syncMuted` can still synchronize mute alone.
- Preserve zero volume, show unavailable control cursors for read-only users,
  respect explicit initial playback configuration and prevent late-ready adapter
  creation after destruction begins.
- Include an ES5 IIFE build. This does not establish support on all old WebViews.

### Known limitations

An earlier paused seek into media that had not become ready timed out: the room
target and native video time were 90 seconds, the videos remained at
`readyState=1`, and the outer YouTube API reported an older position despite a
retry. Its cause remains unconfirmed; this release does not claim to fix it.
Current acceptance includes 37 controlled Controller checks and 71 browser
checks, including explicitly injected command, sampling and media interruptions.

Owner mode requires compatible clients and a stable creator UID. Whiteboard
recording playback and live Vimeo E2E are outside the current validation scope.
