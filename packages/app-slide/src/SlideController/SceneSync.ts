import type { AppContext } from "@netless/window-manager";
import type { Slide, SyncEvent, SyncEventOrigin } from "@netless/slide";
import type { Attributes } from "../typings";

export type EventOrigin = SyncEventOrigin;

export function isOwnWritableEvent(context: AppContext<Attributes>, origin?: EventOrigin) {
  return Boolean(
    context.getRoom() &&
      context.getIsWritable() &&
      origin?.authorId !== undefined &&
      origin.authorId === context.getDisplayer().observerId
  );
}

export function withTransportAuthor(event: SyncEvent, authorId: number): SyncEvent & EventOrigin {
  return { ...event, authorId };
}

/** One per SlideController; serializes shared scene writes and coalesces pending renders. */
export class SceneSync {
  private initialized = false;
  private destroyed = false;
  private running = false;
  private pending?: { page: number; origin?: EventOrigin };

  constructor(
    private context: AppContext<Attributes>,
    private slide: () => Slide,
    private report: (error: unknown) => void
  ) {}

  public renderEnd = (page: number, origin?: EventOrigin): void => {
    if (this.destroyed || !Number.isInteger(page) || page < 1) return;
    // renderEnd precedes slideState.currentSlideIndex being updated.
    this.pending = { page, origin };
    void this.flush();
  };

  public destroy = (): void => {
    this.destroyed = true;
    this.pending = undefined;
  };

  private initialize(base: string): boolean {
    if (this.initialized || !this.context.isAddApp || !this.context.getIsWritable()) return false;
    const room = this.context.getRoom();
    const count = this.slide().slideCount;
    if (!room || !Number.isInteger(count) || count < 1) return false;
    // WindowManager creates a placeholder page for a fresh App. Replace it once,
    // before any numbered PPT page exists, so native scene indexes match PPT pages.
    // Existing numbered pages/strokes are preserved; navigation never rebuilds them.
    const missing = Array.from({ length: count }, (_, i) => ({ name: String(i + 1) })).filter(
      scene => room.scenePathType(`${base}/${scene.name}`) !== "page"
    );
    if (!missing.length) {
      this.initialized = true;
      return false;
    }
    if (missing.length === count) room.removeScenes(base);
    room.putScenes(base, missing);
    // SDK failures leave initialization retryable on the next renderEnd.
    this.initialized = true;
    return true;
  }

  private async flush(): Promise<void> {
    if (this.running || this.destroyed) return;
    this.running = true;
    let attempted = this.pending;
    try {
      while (this.pending && !this.destroyed) {
        const target = this.pending;
        attempted = target;
        const base = this.context.getInitScenePath();
        if (!base) {
          this.pending = undefined;
          return;
        }
        const path = `${base}/${target.page}`;
        const initialized = this.initialize(base);
        if (initialized) await this.context.setScenePath(path);
        if (this.destroyed) return;
        if (target !== this.pending) continue;
        // Persist the scene through WindowManager for every host. Only the
        // initiating writable client publishes navigation; receivers follow it.
        if (!initialized && isOwnWritableEvent(this.context, target.origin)) {
          const room = this.context.getRoom();
          if (room?.scenePathType(path) === "page") await this.context.setScenePath(path);
        }
        if (target === this.pending) this.pending = undefined;
      }
    } catch (error) {
      if (this.pending === attempted) this.pending = undefined;
      this.report(error);
    } finally {
      this.running = false;
      if (this.pending && !this.destroyed) void this.flush();
    }
  }
}
