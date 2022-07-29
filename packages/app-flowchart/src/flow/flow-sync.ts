import { XFlowNodeCommands, MODELS, XFlowGraphCommands } from "@antv/xflow";
import { SideEffectManager } from "side-effect-manager";
import type { NsGraph, IApplication } from "@antv/xflow";
import type { Storage } from "@netless/window-manager";
import { isEqual } from "lodash-es";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunc = (...args: any[]) => any;

export class FlowSync {
  private app?: IApplication;
  private _sideEffect = new SideEffectManager();

  constructor(private storages: { selectedStorage: Storage<{ ids: string[] }> }) {
    storages.selectedStorage.addStateChangedListener(async diff => {
      const model = await this.getSelectedModel();
      if (model) {
        const originNode = model.getValue() || [];
        const originIds = (originNode as NsGraph.INodeConfig[]).map(item => item.id);
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

  public updateGraph: AnyFunc = async (graphData: any) => {
    return this.app?.executeCommand(XFlowGraphCommands.GRAPH_RENDER.id, { graphData });
  };

  public dispose() {
    this._sideEffect.flushAll();
  }
}
