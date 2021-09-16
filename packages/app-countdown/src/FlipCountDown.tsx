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
}

interface FlipDownProps {
  start(): void;
  reset(): void;
  init(): void;
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
  };

  // 开始
  init = (): void => {
    const { context, room } = this.props;
    context.updateAttributes(["state"], { start: room.calibrationTimestamp, pause: 0, total: 0 });
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
      seconds = Math.max(total - seconds, 0);
    }

    this.setState({ isInit, stopped, seconds });
  };

  override componentWillUnmount(): void {
    console.log("componentWillUnmount");
    cancelAnimationFrame(this.raf);
  }

  render(): JSX.Element {
    return <FlipCountDown {...this.state} />;
  }
}

export class FlipCountDown extends PureComponent<FlipDownState & FlipDownProps> {
  private correctValueFormat = (value: number): { left: number; right: number } => {
    return { left: Math.floor(value / 10), right: value % 10 };
  };

  private transformTime = (): {
    minutes_left: number;
    minutes_right: number;
    seconds_left: number;
    seconds_right: number;
  } => {
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

  // eslint-disable-next-line
  public render() {
    const { seconds_left, seconds_right, minutes_right, minutes_left } = this.transformTime();
    return (
      <div class="flipdown-box">
        {!this.props.isInit && (
          <div class="flipdown-mask">
            {this.props.stopped ? (
              <div class="flipdown-mask-mid">
                <button onClick={this.props.reset} class="flipdown-mask-btn">
                  重置
                </button>
                <button onClick={this.props.start} class="flipdown-mask-btn">
                  继续
                </button>
              </div>
            ) : (
              <div class="flipdown-mask-mid">
                <button onClick={this.props.start} class="flipdown-mask-btn">
                  暂停
                </button>
              </div>
            )}
          </div>
        )}
        <div class="flipdown flipdown__theme-dark">
          <div class="flipdown-mid-box">
            <TimeCell style={{ marginRight: 8 }} time={minutes_left} />
            <TimeCell time={minutes_right} />
          </div>
          <div class="flipdown-point-box">
            <div style="margin-bottom: 12px" />
            <div />
          </div>
          <div class="flipdown-mid-box">
            <TimeCell style={{ marginRight: 8 }} time={seconds_left} />
            <TimeCell time={seconds_right} />
          </div>
        </div>
        {this.props.isInit && (
          <div>
            <button onClick={this.props.init} class="flipdown-button">
              开始
            </button>
            <div style={{ height: 20 }} />
          </div>
        )}
      </div>
    );
  }
}

type TimeCellProps = {
  time: number;
  style?: JSX.HTMLAttributes["style"];
};

const TimeCell = ({ time, style }: TimeCellProps) => {
  const [flipdown, setFlipDown] = useState("rotor-leaf");
  const [oldTime, setOldTime] = useState(0);

  useEffect(() => {
    setFlipDown("rotor-leaf flipped");
    setTimeout(() => {
      setFlipDown("rotor-leaf");
      setOldTime(time);
    }, 500);
  }, [time]);

  return (
    <div style={style} class="rotor">
      <div class={flipdown}>
        <figure class="rotor-leaf-rear">{time}</figure>
        <figure class="rotor-leaf-front">{oldTime}</figure>
      </div>
      <div class="rotor-top">{time}</div>
      <div class="rotor-bottom">{oldTime}</div>
    </div>
  );
};
