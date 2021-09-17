import type { AppContext, Room } from "@netless/window-manager";
import type { JSX } from "preact";
import { Component } from "preact";
import { PureComponent } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import type { Attributes } from "./index";

interface ControllerProps {
  context: AppContext<Attributes>;
  room: Room;
}

interface FlipDownState {
  seconds: number;
  stopped: boolean;
  isInit: boolean;
  isDone: boolean;
}

interface FlipDownProps {
  start(): void;
  reset(): void;
  init(total?: number): void;
}

export default class Controller extends Component<ControllerProps, FlipDownState & FlipDownProps> {
  private attributes: Attributes;

  // hold the requestAnimationFrame handler
  private raf = 0;

  constructor(props: ControllerProps) {
    super(props);
    this.raf = requestAnimationFrame(this.update);
    this.attributes = props.context.getAttributes() as Attributes;
    this.state = {
      isInit: true,
      isDone: false,
      seconds: 0,
      stopped: true,
      start: this.start,
      reset: this.reset,
      init: this.init,
    };
  }

  // 继续 / 暂停
  start = (): void => {
    const { context, room } = this.props;
    const { start, pause, total } = this.attributes.state;
    const now = room.calibrationTimestamp;
    if (pause) {
      context.updateAttributes(["state"], { start: now - (pause - start), pause: 0, total });
    } else {
      context.updateAttributes(["state", "pause"], now);
    }
  };

  // 重置
  reset = (): void => {
    const { context } = this.props;
    context.updateAttributes(["state"], { start: 0, pause: 0, total: 0 });
    this.setState({ isDone: false });
  };

  // 开始
  init = (total?: number): void => {
    const { context, room } = this.props;
    context.updateAttributes(["state"], {
      start: room.calibrationTimestamp,
      pause: 0,
      total: total || 0,
    });
  };

  update = (): void => {
    this.raf = requestAnimationFrame(this.update);
    const { context, room } = this.props;
    this.attributes = context.getAttributes() as Attributes;
    const { start, pause, total } = this.attributes.state;

    const isInit = start === 0;
    const stopped = isInit || pause !== 0;
    let seconds = 0;
    if (start) {
      if (pause) {
        seconds = ((pause - start) / 1000) | 0;
      } else {
        seconds = ((room.calibrationTimestamp - start) / 1000) | 0;
      }
    }
    if (total) {
      if (seconds > total) {
        // 倒计时结束
        !pause && this.start();
        this.setState({ isDone: true });
      }
      seconds = Math.max(total - seconds, 0);
    }

    this.setState({ isInit, stopped, seconds });
  };

  override componentWillUnmount(): void {
    console.log("[Countdown]: unmount");
    cancelAnimationFrame(this.raf);
  }

  render(): JSX.Element {
    return <FlipCountDown {...this.state} />;
  }
}

type FlipCountDownProps = FlipDownState & FlipDownProps;

interface FlipCountDownState {
  total: [number, number, number, number];
}

export class FlipCountDown extends PureComponent<FlipCountDownProps, FlipCountDownState> {
  constructor(props: FlipCountDownProps) {
    super(props);
    this.state = {
      total: [0, 0, 0, 0],
    };
  }

  private correctValueFormat = (value: number): { left: number; right: number } => {
    return { left: Math.floor(value / 10), right: value % 10 };
  };

  private transformTime = () => {
    if (this.props.isInit) {
      const { total } = this.state;
      return {
        minutes_left: total[0],
        minutes_right: total[1],
        seconds_left: total[2],
        seconds_right: total[3],
      };
    }
    const current = this.props.seconds;
    const minutes = Math.floor((current % (60 * 60)) / 60);
    const seconds = Math.floor(current % 60);
    const m = this.correctValueFormat(minutes);
    const s = this.correctValueFormat(seconds);
    return {
      minutes_left: m.left,
      minutes_right: m.right,
      seconds_left: s.left,
      seconds_right: s.right,
    };
  };

  private handleInit = () => {
    const [a, b, c, d] = this.state.total;
    this.props.init((a * 10 + b) * 60 + (c * 10 + d));
  };

  private handleReset = () => {
    this.props.reset();
    this.setState({ total: [0, 0, 0, 0] });
  };

  private handleInc = (index: number) => () => {
    const nextTotal = this.state.total.map((e, i) => (i === index ? (e + 1) % 10 : e));
    if (index === 2 && nextTotal[index] > 5) {
      nextTotal[index] = 0;
    }
    this.setState({ total: nextTotal as FlipCountDownState["total"] });
  };
  private incMinutesLeft = this.handleInc(0);
  private incMinutesRight = this.handleInc(1);
  private incSecondsLeft = this.handleInc(2);
  private incSecondsRight = this.handleInc(3);

  private handleDec = (index: number) => () => {
    const nextTotal = this.state.total.map((e, i) => (i === index ? (e + 9) % 10 : e));
    if (index === 2 && nextTotal[index] > 5) {
      nextTotal[index] = 5;
    }
    this.setState({ total: nextTotal as FlipCountDownState["total"] });
  };
  private decMinutesLeft = this.handleDec(0);
  private decMinutesRight = this.handleDec(1);
  private decSecondsLeft = this.handleDec(2);
  private decSecondsRight = this.handleDec(3);

  // eslint-disable-next-line
  public render() {
    const { isInit, isDone, stopped, start } = this.props;
    const { seconds_left, seconds_right, minutes_right, minutes_left } = this.transformTime();

    const className = isDone ? "flipdown flipdown__theme-light" : "flipdown flipdown__theme-dark";

    return (
      <div class="flipdown-box">
        {!isInit && (
          <div class="flipdown-mask">
            {stopped ? (
              <div class="flipdown-mask-mid">
                <button onClick={this.handleReset} class="flipdown-mask-btn">
                  重置
                </button>
                {!isDone && (
                  <button onClick={start} class="flipdown-mask-btn">
                    继续
                  </button>
                )}
              </div>
            ) : (
              <div class="flipdown-mask-mid">
                <button onClick={start} class="flipdown-mask-btn">
                  暂停
                </button>
              </div>
            )}
          </div>
        )}
        <div class={className}>
          <div class="flipdown-mid-box">
            <TimeCell
              style={{ marginRight: 8 }}
              disabled={!isInit}
              time={minutes_left}
              onUp={this.incMinutesLeft}
              onDown={this.decMinutesLeft}
            />
            <TimeCell
              time={minutes_right}
              disabled={!isInit}
              onUp={this.incMinutesRight}
              onDown={this.decMinutesRight}
            />
          </div>
          <div class="flipdown-point-box">
            <div style="margin-bottom: 12px" />
            <div />
          </div>
          <div class="flipdown-mid-box">
            <TimeCell
              style={{ marginRight: 8 }}
              disabled={!isInit}
              time={seconds_left}
              onUp={this.incSecondsLeft}
              onDown={this.decSecondsLeft}
            />
            <TimeCell
              time={seconds_right}
              disabled={!isInit}
              onUp={this.incSecondsRight}
              onDown={this.decSecondsRight}
            />
          </div>
        </div>
        {isInit && (
          <div class="flipdown-buttons">
            <button onClick={this.handleInit} class="flipdown-button">
              开始
            </button>
          </div>
        )}
      </div>
    );
  }
}

interface TimeCellProps {
  time: number;
  style?: JSX.HTMLAttributes["style"];
  disabled?: boolean;
  onUp?: () => void;
  onDown?: () => void;
}

const TimeCell = ({ time, style, disabled, onUp, onDown }: TimeCellProps) => {
  const [flipdown, setFlipDown] = useState("rotor-leaf");
  const [oldTime, setOldTime] = useState(0);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (disabled || shift) {
      setShift(1);
      setFlipDown("rotor-leaf flipped");
      setTimeout(() => {
        setFlipDown("rotor-leaf");
        setOldTime(time);
      }, 500);
      !disabled && setShift(0);
    } else {
      setOldTime(time);
    }
  }, [time, disabled]);

  const className = disabled ? "flipdown-digit disabled" : "flipdown-digit";

  return (
    <div class={className} style={style}>
      <div class="flipdown-up" onClick={disabled ? void 0 : onUp} />
      <div class="rotor">
        <div class={flipdown}>
          <figure class="rotor-leaf-rear">{time}</figure>
          <figure class="rotor-leaf-front">{oldTime}</figure>
        </div>
        <div class="rotor-top">{time}</div>
        <div class="rotor-bottom">{oldTime}</div>
      </div>
      <div class="flipdown-down" onClick={disabled ? void 0 : onDown} />
    </div>
  );
};
