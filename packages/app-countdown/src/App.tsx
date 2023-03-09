import { useState, useEffect, useCallback } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { memo } from "preact/compat";
import { TimeAdjustment } from "./Clock";
import { Countdown } from "./Countdown";
import type { AppContext, Storage } from "@netless/window-manager";

export interface StorageState {
  countdownSecs: number;
  startTime: number;
  paused: boolean;
}

interface AppProps {
  context: AppContext<Record<string, unknown>>;
  storage: Storage<StorageState>;
}

export const App: FunctionalComponent<AppProps> = memo(({ context, storage }) => {
  const [isWritable, setWritable] = useState(() => context.isWritable);
  const [countdownSecs, setCountdownSecs] = useState(storage.state.countdownSecs);
  const [startTime, setStartTime] = useState(storage.state.startTime);
  const [paused, setPaused] = useState(storage.state.paused);

  useEffect(() => {
    setWritable(context.isWritable);
    context.emitter.on("writableChange", setWritable);
    return () => context.emitter.off("writableChange", setWritable);
  }, [context]);

  useEffect(() => {
    const handler = (diff: Partial<Record<"countdownSecs" | "paused" | "startTime", unknown>>) => {
      if (diff.countdownSecs) {
        setCountdownSecs(storage.state.countdownSecs);
      }
      if (diff.paused) {
        setPaused(storage.state.paused);
      }
      if (diff.startTime) {
        setStartTime(storage.state.startTime);
      }
    };
    return storage.on("stateChanged", handler);
  }, [storage]);

  const started = startTime > 0;

  const onStart = useCallback(() => {
    if (context.isWritable) {
      storage.setState({ paused: false, startTime: Math.floor(Date.now() / 1000) });
    }
  }, [context, storage]);

  const onPause = useCallback(() => {
    if (context.isWritable) {
      storage.setState({ paused: true });
    }
  }, [context, storage]);

  const onResume = useCallback(() => {
    if (context.isWritable) {
      storage.setState({ paused: false });
    }
  }, [context, storage]);

  const onReset = useCallback(() => {
    if (context.isWritable) {
      storage.setState({ paused: false, countdownSecs: 0, startTime: 0 });
    }
  }, [context]);

  const onAdjustTime = useCallback(
    (adjustment: number) => {
      if (!started && context.isWritable) {
        const minutes = Math.floor(countdownSecs / 60);
        const seconds = countdownSecs - minutes * 60;
        const min1 = Math.floor(minutes / 10);
        const min2 = minutes % 10;
        const sec1 = Math.floor(seconds / 10);
        const sec2 = seconds % 10;

        let result: number;
        switch (adjustment) {
          case TimeAdjustment.AddTenMinutes: {
            const max = min2 + seconds === 0 ? 7 : 6;
            result = (((min1 + 1) % max) * 10 + min2) * 60 + seconds;
            break;
          }
          case TimeAdjustment.ReduceTenMinutes: {
            const max = min2 + seconds === 0 ? 7 : 6;
            result = (((min1 + max - 1) % max) * 10 + min2) * 60 + seconds;
            break;
          }
          case TimeAdjustment.AddOneMinute: {
            result = (Math.min(5, min1) * 10 + ((min2 + 1) % 10)) * 60 + seconds;
            break;
          }
          case TimeAdjustment.ReduceOneMinute: {
            result = (Math.min(5, min1) * 10 + ((min2 + 10 - 1) % 10)) * 60 + seconds;
            break;
          }
          case TimeAdjustment.AddTenSeconds: {
            result = minutes * 60 + (((sec1 + 1) % 6) * 10 + sec2);
            break;
          }
          case TimeAdjustment.ReduceTenSeconds: {
            result = minutes * 60 + (((sec1 + 6 - 1) % 6) * 10 + sec2);
            break;
          }
          case TimeAdjustment.AddOneSecond: {
            result = minutes * 60 + (Math.min(5, sec1) * 10 + ((sec2 + 1) % 10));
            break;
          }
          case TimeAdjustment.ReduceOneSecond: {
            result = minutes * 60 + (Math.min(5, sec1) * 10 + ((sec2 + 10 - 1) % 10));
            break;
          }
          default: {
            result = countdownSecs;
            break;
          }
        }

        storage.setState({ countdownSecs: result });
      }
    },
    [started, context]
  );

  return (
    <Countdown
      readonly={!isWritable}
      countdownSecs={countdownSecs}
      startTime={startTime}
      paused={paused}
      onAdjustTime={onAdjustTime}
      onStart={onStart}
      onPause={onPause}
      onResume={onResume}
      onReset={onReset}
    />
  );
});
