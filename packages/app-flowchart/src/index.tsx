import styles from "./style.less?inline";
import { render } from "preact";

import type { NetlessApp } from "@netless/window-manager";
import { Flow } from "./flow";
import type { NsGraph } from "@antv/xflow";
import { FlowSync } from "./flow/flow-sync";
import { debounce, isEqual } from "lodash-es";

export interface FlowchartAttributes {
  count: number;
}

export interface MagixEventPayloads {
  addNode: NsGraph.INodeConfig;
  updateNode: NsGraph.INodeConfig;
  addEdge: NsGraph.IEdgeConfig;
  updateEdge: NsGraph.IEdgeConfig;
}

const Flowchart: NetlessApp<FlowchartAttributes, MagixEventPayloads> = {
  kind: "Flowchart",
  config: {
    enableShadowDOM: false,
  },
  setup(context) {
    const box = context.box;
    box.mountStyles(styles);

    const $content = document.createElement("div");
    $content.className = "app-flowchart-container";
    box.mountContent($content);

    const nodeStorage = context.createStorage<Record<string, NsGraph.INodeConfig>>("nodes");
    const edgeStorage = context.createStorage<Record<string, NsGraph.IEdgeConfig>>("edges");
    const groupStorage = context.createStorage<Record<string, NsGraph.IGroupConfig>>("groups");
    const selectedStorage = context.createStorage<{ ids: string[] }>("selected");

    const nodeStorageApis = () => {
      return {
        addNode: (node: NsGraph.INodeConfig) => {
          const data = JSON.parse(JSON.stringify(node));
          const originNode = nodeStorage.state[node.id];
          if (!isEqual(originNode, data)) {
            nodeStorage.setState({ [node.id]: data });
          }
        },
        updateNode: (node: NsGraph.INodeConfig) => {
          if (node.renderKey === "GROUP_NODE_RENDER_ID") {
            const data = JSON.parse(JSON.stringify(node));
            const originGroup = groupStorage.state[node.id];
            if (!isEqual(originGroup, data)) {
              groupStorage.setState({ [node.id]: data });
            }
          } else {
            const data = JSON.parse(JSON.stringify(node));
            const originNode = nodeStorage.state[node.id];
            if (!isEqual(originNode, data)) {
              nodeStorage.setState({ [node.id]: data });
            }
          }
        },
        delNode: (id: string) => {
          nodeStorage.setState({ [id]: undefined });
        },
      };
    };

    const edgeStorageApis = () => {
      return {
        addEdge: (edge: NsGraph.IEdgeConfig) => {
          const data = JSON.parse(JSON.stringify(edge));
          const originEdge = edgeStorage.state[edge.id];
          if (!isEqual(originEdge, data)) {
            edgeStorage.setState({ [edge.id]: data });
          }
        },
        delEdge: (id: string) => {
          edgeStorage.setState({ [id]: undefined });
        },
      };
    };

    const groupStorageApis = () => {
      return {
        addGroup: (group: NsGraph.IGroupConfig) => {
          const data = JSON.parse(JSON.stringify(group));
          const originGroup = groupStorage.state[group.id];
          if (!isEqual(originGroup, data)) {
            groupStorage.setState({ [group.id]: data });
          }
        },
        delGroup: (id: string) => {
          groupStorage.setState({ [id]: undefined });
        },
        collapseGroup: (id: string, isCollapsed: boolean) => {
          groupStorage.setState({ [id]: { ...groupStorage.state[id], isCollapsed } });
        },
      };
    };

    const apis = Object.assign(nodeStorageApis(), edgeStorageApis(), groupStorageApis());

    const flowSync = new FlowSync({ selectedStorage });
    const getGraphData = () => {
      const nodes = Object.values(nodeStorage.state);
      const edges = Object.values(edgeStorage.state);
      return { nodes, edges };
    };
    const updateGraph = debounce(flowSync.updateGraph, 100);
    nodeStorage.addStateChangedListener(() => {
      updateGraph(getGraphData());
    });
    edgeStorage.addStateChangedListener(() => {
      updateGraph(getGraphData());
    });
    log("render", apis);

    render(
      <Flow
        meta={{ flowId: context.appId }}
        context={context}
        stageRect$={box._stageRect$}
        nodeStorage={nodeStorage}
        edgeStorage={edgeStorage}
        groupStorage={groupStorage}
        selectedStorage={selectedStorage}
        flowSync={flowSync}
        apis={apis}
      />,
      $content
    );

    // Remember to remove unused listener
    context.emitter.on("destroy", () => {
      nodeStorage.destroy();
      edgeStorage.destroy();
      groupStorage.destroy();
    });

    // little log helper for visual appealing
    function log(...args: unknown[]) {
      return console.log("%c [Flowchart] ", "background:#FF8C00;color:#fff;", ...args);
    }
  },
};

export default Flowchart;
