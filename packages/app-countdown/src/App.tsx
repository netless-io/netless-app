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
  const [countdownSecs, setCountdownSecs] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [paused, setPaused] = useState(false);

  const started = startTime > 0;

  const onStart = useCallback(() => {
    if (context.isWritable) {
      setPaused(false);
      setStartTime(Math.floor(Date.now() / 1000));
    }
  }, [context]);

  const onPause = useCallback(() => {
    if (context.isWritable) {
      setPaused(true);
    }
  }, [context]);

  const onResume = useCallback(() => {
    if (context.isWritable) {
      setPaused(false);
    }
  }, [context]);

  const onReset = useCallback(() => {
    if (context.isWritable) {
      setPaused(false);
      setCountdownSecs(0);
      setStartTime(0);
    }
  }, [context]);

  const onAdjustTime = useCallback(
    (adjustment: number) => {
      if (!started) {
        setCountdownSecs(countdownSecs => {
          if (!context.isWritable) {
            return countdownSecs;
          }
          const minutes = Math.floor(countdownSecs / 60);
          const seconds = countdownSecs - minutes * 60;
          const min1 = Math.floor(minutes / 10);
          const min2 = minutes % 10;
          const sec1 = Math.floor(seconds / 10);
          const sec2 = seconds % 10;

          switch (adjustment) {
            case TimeAdjustment.AddTenMinutes: {
              const max = min2 + seconds === 0 ? 7 : 6;
              return (((min1 + 1) % max) * 10 + min2) * 60 + seconds;
            }
            case TimeAdjustment.ReduceTenMinutes: {
              const max = min2 + seconds === 0 ? 7 : 6;
              return (((min1 + max - 1) % max) * 10 + min2) * 60 + seconds;
            }
            case TimeAdjustment.AddOneMinute: {
              return (Math.min(5, min1) * 10 + ((min2 + 1) % 10)) * 60 + seconds;
            }
            case TimeAdjustment.ReduceOneMinute: {
              return (Math.min(5, min1) * 10 + ((min2 + 10 - 1) % 10)) * 60 + seconds;
            }
            case TimeAdjustment.AddTenSeconds: {
              return minutes * 60 + (((sec1 + 1) % 6) * 10 + sec2);
            }
            case TimeAdjustment.ReduceTenSeconds: {
              return minutes * 60 + (((sec1 + 6 - 1) % 6) * 10 + sec2);
            }
            case TimeAdjustment.AddOneSecond: {
              return minutes * 60 + (Math.min(5, sec1) * 10 + ((sec2 + 1) % 10));
            }
            case TimeAdjustment.ReduceOneSecond: {
              return minutes * 60 + (Math.min(5, sec1) * 10 + ((sec2 + 10 - 1) % 10));
            }
            default: {
              return countdownSecs;
            }
          }
        });
      }
    },
    [started, context]
  );

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

  useEffect(() => {
    if (context.isWritable) {
      // unchanged values will be skipped automatically
      storage.setState({ countdownSecs, paused, startTime });
    }
  }, [countdownSecs, paused, startTime, context]);

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
