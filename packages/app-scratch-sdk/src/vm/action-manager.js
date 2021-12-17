export class ActionManager {
  constructor(vm) {
    this.vm = vm;
    this.actions = [];
    this.postActions = [];
    this.resetGlobalActions();
  }

  /**
   * @param {() => void} action
   */
  addAction(action) {
    this.actions.push(action);
  }

  /**
   * @param {() => void} action
   */
  prependAction(action) {
    this.actions.unshift(action);
  }

  /**
   * @param {() => void} action
   */
  addPostAction(action) {
    this.postActions.push(action);
  }

  reset() {
    this.resetGlobalActions();
    this.actions.length = 0;
    this.postActions.length = 0;
  }

  destroy() {
    this.reset();
  }

  flushActions() {
    this.actions.forEach(this.invokeAction, this);

    if (this.VMEmitSilentTargetsUpdate) {
      this.vm.emitTargetsUpdate(false /* Don't emit project change */);
    } else {
      if (this.VMEmitTargetsUpdate) {
        this.vm.emitTargetsUpdate();
      }
      if (this.RuntimeEmitProjectChanged) {
        this.vm.runtime.emitProjectChanged();
      }
    }
    if (this.VMEmitWorkspaceUpdate) {
      this.vm.emitWorkspaceUpdate();
    }

    this.postActions.forEach(this.invokeAction, this);

    this.reset();
  }

  resetGlobalActions() {
    this.RuntimeEmitProjectChanged = false;
    this.VMEmitTargetsUpdate = false;
    this.VMEmitSilentTargetsUpdate = false;
    this.VMEmitWorkspaceUpdate = false;
  }

  markRuntimeEmitProjectChanged(dirty = true) {
    this.RuntimeEmitProjectChanged = dirty;
  }

  markVMEmitTargetsUpdate(dirty = true) {
    this.VMEmitTargetsUpdate = dirty;
  }

  markVMEmitSilentTargetsUpdate(dirty = true) {
    this.VMEmitSilentTargetsUpdate = dirty;
  }

  markVMEmitWorkspaceUpdate(dirty = true) {
    this.VMEmitWorkspaceUpdate = dirty;
  }

  invokeAction(action) {
    try {
      return action();
    } catch (e) {
      console.error(e);
    }
  }
}
