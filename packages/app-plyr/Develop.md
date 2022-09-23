## 同步播放器是如何工作的

播放器中最复杂的部分在于播放时间的同步，为了同步时间，我们至少需要一个时间校准服务和一致的信息存储服务，这两者在白板服务下表现为 `room.calibrationTimestamp`（会自动校准到接近的时间戳） 和 `storage.state`（同步状态）。

有两种策略可以用于同步：

- 维护并轮询理想的播放器状态（不考虑 buffering 等流程），尽量使真实播放器接近他。
- 指定单一状态源（他的状态并不一定理想），他发布所有的状态变更，其他人走上面一条的逻辑。

无论哪种策略，都需要我们识别出播放器状态变更的来源（是由代码、网络触发的还是用户手动触发的）。因此大部分情况下播放器的 UI 需要我们自己绘制。（当然，也可以利用事件里的 `isTrusted` 属性，不过这个只能用于原生播放器，youtube, vimeo 等第三方播放器就无能为力了。）

```ts
// 获取校准后的当前时间
const getTimestamp = () => {
  if (room) return room.calibrationTimestamp;
  if (player) return player.beginTimestamp + player.progressTime;
  return Date.now();
};

// 当播放器时间变化（由 seek 等用户操作触发）时存储到同步状态里
const onTimeUpdate = currentTime => {
  const timestamp = getTimestamp();
  state.set({ timestamp, currentTime });
};

// 当收到同步状态变化时，立刻同步播放器时间
const onMessage = ({ timestamp, currentTime }) => {
  const now = getTimestamp();
  // 当前播放器 "理应" 在的时间
  player.currentTime = currentTime + (now - timestamp) / 1000;
  // 注意：这行执行后 player 可能进入 buffering 状态，因此还需要轮询机来定期同步时间
};

// 没收到状态变化也轮询并同步播放器时间
setInterval(() => {
  const now = getTimestamp();
  player.currentTime = state.currentTime + (now - state.timestamp) / 1000;
}, 1000);
```
