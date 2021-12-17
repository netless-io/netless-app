import { size, has } from "lodash-es";
import { SideEffectManager } from "side-effect-manager";
import { ActionManager } from "./action-manager";
import { MonitorsAdapter } from "./monitors";
import { TargetsAdapter } from "./targets";

export class VMAdapter {
  constructor(app, reduxStore, isAuthor$) {
    this.app = app;
    this.reduxStore = reduxStore;
    this.vm = reduxStore.getState().scratchGui.vm;
    this.storage = this.vm.runtime.storage;
    this.isAuthor$ = isAuthor$;
    if (!this.storage) {
      console.error("No storage module present");
      return Promise.resolve(null);
    }

    this.sideEffect = new SideEffectManager();

    this.vmAppStore = app.connectStore("VMAdapter", {});

    this.targetActionManager = new ActionManager(this.vm);
    this.targetsAdapter = new TargetsAdapter(this.vm, this.targetActionManager);

    this.monitorActionManager = new ActionManager(this.vm);
    this.monitorsAdapter = new MonitorsAdapter(this.vm, this.monitorActionManager);

    if (this.vmAppStore.state.targets) {
      this.applyTargets(this.vmAppStore.state.targets);
    } else if (this.isAuthor$.value) {
      const targetList = this.vm.runtime.targets
        .filter(target => !has(target, "isOriginal") || target.isOriginal)
        .map(target => target.toJSON());
      this.uploadTargets({ targetList, editingTarget: this.vm.editingTarget });
    }

    if (this.vmAppStore.state.monitors) {
      this.applyMonitors();
    } else if (this.isAuthor$.value) {
      this.uploadMonitors();
    }

    this.sideEffect.add(() => {
      const handler = data => {
        if (this.isAuthor$.value) {
          if (data) {
            this.uploadTargets(data);
          }
        }
      };
      this.vm.addListener("targetsUpdate", handler);
      return () => this.vm.removeListener("targetsUpdate", handler);
    });

    this.sideEffect.add(() => {
      const handler = () => {
        if (this.isAuthor$.value) {
          this.uploadMonitors();
        }
      };
      this.vm.addListener("MONITORS_UPDATE", handler);
      return () => this.vm.removeListener("MONITORS_UPDATE", handler);
    });

    this.sideEffect.add(() => {
      const handler = diff => {
        if (!this.isAuthor$.value) {
          if (diff.targets) {
            this.applyTargets(this.vmAppStore.state.targets);
          }
          if (diff.monitors) {
            this.applyMonitors();
          }
        }
      };
      this.vmAppStore.onStateChanged.addListener(handler);
      return () => this.vmAppStore.onStateChanged.removeListener(handler);
    });
  }

  uploadTargets({ targetList, editingTarget }) {
    const payload = {};
    if (editingTarget) {
      payload.editingTarget = editingTarget;
    }
    if (targetList) {
      const result = this.targetsAdapter.deflateTargetList(targetList);
      Object.assign(payload, result);
    }
    if (size(payload) > 0) {
      this.vmAppStore.setState({ targets: payload });
    }
  }

  uploadMonitors() {
    const monitors = this.monitorsAdapter.deflateMonitors(this.vmAppStore.state.monitors);
    if (monitors) {
      this.vmAppStore.setState({ monitors });
    }
  }

  applyMonitors() {
    this.monitorActionManager.reset();
    this.monitorsAdapter.inflateMonitors(this.vmAppStore.state.monitors);
    this.monitorActionManager.flushActions();
  }

  async applyTargets(targetsState) {
    if (this.isApplyingTargets) {
      this.nextApplyTargets = targetsState;
      return;
    }

    this.isApplyingTargets = true;
    this.targetActionManager.reset();

    try {
      await this.targetsAdapter.inflateTargetList(targetsState);
    } catch (e) {
      console.error(e);
    }

    this.isApplyingTargets = false;

    try {
      this.targetActionManager.flushActions();
    } catch (e) {
      console.error(e);
    }

    if (this.nextApplyTargets) {
      const nextTargets = this.nextApplyTargets;
      this.nextApplyTargets = null;
      return this.applyTargets(nextTargets);
    }
  }

  destroy() {
    this.actionManager.destroy();
    this.sideEffect.flushAll();
  }
}
