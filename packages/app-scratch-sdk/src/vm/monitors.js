import { isEqual, mapValues, has, every } from "lodash-es";
import Variable from "scratch-vm/src/engine/variable";
import StringUtil from "scratch-vm/src/util/string-util";
import MonitorRecord from "scratch-vm/src/engine/monitor-record";

export class MonitorsAdapter {
  /**
   * @param {*} vm
   * @param {import('./action-manager').ActionManager} actionManager
   */
  constructor(vm, actionManager) {
    this.vm = vm;
    this.actionManager = actionManager;
  }

  /**
   * @param {*} monitorsState to compare with
   */
  deflateMonitors(monitorsState = []) {
    const monitorMap = this.vm.runtime.getMonitorState();

    if (
      monitorsState.length === monitorMap.size &&
      monitorsState.every(
        monitorState =>
          monitorsState && isSameMonitor(monitorMap.get(monitorsState.id), monitorState)
      )
    ) {
      return;
    }

    return monitorMap
      .valueSeq()
      .map(monitorData => {
        const serializedMonitor = {
          id: monitorData.id,
          mode: monitorData.mode,
          opcode: monitorData.opcode,
          params: monitorData.params,
          spriteName: monitorData.spriteName,
          value: monitorData.value,
          width: monitorData.width,
          height: monitorData.height,
          x: monitorData.x,
          y: monitorData.y,
          visible: monitorData.visible,
        };
        if (monitorData.mode !== "list") {
          serializedMonitor.sliderMin = monitorData.sliderMin;
          serializedMonitor.sliderMax = monitorData.sliderMax;
          serializedMonitor.isDiscrete = monitorData.isDiscrete;
        }
        return serializedMonitor;
      })
      .toArray();
  }

  inflateMonitors(monitorsState) {
    let changed = false;
    const monitorMap = this.vm.runtime.getMonitorState();

    monitorMap.forEach(record => {
      if (monitorsState.every(monitorState => monitorState.id !== record.id)) {
        monitorMap.delete(record.id);
        changed = true;
      }
    });

    monitorsState.forEach(monitorState => {
      if (!monitorState || monitorState.id) {
        return;
      }
      const record = monitorMap.get(monitorState.id);
      if (record && isSameMonitor(record, monitorState)) {
        return;
      }
      // @TODO update existing monitor instead of adding new one
      this._addMonitor(monitorState);
      changed = true;
    });

    if (changed) {
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  _addMonitor(monitorData) {
    const targetList = this.vm.runtime.targets;
    if (monitorData.spriteName) {
      const filteredTargets = targetList.filter(t => t.sprite.name === monitorData.spriteName);
      if (filteredTargets && filteredTargets.length > 0) {
        monitorData.targetId = filteredTargets[0].id;
      } else {
        console.warn(
          `Tried to deserialize sprite specific monitor ${monitorData.opcode} but could not find sprite ${monitorData.spriteName}.`
        );
      }
    }

    const monitorBlockInfo = this.vm.runtime.monitorBlockInfo[monitorData.opcode];

    if (monitorData.opcode === "data_listcontents") {
      const listTarget = monitorData.targetId
        ? targetList.find(t => t.id === monitorData.targetId)
        : targetList.find(t => t.isStage);
      if (listTarget && has(listTarget.variables, monitorData.id)) {
        monitorData.params.LIST = listTarget.variables[monitorData.id].name;
      }
    }

    const fields = mapValues(monitorData.params, (value, name) => ({ name, value }));

    if (
      monitorData.opcode !== "data_variable" &&
      monitorData.opcode !== "data_listcontents" &&
      monitorBlockInfo &&
      monitorBlockInfo.isSpriteSpecific
    ) {
      monitorData.id = monitorBlockInfo.getId(monitorData.targetId, fields);
    } else {
      monitorData.id = StringUtil.replaceUnsafeChars(monitorData.id);
    }

    const existingMonitorBlock = this.vm.runtime.monitorBlocks._blocks[monitorData.id];
    if (existingMonitorBlock) {
      existingMonitorBlock.isMonitored = monitorData.visible;
      existingMonitorBlock.targetId = monitorData.targetId;
    } else {
      const monitorBlock = {
        id: monitorData.id,
        opcode: monitorData.opcode,
        inputs: {},
        fields: fields,
        topLevel: true,
        next: null,
        parent: null,
        shadow: false,
        x: 0,
        y: 0,
        isMonitored: monitorData.visible,
        targetId: monitorData.targetId,
      };

      if (monitorData.opcode === "data_variable") {
        const field = monitorBlock.fields.VARIABLE;
        field.id = monitorData.id;
        field.variableType = Variable.SCALAR_TYPE;
      } else if (monitorData.opcode === "data_listcontents") {
        const field = monitorBlock.fields.LIST;
        field.id = monitorData.id;
        field.variableType = Variable.LIST_TYPE;
      }

      this.vm.runtime.monitorBlocks.createBlock(monitorBlock);
    }

    this.vm.runtime.requestAddMonitor(MonitorRecord(monitorData));
  }
}

function isSameMonitor(monitorObj, monitorState) {
  return Boolean(
    monitorObj &&
      monitorState &&
      every(monitorState, (value, key) => isEqual(value, monitorObj[key]))
  );
}
