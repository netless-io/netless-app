import { mapValues, clone, size, has, get, each, isEqual } from "lodash-es";
import Variable from "scratch-vm/src/engine/variable";
import Comment from "scratch-vm/src/engine/comment";
import Blocks from "scratch-vm/src/engine/blocks";
import StageLayering from "scratch-vm/src/engine/stage-layering";
import MonitorRecord from "scratch-vm/src/engine/monitor-record";
import Sprite from "scratch-vm/src/sprites/sprite";
import MathUtil from "scratch-vm/src/util/math-util";
import StringUtil from "scratch-vm/src/util/string-util";
import { loadCostumeFromAsset } from "scratch-vm/src/import/load-costume";
import { loadSoundFromAsset } from "scratch-vm/src/import/load-sound";
import { SideEffectManager } from "side-effect-manager";

const VM_TARGETS = "VM_TARGETS";
const VM_EDITING_TARGETS = "VM_EDITING_TARGETS";
const VM_MONITORS = "VM_MONITORS";

export class TargetsBinder {
  constructor(app, reduxStore, isAuthor) {
    this.sideEffect = new SideEffectManager();

    this.app = app;
    this.reduxStore = reduxStore;
    this.vm = reduxStore.getState().scratchGui.vm;
    this.storage = this.vm.runtime.storage;
    this.isAuthor = isAuthor;
    if (!this.storage) {
      console.error("No storage module present");
      return Promise.resolve(null);
    }

    const uploadTargetList = (targetList, editingTarget) => {
      if (targetList) {
        try {
          const payload = {
            [VM_EDITING_TARGETS]: editingTarget,
            [VM_TARGETS]: this.deflateTargetList(targetList),
          };
          const monitors = this.deflateMonitors();
          if (!isEqual(monitors, app.state[VM_MONITORS])) {
            payload[VM_MONITORS] = monitors;
          }
          app.setState(payload);
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

          this.inflateMonitors(targetList);

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
      const handler = () => {
        if (this.isAuthor()) {
          try {
            const monitors = this.deflateMonitors();
            if (!isEqual(monitors, app.state[VM_MONITORS])) {
              app.setState({
                [VM_MONITORS]: monitors,
              });
            }
          } catch (e) {
            console.error(e);
          }
        }
      };
      this.vm.on("MONITORS_UPDATE", handler);
      return () => this.vm.off("MONITORS_UPDATE", handler);
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

    this.sideEffect.add(() => {
      const handler = diff => {
        console.log("changed", diff);
        if (!this.isAuthor()) {
          if (diff[VM_MONITORS]) {
            this.inflateMonitors(this.vm.runtime.targets);
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

    return jsonTargetList;
  }

  inflateTargetList(jsonTargetList) {
    // console.log("inflateTargetList", jsonTargetList);

    return jsonTargetList.filter(Boolean).map(this.inflateTarget, this);
  }

  deflateTarget(targetJSON) {
    const { comments, variables, lists, broadcasts, costume, costumes, sounds, ...result } =
      targetJSON;

    result.comments = deflateObjectOfObjects(comments);
    result.variables = deflateObjectOfObjects(variables);
    result.lists = deflateObjectOfObjects(lists);
    result.broadcasts = deflateObjectOfObjects(broadcasts);
    result.sounds = deflateMedia(sounds);
    result.costumes = deflateMedia(costumes);

    if (costume) {
      result.currentCostume = Math.max(
        0,
        result.costumes.findIndex(c => c.assetId === costume.assetId)
      );
    } else {
      result.currentCostume = 0;
    }

    return result;
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
      sprite.costumes = json.costumes.map(this.loadCostume, this).filter(Boolean);
    }
    if (json.sounds && json.sounds.length > 0) {
      sprite.sounds = json.sounds
        .map(sound => this.loadSound(sound, sprite.soundBank))
        .filter(Boolean);
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
      each(json.lists, (variable, varId) => {
        const newVariable = new Variable(varId, variable.name, Variable.LIST_TYPE, false);
        newVariable.value = variable.value;
        target.variables[varId] = newVariable;
      });
    }
    if (json.broadcasts && size(json.broadcasts) > 0) {
      each(json.broadcasts, (variable, varId) => {
        const newVariable = new Variable(
          varId,
          variable.name,
          Variable.BROADCAST_MESSAGE_TYPE,
          false
        );
        target.variables[varId] = newVariable;
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
    return this.vm.runtime
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
        return serializedMonitor;
      })
      .toArray();
  }

  inflateMonitors(targetList) {
    if (this.app.state[VM_MONITORS] && this.app.state[VM_MONITORS].length > 0) {
      this.app.state[VM_MONITORS].forEach(monitorData => {
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
      });
    }
  }

  loadSound(sound, soundBank) {
    if (sound.assetId) {
      const asset = this.storage.get(sound.assetId);
      if (asset) {
        sound.asset = asset;
        loadSoundFromAsset(sound, asset, this.vm.runtime, soundBank);
      } else {
        console.error("Missing asset for " + sound.assetId);
        return null;
      }
    }
    return sound;
  }

  loadCostume(costume) {
    if (costume.assetId) {
      const asset = this.storage.get(costume.assetId);
      if (asset) {
        costume.asset = asset;
        loadCostumeFromAsset(costume, this.vm.runtime);
      } else {
        console.error("Missing asset for " + costume.assetId);
        return null;
      }
    }
    return costume;
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

function deflateMedia(mediaList) {
  return Array.isArray(mediaList) ? mediaList.map(omitAsset) : [];
}

function deflateObjectOfObjects(objects = {}) {
  return Object.keys(objects).reduce((result, id) => {
    const obj = deflateObject(objects[id]);
    if (obj) {
      result[id] = obj;
    }
    return result;
  }, {});
}

function deflateObject(obj) {
  return obj && mapValues(obj, clone);
}

function omitAsset(media) {
  const { asset, ...rest } = media;
  return rest;
}
