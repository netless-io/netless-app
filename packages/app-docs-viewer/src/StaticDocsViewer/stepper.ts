export interface StepperConfig {
  start?: number;
  stiffness?: number;
  damping?: number;
  onStep: (value: number) => void;
}

export class Stepper {
  public stiffness: number;
  public damping: number;

  public current: number;
  public target: number;
  public velocity = 0;
  public onStep: (value: number, stepper: Stepper) => void;
  public paused = true;

  protected _animationFrameID: number | null = null;
  protected _loopTimestamp = 0;

  public constructor(config: StepperConfig) {
    this.current = config.start ?? 0;
    this.target = this.current;
    this.stiffness = config.stiffness ?? 170;
    this.damping = config.damping ?? 26;
    this.onStep = config.onStep;
  }

  public stepTo(target: number, start?: number) {
    if (this.paused && start != null) {
      this.current = start;
    }
    this.paused = false;
    this.target = target;
    this.onStep(this.current, this);
    this._loopTimestamp = Date.now();
    window.requestAnimationFrame(this.looper);
  }

  public pause() {
    this.paused = true;
  }

  public destroy() {
    this.pause();
  }

  protected looper = (timestamp: number) => {
    if (this.paused) {
      return;
    }

    let frames = Math.floor(((timestamp - this._loopTimestamp) / 1000) * 60) + 1;
    this._loopTimestamp = timestamp;
    while (frames-- > 0) {
      this.stepper();
    }

    this.onStep(this.current, this);

    if (!this.paused && this.current !== this.target) {
      window.requestAnimationFrame(this.looper);
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
    } else {
      this.current = newCurrent;
      this.velocity = newVelocity;
    }
  }
}
