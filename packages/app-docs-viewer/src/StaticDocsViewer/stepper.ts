export interface StepperConfig {
  start?: number;
  stiffness?: number;
  damping?: number;
  onStep?: (value: number) => void;
}

export class Stepper {
  public stiffness: number;
  public damping: number;

  public current: number;
  public target: number;
  public velocity = 0;
  public onStep?: (value: number) => void;

  public get paused(): boolean {
    return this._paused;
  }

  private _paused = true;
  private _animationFrameID: number | null = null;
  private _loopTimestamp = 0;

  public constructor(config: StepperConfig) {
    this.current = config.start ?? 0;
    this.target = this.current;
    this.stiffness = config.stiffness ?? 170;
    this.damping = config.damping ?? 26;
    this.onStep = config.onStep;
  }

  public stepTo(target: number, start?: number) {
    if (this._paused && start != null) {
      this.current = start;
    }
    this._paused = false;
    this.target = target;
    this.onStep?.(this.current);
    this._loopTimestamp = Date.now();
    this._animationFrameID = window.requestAnimationFrame(this.looper);
  }

  public pause() {
    this._paused = true;
    if (this._animationFrameID != null) {
      window.cancelAnimationFrame(this._animationFrameID);
    }
  }

  public destroy() {
    this.pause();
    this.onStep = undefined;
  }

  protected looper = (timestamp: number) => {
    if (this._paused) {
      return;
    }

    let frames = Math.floor(((timestamp - this._loopTimestamp) / 1000) * 60) + 1;
    this._loopTimestamp = timestamp;
    while (frames-- > 0) {
      this.stepper();
    }

    this.onStep?.(this.current);

    if (!this._paused) {
      this._animationFrameID = window.requestAnimationFrame(this.looper);
    } else {
      this._animationFrameID = null;
    }
  };

  // based on https://github.com/chenglou/react-motion/blob/master/src/stepper.js
  protected stepper() {
    const fSpring = -this.stiffness * (this.current - this.target);
    const fDamper = -this.damping * this.velocity;
    const newVelocity = this.velocity + (fSpring + fDamper) / 60;
    const newCurrent = this.current + newVelocity / 60;

    if (Math.abs(newVelocity - 0) < 0.01 && Math.abs(newCurrent - this.target) < 0.01) {
      this.current = this.target;
      this.velocity = 0;
      this._paused = true;
    } else {
      this.current = newCurrent;
      this.velocity = newVelocity;
    }
  }
}
