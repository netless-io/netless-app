import { mapValues, clone, size, has, get, each } from "lodash-es";
import Variable from "scratch-vm/src/engine/variable";
import Comment from "scratch-vm/src/engine/comment";
import Blocks from "scratch-vm/src/engine/blocks";
import StageLayering from "scratch-vm/src/engine/stage-layering";
import MonitorRecord from "scratch-vm/src/engine/monitor-record";
import Sprite from "scratch-vm/src/sprites/sprite";
import MathUtil from "scratch-vm/src/util/math-util";
import StringUtil from "scratch-vm/src/util/string-util";
import { SideEffectManager } from "side-effect-manager";
import pako from "pako";
import { fromUint8Array, toUint8Array } from "js-base64";

const VM_TARGETS = "VM_TARGETS";
const VM_EDITING_TARGETS = "VM_EDITING_TARGETS";
const VM_MONITORS = "VM_MONITORS";

export class TargetsBinder {
  constructor(app, store, isAuthor) {
    this.app = app;
    this.store = store;
    this.vm = store.getState().scratchGui.vm;
    this.storage = this.vm.runtime.storage;
    this.isAuthor = isAuthor;
    if (!this.storage) {
      console.error("No storage module present");
      return Promise.resolve(null);
    }

    this.sideEffect = new SideEffectManager();

    const uploadTargetList = (targetList, editingTarget) => {
      if (targetList) {
        try {
          let monitors = this.deflateMonitors();
          if (
            monitors.length <= 0 &&
            app.state[VM_MONITORS] &&
            app.state[VM_MONITORS].length <= 0
          ) {
            monitors = app.state[VM_MONITORS];
          }
          app.setState({
            [VM_EDITING_TARGETS]: editingTarget,
            [VM_TARGETS]: this.deflateTargetList(targetList),
            [VM_MONITORS]: monitors,
          });
        } catch (e) {
          console.log(e);
        }
      }
    };

    const applyTargetList = () => {
      if (app.state[VM_TARGETS]) {
        try {
          const targetList = this.inflateTargetList(app.state[VM_TARGETS]);
          // console.log("incoming targetList", targetList);

          this.vm.clear();

          targetList.forEach(target => {
            this.vm.runtime.targets.length = 0;
            this.vm.runtime.executableTargets.length = 0;

            this.vm.runtime.addTarget(target);
            target.updateAllDrawableProperties();
            // Ensure unique sprite name
            if (target.isSprite()) {
              this.vm.renameSprite(target.id, target.getName());
            }
          });

          if (targetList.every(target => has(target, "layerOrder"))) {
            // Sort the executable targets by layerOrder.
            // Remove layerOrder property after use.
            this.vm.runtime.executableTargets.sort((a, b) => a.layerOrder - b.layerOrder);
            targetList.forEach(target => {
              delete target.layerOrder;
            });
          }

          if (app.state[VM_MONITORS] && app.state[VM_MONITORS].length > 0) {
            app.state[VM_MONITORS].forEach(monitorData => {
              if (monitorData.spriteName) {
                const filteredTargets = targetList.filter(
                  t => t.sprite.name === monitorData.spriteName
                );
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

              this.runtime.requestAddMonitor(MonitorRecord(monitorData));
            });
          }

          let editingTarget = targetList[0];
          if (app.state[VM_EDITING_TARGETS]) {
            const target = targetList.find(target => target.id === app.state[VM_EDITING_TARGETS]);
            // console.log("findEditingTarget", target, targetList);
            if (target) {
              editingTarget = target;
            }
          }
          this.vm.editingTarget = editingTarget;
          this.vm.editingTarget.fixUpVariableReferences();

          this.vm.emitTargetsUpdate(false /* Don't emit project change */);
          if (this.vm.runtime.targets.some(target => target.isStage)) {
            this.vm.emitWorkspaceUpdate();
          }
          this.vm.runtime.setEditingTarget(this.vm.editingTarget);
          this.vm.runtime.ioDevices.cloud.setStage(this.vm.runtime.getTargetForStage());
        } catch (e) {
          console.error(e);
        }
      }
    };

    if (this.isAuthor()) {
      if (!app.state[VM_TARGETS] && this.vm.runtime.targets) {
        uploadTargetList(
          this.vm.runtime.targets
            .filter(target => !has(target, "isOriginal") || target.isOriginal)
            .map(target => target.toJSON()),
          (this.vm.editingTarget && this.vm.editingTarget.id) ||
            (this.vm.runtime.targets[0] && this.vm.runtime.targets[0].id)
        );
      }
    } else {
      applyTargetList();
    }

    this.sideEffect.add(() => {
      const handler = data => {
        if (this.isAuthor()) {
          if (data) {
            uploadTargetList(data.targetList, data.editingTarget);
          }
        }
      };
      this.vm.addListener("targetsUpdate", handler);
      return () => this.vm.removeListener("targetsUpdate", handler);
    });

    this.sideEffect.add(() => {
      const handler = diff => {
        if (!this.isAuthor()) {
          if (diff[VM_TARGETS]) {
            applyTargetList();
          }
        }
      };
      app.onStateChanged.addListener(handler);
      return () => app.onStateChanged.removeListener(handler);
    });
  }

  destroy() {
    this.sideEffect.flushAll();
  }

  deflateTargetList(targetList) {
    const jsonTargetList = targetList.map(this.deflateTarget, this);

    if (this.vm.runtime.renderer) {
      // If the renderer is attached,
      // add a temporary layerOrder property to each target.
      const layerOrdering = this.getSimplifiedLayerOrdering(this.vm.runtime.targets);
      jsonTargetList.forEach((target, index) => {
        target.layerOrder = layerOrdering[index];
      });
    }

    console.log("deflateTargetList", jsonTargetList);

    return fromUint8Array(pako.deflate(JSON.stringify(jsonTargetList)));
  }

  deflateTarget(target) {
    const { costume, ...result } = target;
    if (target.comments && size(target.comments) > 0) {
      result.comments = mapValues(target.comments, clone);
    }
    if (target.variables && size(target.variables) > 0) {
      result.variables = mapValues(target.variables, clone);
    }
    if (target.lists && size(target.lists) > 0) {
      result.lists = mapValues(target.lists, clone);
    }
    if (target.broadcasts && size(target.broadcasts) > 0) {
      result.broadcasts = mapValues(target.broadcasts, clone);
    }
    if (target.costumes && target.costumes.length > 0) {
      result.costumes = target.costumes.map(this.omitAsset, this);
    }
    if (costume) {
      result.currentCostume = 0;
      if (target.costumes) {
        result.currentCostume = Math.max(
          0,
          target.costumes.findIndex(costume => costume.assetId === costume.assetId)
        );
      }
    }
    if (target.sounds && target.sounds.length > 0) {
      result.sounds = target.sounds.map(this.omitAsset, this);
    }
    return result;
  }

  inflateTargetList(bin) {
    const jsonTargetList = JSON.parse(pako.inflate(toUint8Array(bin), { to: "string" }));

    // console.log("inflateTargetList", jsonTargetList);

    return jsonTargetList.filter(Boolean).map(this.inflateTarget, this);
  }

  inflateTarget(json) {
    const blocks = new Blocks(this.vm.runtime);
    const sprite = new Sprite(blocks, this.vm.runtime);

    if (json.name) {
      sprite.name = json.name;
    }

    if (json.blocks && size(json.blocks) > 0) {
      each(json.blocks, block => {
        blocks.createBlock(block);
      });
    }

    const target = sprite.createClone(
      json.isStage ? StageLayering.BACKGROUND_LAYER : StageLayering.SPRITE_LAYER
    );

    this.ensureTarget(target, json, [
      "id",
      "currentCostume",
      "tempo",
      "volume",
      "videoTransparency",
      "videoState",
      "textToSpeechLanguage",
      "x",
      "y",
      "direction",
      "size",
      "visible",
      "currentCostume",
      "rotationStyle",
      "isStage",
      "targetPaneOrder",
      "draggable",
    ]);

    if (json.costumes && json.costumes.length > 0) {
      sprite.costumes = json.costumes.map(this.pickAsset, this).filter(Boolean);
    }
    if (json.sounds && json.sounds.length > 0) {
      sprite.sounds = json.sounds.map(this.pickAsset, this).filter(Boolean);
    }
    if (json.variables && size(json.variables) > 0) {
      target.variables = mapValues(json.variables, (variable, varId) => {
        const isCloud =
          get(variable, "isCloud", false) && json.isStage && this.vm.runtime.canAddCloudVariable();
        const newVariable = new Variable(
          varId,
          variable.name, // name of the variable
          Variable.SCALAR_TYPE, // type of the variable
          isCloud
        );
        if (isCloud) {
          this.vm.runtime.addCloudVariable();
        }
        newVariable.value = variable.value;
        return newVariable;
      });
    }
    if (json.lists && size(json.lists) > 0) {
      target.lists = mapValues(json.lists, (variable, varId) => {
        const newVariable = new Variable(varId, variable.name, Variable.LIST_TYPE, false);
        newVariable.value = variable.value;
        return newVariable;
      });
    }
    if (json.broadcasts && size(json.broadcasts) > 0) {
      target.broadcasts = mapValues(json.broadcasts, (variable, varId) => {
        const newVariable = new Variable(
          varId,
          variable.name,
          Variable.BROADCAST_MESSAGE_TYPE,
          false
        );
        return newVariable;
      });
    }
    if (json.comments && size(json.comments) > 0) {
      target.comments = mapValues(json.comments, (comment, commentId) => {
        const newComment = new Comment(
          commentId,
          comment.text,
          comment.x,
          comment.y,
          comment.width,
          comment.height,
          comment.minimized
        );
        if (comment.blockId) {
          newComment.blockId = comment.blockId;
        }
        return newComment;
      });
    }
    return target;
  }

  deflateMonitors() {
    const monitors = [];
    this.vm.runtime
      .getMonitorState()
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
        monitors.push(serializedMonitor);
      });

    return monitors;
  }

  pickAsset(media) {
    if (media.assetId) {
      const asset = this.storage.get(media.assetId);
      if (asset) {
        media.asset = asset;
      } else {
        console.error("Missing asset for " + media.assetId);
        return null;
      }
    }
    return media;
  }

  omitAsset(media) {
    const { asset, ...rest } = media;
    return rest;
  }

  getSimplifiedLayerOrdering(targets) {
    const layerOrders = targets.map(t => t.getLayerOrder());
    return MathUtil.reducedSortOrdering(layerOrders);
  }

  ensureTarget(target, json, keys) {
    keys.forEach(key => {
      if (has(json, key)) {
        target[key] = json[key];
      }
    });
  }
}
