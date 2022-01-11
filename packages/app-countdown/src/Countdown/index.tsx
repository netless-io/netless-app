import { useState, useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { memo } from "preact/compat";
import type { TimeAdjustment } from "../Clock";
import { Clock } from "../Clock";

export interface CountdownProps {
  readonly: boolean;
  countdownSecs: number;
  startTime: number;
  paused: boolean;
  onAdjustTime: (adjustment: TimeAdjustment) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export const Countdown: FunctionalComponent<CountdownProps> = memo(
  ({
    readonly,
    countdownSecs,
    startTime,
    paused,
    onAdjustTime,
    onStart,
    onPause,
    onResume,
    onReset,
  }) => {
    const [now, setNow] = useState(0);

    const started = startTime > 0 && now >= startTime;
    const amountInSecs = countdownSecs - (started ? now - startTime : 0);
    const minutes = Math.floor(amountInSecs / 60);
    const seconds = amountInSecs - minutes * 60;

    useEffect(() => {
      let timeout = NaN;
      if (countdownSecs > 0 && startTime > 0 && !paused) {
        const updateNow = () => {
          setNow(Math.floor(Date.now() / 1000));
          timeout = window.requestAnimationFrame(updateNow);
        };
        updateNow();
        return () => window.cancelAnimationFrame(timeout);
      } else {
        window.cancelAnimationFrame(timeout);
      }
    }, [startTime, paused, countdownSecs]);

    useEffect(() => {
      if (startTime > 0 && now - startTime >= countdownSecs) {
        onReset();
      }
    }, [now, startTime, countdownSecs, onReset]);

    return (
      <div class="netless-app-countdown">
        <div class="netless-app-countdown-shrink">
          <Clock
            minutes={minutes}
            seconds={seconds}
            disabled={readonly || started}
            onAdjustTime={onAdjustTime}
          />
          <div class="netless-app-countdown-btns">
            {paused ? (
              <>
                <button onClick={onReset} disabled={readonly}>
                  Reset
                </button>
                <button onClick={onResume} disabled={readonly}>
                  Resume
                </button>
              </>
            ) : started ? (
              <button onClick={onPause} disabled={readonly}>
                Pause
              </button>
            ) : (
              <button onClick={onStart} disabled={readonly || amountInSecs <= 0}>
                Start
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);
