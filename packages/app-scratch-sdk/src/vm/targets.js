import { mapValues, clone, size, has, get, each, isEqual } from "lodash-es";
import Variable from "scratch-vm/src/engine/variable";
import Comment from "scratch-vm/src/engine/comment";
import Blocks from "scratch-vm/src/engine/blocks";
import StageLayering from "scratch-vm/src/engine/stage-layering";
import RenderedTarget from "scratch-vm/src/sprites/rendered-target";
import Sprite from "scratch-vm/src/sprites/sprite";
import MathUtil from "scratch-vm/src/util/math-util";
import { loadCostume } from "scratch-vm/src/import/load-costume";
import { loadSound } from "scratch-vm/src/import/load-sound";

const CORE_EXTENSIONS = [
  "argument",
  "colour",
  "control",
  "data",
  "event",
  "looks",
  "math",
  "motion",
  "operator",
  "procedures",
  "sensing",
  "sound",
];

const VAR_TYPES = ["variables", "lists", "broadcasts"];

export class TargetsAdapter {
  /**
   * @param {*} vm
   * @param {import('./action-manager').ActionManager} actionManager
   */
  constructor(vm, actionManager) {
    this.vm = vm;
    this.actionManager = actionManager;
  }

  deflateTargetList(targetListJSON) {
    const targetListState = targetListJSON.map(this.deflateTarget, this);
    let layerOrdering;
    if (this.vm.runtime.renderer) {
      // If the renderer is attached,
      // add a temporary layerOrder property to each target.
      layerOrdering = getSimplifiedLayerOrdering(this.vm.runtime.targets);
    }
    return { targetListState, layerOrdering };
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

    return result;
  }

  async inflateTargetList({ targetListState, layerOrdering, editingTarget }) {
    const allTargets = new Map(this.vm.runtime.targets.map(target => [target.id, target]));

    const fullUpdate = targetListState.some((targetState, i) => {
      const target = this.vm.runtime.targets[i];
      return !target || target.id !== targetState.id;
    });
    if (fullUpdate) {
      this.actionManager.markVMEmitSilentTargetsUpdate();
    }
    this.vm.stopAll();

    const newTargetList = [];

    await Promise.all(
      targetListState.map(async (targetState, i) => {
        if (!targetState) {
          return;
        }

        const newTarget = await this.inflateTarget(
          targetState,
          this.vm.runtime.targets[i],
          allTargets
        );

        newTargetList.push(newTarget);
      })
    );

    this.vm.runtime.targets.forEach(target => {
      if (!newTargetList.includes(target)) {
        target.dispose();
      }
    });

    let targetChanged = this.vm.runtime.targets.length !== targetListState.length;

    this.vm.runtime.targets.length = targetListState.length;
    this.vm.runtime.executableTargets.length = targetListState.length;

    newTargetList.forEach((newTarget, i) => {
      const oldTarget = this.vm.runtime.targets[i];

      this.vm.runtime.targets[i] = newTarget;
      this.vm.runtime.executableTargets[i] = newTarget;

      if (newTarget !== oldTarget) {
        targetChanged = true;

        if (newTarget.isStage) {
          this.vm.runtime.ioDevices.cloud.setStage(newTarget);
        }

        newTarget.updateAllDrawableProperties();
      }
    });

    if (layerOrdering) {
      this.vm.runtime.executableTargets.sort((target1, target2) => {
        const layerOrder1 = layerOrdering[target1.id] || 0;
        const layerOrder2 = layerOrdering[target2.id] || 0;
        return layerOrder1 - layerOrder2;
      });
    }

    if (targetChanged) {
      const edtTarget =
        this.vm.runtime.targets.find(target => target.id === editingTarget) ||
        this.vm.runtime.targets[0] ||
        null;
      this.vm.editingTarget = edtTarget;
      this.actionManager.markVMEmitSilentTargetsUpdate();
      this.actionManager.markVMEmitWorkspaceUpdate();
      this.vm.runtime.setEditingTarget(edtTarget);

      await Promise.all(
        this.extractExtensions(targetListState).map(async extensionID => {
          if (!this.extensionManager.isExtensionLoaded(extensionID)) {
            return this.vm.extensionManager.loadExtensionURL(extensionID);
          }
        })
      );
    }
  }

  async inflateTarget(targetState, target, allTargets) {
    if (!target || target.id !== targetState.id) {
      if (targetState.isStage) {
        this.actionManager.markVMEmitWorkspaceUpdate();
      }
      target = allTargets.get(targetState.id);
    }

    if (!target) {
      return this.createTarget(targetState);
    }

    await this.diffTarget(target, targetState, allTargets);
    return target;
  }

  async createTarget(targetState) {
    const blocks = new Blocks(this.vm.runtime);
    const sprite = new Sprite(blocks, this.vm.runtime);

    if (targetState.name) {
      sprite.name = targetState.name;
    }

    if (targetState.blocks && size(targetState.blocks) > 0) {
      each(targetState.blocks, (blockState, blockId) => {
        blocks._blocks[blockId] = { ...blockState };
        if (blockState.topLevel) {
          blocks._scripts.push(blockId);
        }
      });
    }

    const target = sprite.createClone(
      targetState.isStage ? StageLayering.BACKGROUND_LAYER : StageLayering.SPRITE_LAYER
    );

    ensureTarget(target, targetState, [
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

    if (size(targetState.variables) > 0) {
      target.variables = mapValues(targetState.variables, (variable, varId) => {
        const isCloud =
          get(variable, "isCloud", false) &&
          targetState.isStage &&
          this.vm.runtime.canAddCloudVariable();
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

    if (size(targetState.lists) > 0) {
      each(targetState.lists, (variable, varId) => {
        const newVariable = new Variable(varId, variable.name, Variable.LIST_TYPE, false);
        newVariable.value = variable.value;
        target.variables[varId] = newVariable;
      });
    }

    if (size(targetState.broadcasts) > 0) {
      each(targetState.broadcasts, (variable, varId) => {
        const newVariable = new Variable(
          varId,
          variable.name,
          Variable.BROADCAST_MESSAGE_TYPE,
          false
        );
        target.variables[varId] = newVariable;
      });
    }

    if (size(targetState.comments) > 0) {
      target.comments = mapValues(targetState.comments, (comment, commentId) => {
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

    if (size(targetState.costumes) > 0) {
      sprite.costumes = await Promise.all(
        targetState.costumes.map(costumeState =>
          loadCostume(
            costumeState.md5,
            {
              bitmapResolution: 1,
              rotationCenterX: 0,
              rotationCenterY: 0,
              ...costumeState,
            },
            target.runtime
          )
        )
      );
    }

    if (size(targetState.sounds) > 0) {
      sprite.sounds = await Promise.all(
        targetState.sounds.map(soundState =>
          loadSound({ ...soundState }, target.runtime, target.sprite.soundBank)
        )
      );
    }

    return target;
  }

  async diffTarget(target, targetState, allTargets) {
    this.diffBlocks(target, targetState);

    if (target.sprite.name !== targetState.name) {
      const oldName = target.sprite.name;
      target.sprite.name = targetState.name;
      allTargets.forEach(target => {
        target.blocks.updateAssetName(oldName, targetState.name, "sprite");
      });
      this.actionManager.markRuntimeEmitProjectChanged();
    }

    if (target.isStage !== targetState.isStage) {
      target.isStage = targetState.isStage;
      this.actionManager.markVMEmitSilentTargetsUpdate();
      this.actionManager.markVMEmitWorkspaceUpdate();
    }

    if (target.x !== targetState.x || target.y !== targetState.y) {
      this.setXY(target, targetState.x, targetState.y);
    }

    if (target.size !== targetState.size) {
      this.setSize(target, targetState.size);
    }

    if (target.direction !== targetState.direction) {
      this.setDirection(target, targetState.direction);
    }

    if (target.draggable !== targetState.draggable) {
      this.setDraggable(target, targetState.draggable);
    }

    if (target.visible !== targetState.visible) {
      this.setVisible(target, targetState.visible);
    }

    if (target.rotationStyle !== targetState.rotationStyle) {
      this.setRotationStyle(target, targetState.rotationStyle);
    }

    if (target.tempo !== targetState.tempo) {
      target.tempo = targetState.tempo;
      target.runtime.requestTargetsUpdate(target);
    }

    if (target.volume !== targetState.volume) {
      target.volume = targetState.volume;
      target.runtime.requestTargetsUpdate(target);
    }

    if (target.videoTransparency !== targetState.videoTransparency) {
      target.videoTransparency = targetState.videoTransparency;
      target.runtime.requestTargetsUpdate(target);
    }

    if (target.videoState !== targetState.videoState) {
      target.videoState = targetState.videoState;
      target.runtime.requestTargetsUpdate(target);
    }

    this.diffComments(target, targetState);
    this.diffVariables(target, targetState);

    await Promise.all([
      this.diffCostumes(target, targetState),
      this.diffSounds(target, targetState),
    ]);
  }

  extractExtensions(targetListState) {
    const extensions = new Set();
    targetListState.forEach(targetState => {
      if (targetState && size(targetState.blocks) > 0) {
        each(targetState.blocks, block => {
          const extensionID = getExtensionIdForOpcode(block.opcode);
          if (extensionID && !this.vm.extensionManager.isExtensionLoaded(extensionID)) {
            extensions.add(extensionID);
          }
        });
      }
    });
    return [...extensions];
  }

  diffBlocks(target, targetState) {
    let changed = false;

    const blocksState = targetState.blocks || {};

    each(blocksState, (blockState, blockId) => {
      if (!isEqual(target.blocks._blocks[blockId], blockState)) {
        changed = true;
        target.blocks._blocks[blockId] = blockState;
      }
    });
    if (changed) {
      target.blocks._scripts.length = 0;
      each(target.blocks._blocks, (block, blockId) => {
        if (block.topLevel) {
          target.blocks._scripts.push(blockId);
        }
      });
      target.blocks.resetCache();
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  async diffCostumes(target, targetState) {
    let changed = false;
    const costumesState = targetState.costumes || [];
    const costumes = target.sprite.costumes;

    await Promise.all(
      costumesState.map(async (costumeState, i) => {
        const costume = costumes[i];
        if (!costume || costumeState.assetId !== costume.assetId) {
          costumes[i] = await loadCostume(
            costumeState.md5,
            {
              bitmapResolution: 1,
              rotationCenterX: 0,
              rotationCenterY: 0,
              ...costumeState,
            },
            target.runtime
          );
          changed = true;
        } else {
          if (costume.name !== costumeState.name) {
            target.renameCostume(i, costumeState.name);
            changed = true;
          }

          const bitmapResolution = costumeState.bitmapResolution || 1;
          if (costume.bitmapResolution !== bitmapResolution) {
            costume.bitmapResolution = bitmapResolution;
            changed = true;
          }

          const rotationCenterX = costumeState.rotationCenterX || 0;
          if (costume.rotationCenterX !== rotationCenterX) {
            costume.rotationCenterX = rotationCenterX;
            changed = true;
          }

          const rotationCenterY = costumeState.rotationCenterY || 0;
          if (costume.rotationCenterY !== rotationCenterY) {
            costume.rotationCenterY = rotationCenterY;
            changed = true;
          }
        }
      })
    );

    if (costumes.length > costumesState.length) {
      costumes.length = costumesState.length;
      changed = true;
    }

    if (target.currentCostume !== targetState.currentCostume) {
      this.setCurrentCostume(target, targetState.currentCostume);
      changed = true;
    }

    if (changed) {
      target.runtime.requestTargetsUpdate(target);
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  async diffSounds(target, targetState) {
    let changed = false;
    const soundsState = targetState.sounds || [];
    const sounds = target.sprite.sounds;

    await Promise.all(
      soundsState.map(async (soundState, i) => {
        const sound = sounds[i];
        if (
          !sound ||
          soundState.assetId !== sound.assetId ||
          soundState.soundId !== sound.soundId
        ) {
          sounds[i] = await loadSound({ ...soundState }, target.runtime, target.sprite.soundBank);
          changed = true;
        } else {
          if (sound.name !== soundState.name) {
            target.renameSound(i, soundState.name);
            changed = true;
          }
          if (sound.sampleCount !== soundState.sampleCount) {
            sound.sampleCount = soundState.sampleCount;
            changed = true;
          }
          if (sound.rate !== soundState.rate) {
            sound.rate = soundState.rate;
            changed = true;
          }
        }
      })
    );

    if (sounds.length > soundsState.length) {
      sounds.length = soundsState.length;
      changed = true;
    }

    if (changed) {
      target.runtime.requestTargetsUpdate(target);
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  setXY(target, x, y) {
    const oldX = target.x;
    const oldY = target.y;
    if (target.renderer) {
      const position = target.renderer.getFencedPositionOfDrawable(target.drawableID, [x, y]);
      target.x = position[0];
      target.y = position[1];

      target.renderer.updateDrawablePosition(target.drawableID, position);
      if (target.visible) {
        target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
        target.runtime.requestRedraw();
      }
    } else {
      target.x = x;
      target.y = y;
    }
    target.emit(RenderedTarget.EVENT_TARGET_MOVED, target, oldX, oldY, false);
    target.runtime.requestTargetsUpdate(this);
  }

  setSize(target, size) {
    if (target.renderer) {
      // Clamp to scales relative to costume and stage size.
      // See original ScratchSprite.as:setSize.
      const costumeSize = target.renderer.getCurrentSkinSize(target.drawableID);
      const origW = costumeSize[0];
      const origH = costumeSize[1];
      const minScale = Math.min(1, Math.max(5 / origW, 5 / origH));
      const maxScale = Math.min(
        (1.5 * target.runtime.constructor.STAGE_WIDTH) / origW,
        (1.5 * target.runtime.constructor.STAGE_HEIGHT) / origH
      );
      target.size = MathUtil.clamp(size / 100, minScale, maxScale) * 100;
      const { direction, scale } = target._getRenderedDirectionAndScale();
      target.renderer.updateDrawableDirectionScale(target.drawableID, direction, scale);
      if (target.visible) {
        target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
        target.runtime.requestRedraw();
      }
    }
    target.runtime.requestTargetsUpdate(this);
  }

  setDirection(target, direction) {
    if (!isFinite(direction)) {
      return;
    }
    // Keep direction between -179 and +180.
    target.direction = MathUtil.wrapClamp(direction, -179, 180);
    if (target.renderer) {
      const { direction: renderedDirection, scale } = target._getRenderedDirectionAndScale();
      target.renderer.updateDrawableDirectionScale(target.drawableID, renderedDirection, scale);
      if (target.visible) {
        target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
        target.runtime.requestRedraw();
      }
    }
    target.runtime.requestTargetsUpdate(target);
  }

  setVisible(target, visible) {
    target.visible = !!visible;
    if (target.renderer) {
      target.renderer.updateDrawableVisible(target.drawableID, target.visible);
      if (target.visible) {
        target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
        target.runtime.requestRedraw();
      }
    }
    target.runtime.requestTargetsUpdate(target);
  }

  setDraggable(target, draggable) {
    target.draggable = !!draggable;
    target.runtime.requestTargetsUpdate(target);
  }

  setRotationStyle(target, rotationStyle) {
    switch (rotationStyle) {
      case RenderedTarget.ROTATION_STYLE_NONE:
      case RenderedTarget.ROTATION_STYLE_ALL_AROUND:
      case RenderedTarget.ROTATION_STYLE_LEFT_RIGHT: {
        target.rotationStyle = rotationStyle;
        if (target.renderer) {
          const { direction, scale } = target._getRenderedDirectionAndScale();
          target.renderer.updateDrawableDirectionScale(target.drawableID, direction, scale);
          if (target.visible) {
            target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
            target.runtime.requestRedraw();
          }
        }
        target.runtime.requestTargetsUpdate(target);
        break;
      }
      default: {
        console.error(
          `[NetlessScratch]: Incorrect rotationStyle to target ${target.id}: ${rotationStyle}`
        );
        break;
      }
    }
  }

  diffComments(target, targetState) {
    let changed = false;
    if (targetState.comments) {
      if (!target.comments) {
        target.comments = {};
      }
      Object.keys(targetState.comments).forEach(k => {
        const commentState = targetState.comments[k];
        if (commentState) {
          if (!target.comments[k]) {
            target.comments[k] = new Comment(
              k,
              commentState.text,
              commentState.x,
              commentState.y,
              commentState.width,
              commentState.height,
              commentState.minimized
            );
            if (commentState.blockId) {
              target.comments[k].blockId = commentState.blockId;
            }
            changed = true;
          } else if (diffObject(target.comments[k], commentState)) {
            changed = true;
          }
        }
      });
    }
    if (size(target.comments) > 0) {
      Object.keys(target.comments).forEach(k => {
        if (!targetState.comments[k]) {
          delete target.comments[k];
          changed = true;
        }
      });
    }
    if (changed) {
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  diffVariables(target, targetState) {
    let changed = false;
    VAR_TYPES.forEach(type => {
      if (!targetState[type]) {
        return;
      }
      if (!target.variables) {
        target.variables = {};
      }
      Object.keys(targetState[type]).forEach(varId => {
        const targetVariable = target.variables[varId];
        const variableState = targetState[type][varId];
        if (variableState) {
          if (!targetVariable) {
            target.variables[varId] = this.createVariable(
              type,
              varId,
              variableState,
              target,
              targetState
            );
            changed = true;
          } else {
            Object.keys(variableState).forEach(key => {
              if (targetVariable[key] !== variableState[key]) {
                targetVariable[varId] = variableState[varId];
                changed = true;
              }
            });
          }
        }
      });
    });

    if (size(target.variables) > 0) {
      Object.keys(target.variables).forEach(key => {
        if (
          !has(targetState.variables, key) &&
          !has(targetState.lists, key) &&
          !has(targetState.broadcasts, key)
        ) {
          target.deleteVariable(key);
          changed = true;
        }
      });
    }

    if (changed) {
      this.actionManager.markRuntimeEmitProjectChanged();
    }
  }

  createVariable(type, varId, variableState, target, targetState) {
    switch (type) {
      case "broadcasts": {
        return new Variable(varId, variableState.name, Variable.BROADCAST_MESSAGE_TYPE, false);
      }
      case "lists": {
        const newVariable = new Variable(varId, variableState.name, Variable.LIST_TYPE, false);
        newVariable.value = variableState.value;
        return newVariable;
      }
      default: {
        const isCloud = Boolean(
          variableState.isCloud &&
            get(targetState, "isStage", target.isStage) &&
            this.vm.runtime.canAddCloudVariable()
        );
        const newVariable = new Variable(
          varId,
          variableState.name, // name of the variable
          Variable.SCALAR_TYPE, // type of the variable
          isCloud
        );
        if (isCloud) {
          this.vm.runtime.addCloudVariable();
        }
        newVariable.value = variableState.value;
        return newVariable;
      }
    }
  }

  setCurrentCostume(target, index) {
    // Keep the costume index within possible values.
    index = Math.round(index);
    if ([Infinity, -Infinity, NaN].includes(index)) index = 0;

    target.currentCostume = MathUtil.wrapClamp(index, 0, target.sprite.costumes.length - 1);
    if (target.renderer) {
      const costume = target.getCostumes()[target.currentCostume];
      target.renderer.updateDrawableSkinId(target.drawableID, costume.skinId);

      if (target.visible) {
        target.emit(RenderedTarget.EVENT_TARGET_VISUAL_CHANGE, target);
        target.runtime.requestRedraw();
      }
    }
    target.runtime.requestTargetsUpdate(target);
  }
}

function getSimplifiedLayerOrdering(targets) {
  const layerOrders = targets.map(getLayerOrder);
  return MathUtil.reducedSortOrdering(layerOrders);
}

function getLayerOrder(t) {
  return t.getLayerOrder();
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

function diffObject(obj, objState) {
  let changed = false;
  if (objState) {
    Object.keys(objState).forEach(key => {
      if (obj[key] !== objState[key]) {
        obj[key] = objState[key];
        changed = true;
      }
    });
  }
  return changed;
}

function deflateMedia(mediaList) {
  return Array.isArray(mediaList) ? mediaList.map(omitAsset) : [];
}

function omitAsset(media) {
  const { asset, ...rest } = media;
  return rest;
}

function ensureTarget(target, json, keys) {
  keys.forEach(key => {
    if (has(json, key)) {
      target[key] = json[key];
    }
  });
}

function getExtensionIdForOpcode(opcode) {
  if (!opcode) {
    return;
  }
  const index = opcode.indexOf("_");
  const forbiddenSymbols = /[^\w-]/g;
  const prefix = opcode.substring(0, index).replace(forbiddenSymbols, "-");
  if (prefix && !CORE_EXTENSIONS.includes(prefix)) {
    return prefix;
  }
}
