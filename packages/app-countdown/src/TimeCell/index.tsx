import { useState, useEffect } from "preact/hooks";
import type { FunctionalComponent } from "preact";
import { memo } from "preact/compat";
import classNames from "classnames";

interface TimeCellProps {
  digit: number;
  disabled?: boolean;
  onUp?: () => void;
  onDown?: () => void;
}

export const TimeCell: FunctionalComponent<TimeCellProps> = memo(
  ({ digit, disabled, onUp, onDown }) => {
    const [oldDigit, setOldDigit] = useState(0);
    const [flipped, setFlipped] = useState(false);

    useEffect(() => {
      if (disabled) {
        setFlipped(true);
        const timeout = window.setTimeout(() => {
          setFlipped(false);
          setOldDigit(digit);
        }, 500);
        return () => window.clearTimeout(timeout);
      } else {
        setOldDigit(digit);
      }
    }, [digit]);

    return (
      <div class={classNames("time-cell", { disabled })}>
        <div class="time-cell-up" onClick={disabled ? void 0 : onUp} />
        <div class="rotor">
          <div class={classNames("rotor-leaf", { flipped })}>
            <figure class="rotor-leaf-rear">{digit}</figure>
            <figure class="rotor-leaf-front">{oldDigit}</figure>
          </div>
          <div class="rotor-top">{digit}</div>
          <div class="rotor-bottom">{oldDigit}</div>
        </div>
        <div class="time-cell-down" onClick={disabled ? void 0 : onDown} />
      </div>
    );
  }
);
