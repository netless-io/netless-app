## Caveats

- It only supports drawing lines (points) without width, color or other stuff.
- It does not have coords system, everything is related to
  the top-left corner of the window.
- It does not support multi inputs, only one point.

## How it Works

1. _Drawing_ line is a sequence of points `{x,y}[]`, stored locally.
2. _Drawn_ line is a sequence of cubic curves `{x,y}[4][]`, stored in attributes.
3. When some one is drawing, he broadcasts each new point to others.\
   When other get an _updated_ line, they draw it as the same way as the drawing guy.
4. If they do not have the full sequence of points of the line locally,\
   they draw it through curves. OPTIMIZE: interpolation.

## Pseudo-code

```js
let drawing = {}; // { [uid]: [ {x,y}, done: false ] }
let drawn = {}; // { [uid]: [ [ {x,y},{x,y},{x,y},{x,y} ] ] }
drawn = makeItSync(drawn);

let channel = createBroadcastChannel();
let curvesWorker = createCurvesWorker();

on("draw", (uid, newPoint) => {
  channel.send({ uid, newPoint });
});

on("draw end", uid => {
  drawing[uid].done = true;
  channel.send({ uid, done: true });
  curvesWorker.simplify(drawing[uid], curve => {
    drawn[uid] = curve;
  });
});

channel.on(({ uid, newPoint, done }) => {
  if (newPoint) drawing[uid].push(newPoint);
  if (done) drawing[uid].done = true;
  invalidate(uid);
});

function invalidate(uid) {
  if (uid in drawing) {
    getPath(uid).replace(drawing[uid]);
  } else if (uid in drawn) {
    getCurve(uid).replace(drawn[uid]);
  }
}
```
