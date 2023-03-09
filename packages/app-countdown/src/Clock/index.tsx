import { useMemo, useCallback } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { memo } from "preact/compat";
import { TimeCell } from "../TimeCell";

export enum TimeAdjustment {
  AddTenMinutes,
  ReduceTenMinutes,
  AddOneMinute,
  ReduceOneMinute,
  AddTenSeconds,
  ReduceTenSeconds,
  AddOneSecond,
  ReduceOneSecond,
}

export interface ClockProps {
  minutes: number;
  seconds: number;
  disabled?: boolean;
  onAdjustTime: (adjustment: TimeAdjustment) => void;
}

function useDigits(time: number): [number, number] {
  return useMemo(() => {
    time = time % 61;
    return [Math.floor(time / 10), time % 10];
  }, [time]);
}

function useAdjustTime(onAdjustTime: ClockProps["onAdjustTime"], adjustment: TimeAdjustment) {
  return useCallback(() => onAdjustTime(adjustment), [onAdjustTime]);
}

export const Clock: FunctionalComponent<ClockProps> = memo(
  ({ minutes, seconds, disabled, onAdjustTime }) => {
    const mins = useDigits(minutes);
    const secs = useDigits(seconds);

    const addTenMinutes = useAdjustTime(onAdjustTime, TimeAdjustment.AddTenMinutes);
    const reduceTenMinutes = useAdjustTime(onAdjustTime, TimeAdjustment.ReduceTenMinutes);
    const addOneMinute = useAdjustTime(onAdjustTime, TimeAdjustment.AddOneMinute);
    const reduceOneMinute = useAdjustTime(onAdjustTime, TimeAdjustment.ReduceOneMinute);
    const addTenSeconds = useAdjustTime(onAdjustTime, TimeAdjustment.AddTenSeconds);
    const reduceTenSeconds = useAdjustTime(onAdjustTime, TimeAdjustment.ReduceTenSeconds);
    const addOneSecond = useAdjustTime(onAdjustTime, TimeAdjustment.AddOneSecond);
    const reduceOneSecond = useAdjustTime(onAdjustTime, TimeAdjustment.ReduceOneSecond);

    return (
      <div className="countdown-clock">
        <TimeCell
          disabled={disabled}
          digit={mins[0]}
          onUp={addTenMinutes}
          onDown={reduceTenMinutes}
        />
        <TimeCell
          digit={mins[1]}
          disabled={disabled}
          onUp={addOneMinute}
          onDown={reduceOneMinute}
        />
        <div class="countdown-clock-divider" />
        <TimeCell
          disabled={disabled}
          digit={secs[0]}
          onUp={addTenSeconds}
          onDown={reduceTenSeconds}
        />
        <TimeCell
          digit={secs[1]}
          disabled={disabled}
          onUp={addOneSecond}
          onDown={reduceOneSecond}
        />
      </div>
    );
  }
);
