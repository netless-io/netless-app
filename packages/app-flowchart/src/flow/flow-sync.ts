import { XFlowNodeCommands, XFlowEdgeCommands, XFlowGroupCommands, MODELS } from "@antv/xflow";
import { SideEffectManager } from "side-effect-manager";
import type { NsGraph, IApplication } from "@antv/xflow";
import type { Storage } from "@netless/window-manager";
import { isEqual, omit } from "lodash-es";

export class FlowSync {
  private app?: IApplication;
  private _sideEffect = new SideEffectManager();

  constructor(private storages: { selectedStorage: Storage<{ ids: string[] }> }) {
    storages.selectedStorage.addStateChangedListener(async diff => {
      const model = await this.getSelectedModel();
      if (model) {
        const originNode = model.getValue() || [];
        const originIds = (originNode as any).map((item: any) => item.id);
        const newValue = diff.ids?.newValue;
        if (!isEqual(originIds, newValue) && newValue && newValue.length > 0) {
          await this.app?.executeCommand(XFlowNodeCommands.SELECT_NODE.id, {
            nodeIds: newValue,
            resetSelection: true,
          });
        } else if (newValue?.length === 0) {
          await this.app?.executeCommand(XFlowNodeCommands.SELECT_NODE.id, {
            resetSelection: true,
          });
        }
      }
    });
  }

  public setApp(app: IApplication) {
    this.app = app;
    this.registerModelWatch(app);
  }

  public getSelectedModel = () => {
    if (!this.app) return;
    return MODELS.SELECTED_NODES.getModel(this.app.modelService);
  };

  public async registerModelWatch(app: IApplication) {
    this._sideEffect.flushAll();
    const selectedNode = await MODELS.SELECTED_NODES.getModel(app.modelService);
    const selectNodeDispose = selectedNode.watch(data => {
      const ids = data.length === 0 ? [] : data.map(item => item.id);
      if (isEqual(ids, this.storages.selectedStorage.state.ids)) return;
      this.storages.selectedStorage.setState({ ids });
    });
    this._sideEffect.add(() => selectNodeDispose.dispose);
  }

  public addNode = async (nodeConfig: NsGraph.INodeConfig) => {
    const node = await this.app?.getNodeById(nodeConfig.id);
    if (node) return;
    return this.app?.executeCommand(XFlowNodeCommands.ADD_NODE.id, { nodeConfig });
  };

  public updateNode = async (nodeConfig: NsGraph.INodeConfig) => {
    const node = await this.app?.getNodeById(nodeConfig.id);
    console.log("updateNode", nodeConfig);
    const nextConfig = omit(nodeConfig, ["isCollapsed"]);
    if (node?.toJSON() === nextConfig) return;
    return this.app?.executeCommand(XFlowNodeCommands.UPDATE_NODE.id, { nodeConfig: nextConfig });
  };

  public delNode = async (id: string) => {
    return this.app?.executeCommand(XFlowNodeCommands.DEL_NODE.id, { nodeConfig: { id } });
  };

  public addEdge = async (edgeConfig: NsGraph.IEdgeConfig) => {
    const edge = await this.app?.getEdgeById(edgeConfig.id);
    if (edge) return;
    return this.app?.executeCommand(XFlowEdgeCommands.ADD_EDGE.id, { edgeConfig });
  };

  public updateEdge = async (edgeConfig: NsGraph.IEdgeConfig) => {
    const edge = await this.app?.getEdgeById(edgeConfig.id);
    if (edge?.toJSON() === edgeConfig) return;
    return this.app?.executeCommand(XFlowEdgeCommands.UPDATE_EDGE.id, { edgeConfig });
  };

  public delEdge = async (edgeConfig: NsGraph.IEdgeConfig) => {
    const edge = await this.app?.getEdgeById(edgeConfig.id);
    if (!edge) return;
    return this.app?.executeCommand(XFlowEdgeCommands.DEL_EDGE.id, { edgeConfig });
  };

  public addGroup = async (groupConfig: NsGraph.IGroupConfig) => {
    const group = await this.app?.getNodeById(groupConfig.id);
    if (group) return;
    return this.app?.executeCommand(XFlowGroupCommands.ADD_GROUP.id, { nodeConfig: groupConfig });
  };

  public updateGroup = async (groupConfig: NsGraph.IGroupConfig) => {
    const group = await this.app?.getNodeById(groupConfig.id);
    if (isEqual(group?.toJSON(), groupConfig)) return;
    return this.app?.executeCommand(XFlowNodeCommands.UPDATE_NODE.id, { nodeConfig: groupConfig });
  };

  public delGroup = async (id: string) => {
    return this.app?.executeCommand(XFlowGroupCommands.DEL_GROUP.id, { nodeConfig: { id } });
  };

  public collapseGroup = async (id: string, isCollapsed: boolean) => {
    return this.app?.executeCommand(XFlowGroupCommands.COLLAPSE_GROUP.id, {
      nodeId: id,
      isCollapsed,
    });
  };

  public dispose() {
    this._sideEffect.flushAll();
  }
}
