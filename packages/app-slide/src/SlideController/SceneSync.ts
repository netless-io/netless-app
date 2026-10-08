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

// The installed plugin's runtime uses (scenePath, viewId), despite older declarations
// documenting the reverse order. Keep this adapter at the app integration boundary.
interface LocalScenePlugin {
  setViewLocalScenePathChange(scenePath: string, viewId: string): Promise<void>;
  currentManager?: {
    viewContainerManager: { getView(viewId: string): unknown };
  };
}

/** One per SlideController; retries only the most recently completed page. */
export class SceneSync {
  private initialized = false;
  private destroyed = false;
  private running = false;
  private pending?: { page: number; origin?: EventOrigin; expires: number };
  private retry?: ReturnType<typeof setTimeout>;

  constructor(
    private context: AppContext<Attributes>,
    private slide: () => Slide,
    private report: (error: unknown) => void
  ) {}

  public renderEnd = (page: number, origin?: EventOrigin): void => {
    if (this.destroyed || !Number.isInteger(page) || page < 1) return;
    // renderEnd precedes slideState.currentSlideIndex being updated.
    this.pending = { page, origin, expires: Date.now() + 20_000 };
    if (this.retry !== undefined) clearTimeout(this.retry);
    this.retry = undefined;
    void this.flush();
  };

  public destroy = (): void => {
    this.destroyed = true;
    this.pending = undefined;
    if (this.retry !== undefined) clearTimeout(this.retry);
  };

  private initialize(base: string): boolean {
    if (this.initialized || !this.context.isAddApp || !this.context.getIsWritable()) return false;
    const room = this.context.getRoom();
    const count = this.slide().slideCount;
    if (!room || !Number.isInteger(count) || count < 1) return false;
    this.initialized = true;
    // WindowManager creates a placeholder page for a fresh App. Replace it once,
    // before any numbered PPT page exists, so native scene indexes match PPT pages.
    // Existing numbered pages/strokes are preserved; navigation never rebuilds them.
    const missing = Array.from({ length: count }, (_, i) => ({ name: String(i + 1) })).filter(
      scene => room.scenePathType(`${base}/${scene.name}`) !== "page"
    );
    if (!missing.length) return false;
    if (missing.length === count) room.removeScenes(base);
    room.putScenes(base, missing);
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
        const plugin = this.context.getWindowManager()._appliancePlugin as
          | LocalScenePlugin
          | undefined;
        if (initialized) await this.context.setScenePath(path);
        if (this.destroyed) return;
        if (target !== this.pending) continue;
        if (plugin) {
          if (typeof plugin.setViewLocalScenePathChange !== "function") {
            throw new Error("[Slide] appliance-plugin lacks local scene switching support");
          }
          // A missing App View makes the plugin API silently do nothing. Retry until
          // mount completes, coalescing newer renderEnd notifications in the meantime.
          if (!plugin.currentManager?.viewContainerManager.getView(this.context.appId)) {
            if (Date.now() >= target.expires) {
              throw new Error("[Slide] appliance-plugin App View was not ready within 20s");
            }
            this.retry = setTimeout(() => {
              this.retry = undefined;
              void this.flush();
            }, 100);
            return;
          }
          await plugin.setViewLocalScenePathChange(path, this.context.appId);
        } else if (!initialized && isOwnWritableEvent(this.context, target.origin)) {
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
      if (this.pending && this.retry === undefined && !this.destroyed) void this.flush();
    }
  }
}
