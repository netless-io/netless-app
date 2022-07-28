import {
  CANVAS_SCALE_TOOLBAR_CONFIG,
  XFlowGraphCommands,
  XFlowGroupCommands,
  XFlowNodeCommands,
  type IApplication,
} from "@antv/xflow";
import type { IAppLoad, NsGraph } from "@antv/xflow";
import React, { useRef, useEffect, useState } from "preact/compat";
/** 交互组件 */
import {
  /** XFlow核心组件 */
  XFlow,
  /** 流程图画布组件 */
  FlowchartCanvas,
  /** 流程图配置扩展 */
  FlowchartExtension,
  /** 流程图节点组件 */
  FlowchartNodePanel,
  /** 流程图表单组件 */
  FlowchartFormPanel,
  /** 通用组件：快捷键 */
  KeyBindings,
  /** 通用组件：画布缩放 */
  CanvasScaleToolbar,
  /** 通用组件：右键菜单 */
  CanvasContextMenu,
  /** 通用组件：工具栏 */
  CanvasToolbar,
  /** 通用组件：对齐线 */
  CanvasSnapline,
  /** 通用组件：节点连接桩 */
  CanvasNodePortTooltip,
} from "@antv/xflow";
import type { Graph } from "@antv/x6";
/** 配置Command*/
import { useCmdConfig } from "./config-cmd";
/** 配置Menu */
import { useMenuConfig } from "./config-menu";
/** 配置Toolbar */
import { useToolbarConfig } from "./config-toolbar";
/** 配置快捷键 */
import { useKeybindingConfig } from "./config-keybinding";
/** 配置Dnd组件面板 */
import { DndNode } from "./react-node/dnd-node";
import type { AppContext, Storage } from "@netless/window-manager";
import type { FlowSync } from "./flow-sync";

export interface IProps {
  meta: { flowId: string };
  stageRect$: any;
  nodeStorage: Storage<Record<string, NsGraph.INodeConfig>>;
  edgeStorage: Storage<Record<string, NsGraph.IEdgeConfig>>;
  groupStorage: Storage<Record<string, NsGraph.IGroupConfig>>;
  selectedStorage: Storage<{ ids: string[] }>;
  flowSync: FlowSync;
  apis: CmdConfigProps;
  context: AppContext;
}

export type CmdConfigProps = {
  addNode: (node: NsGraph.INodeConfig) => void;
  updateNode: (node: NsGraph.INodeConfig) => void;
  delNode: (id: string) => void;
  addEdge: (edge: NsGraph.IEdgeConfig) => void;
  delEdge: (id: string) => void;
  addGroup: (group: NsGraph.IGroupConfig) => void;
  delGroup: (id: string) => void;
  collapseGroup: (
    id: string,
    isCollapsed: boolean,
    collapsedSize: { width: number; height: number } | undefined
  ) => void;
};

export const Flow: React.FC<IProps> = props => {
  const { meta, stageRect$ } = props;
  const toolbarConfig = useToolbarConfig();
  const menuConfig = useMenuConfig();
  const keybindingConfig = useKeybindingConfig();
  const graphRef = useRef<Graph>();
  const appRef = useRef<IApplication>();

  const commandConfig = useCmdConfig(props.apis);
  const nodes = Object.values(props.nodeStorage.state);
  const edges = Object.values(props.edgeStorage.state);
  const groups = Object.values(props.groupStorage.state);
  const selected = props.selectedStorage.state.ids;
  const [isWritable, setIsWritable] = useState(props.context.isWritable);

  useEffect(() => {
    return props.context.emitter.on("writableChange", writable => {
      setIsWritable(writable);
      if (appRef.current) {
        appRef.current.executeCommand(XFlowGraphCommands.GRAPH_ZOOM.id, {
          factor: "real",
          zoomOptions: CANVAS_SCALE_TOOLBAR_CONFIG.zoomOptions,
        });
      }
    });
  }, [props.context]);
  /**
   * @param app 当前XFlow工作空间
   * @param extensionRegistry 当前XFlow配置项
   */

  const onLoad: IAppLoad = async app => {
    appRef.current = app;
    graphRef.current = await app.getGraphInstance();
    const pipeline: any = groups.map(group => {
      return {
        commandId: XFlowGroupCommands.ADD_GROUP.id,
        getCommandOption: async () => {
          return {
            args: {
              nodeConfig: group,
            },
          };
        },
      };
    });
    if (selected?.length) {
      pipeline.push({
        commandId: XFlowNodeCommands.SELECT_NODE.id,
        getCommandOption: async () => {
          return {
            args: {
              nodeIds: selected,
              resetSelection: true,
            },
          };
        },
      });
    }
    setTimeout(async () => {
      await app.executeCommandPipeline(pipeline);
      props.flowSync.setApp(app);
    }, 200);
  };

  useEffect(() => {
    stageRect$.subscribe(() => {
      if (graphRef.current) {
        const dom = document.querySelector(`[data-tele-box-i-d=${meta.flowId}] .xflow-canvas-root`);
        if (dom) {
          const rect = dom.getBoundingClientRect();
          graphRef.current.resize(rect.width, rect.height);
        }
      }
    });
  }, [graphRef]);

  return (
    <XFlow
      className="flow-user-custom-clz"
      commandConfig={commandConfig}
      onLoad={onLoad}
      meta={meta}
      graphData={{ nodes, edges }}
      isAutoCenter={true}
    >
      <FlowchartExtension />
      <FlowchartNodePanel
        show={isWritable}
        registerNode={{
          title: "自定义节点",
          key: "custom-node",
          nodes: [
            {
              component: DndNode,
              popover: () => <div>自定义节点</div>,
              name: "custom-node-indicator",
              width: 210,
              height: 130,
              label: "自定义节点",
            },
          ],
        }}
        position={{ width: 162, top: 40, bottom: 0, left: 0 }}
      />
      <CanvasToolbar
        className="xflow-workspace-toolbar-top"
        layout="horizontal"
        config={toolbarConfig}
        position={{ top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <FlowchartCanvas
        position={{ top: 40, left: 0, right: 0, bottom: 0 }}
        className="flowchart-canvas"
      >
        <CanvasScaleToolbar
          layout="horizontal"
          position={{ top: -40, right: 0 }}
          style={{
            width: 150,
            left: "auto",
            height: 39,
          }}
        />
        <CanvasContextMenu config={menuConfig} />
        <CanvasSnapline color="#faad14" />
        <CanvasNodePortTooltip />
      </FlowchartCanvas>
      <FlowchartFormPanel
        show={isWritable}
        position={{ width: 200, top: 40, bottom: 0, right: 0 }}
      />
      <KeyBindings config={keybindingConfig} />
    </XFlow>
  );
};

export default Flow;
