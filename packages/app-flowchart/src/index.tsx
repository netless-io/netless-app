import styles from "./style.less?inline";
import { render } from "preact";

import type { NetlessApp } from "@netless/window-manager";
import { Flow } from "./flow";
import type { NsGraph } from "@antv/xflow";
import { FlowSync } from "./flow/flow-sync";
import { isEqual } from "lodash-es";

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

    nodeStorage.addStateChangedListener(diff => {
      Object.keys(diff).forEach(nodeID => {
        const node = diff[nodeID];
        if (node?.oldValue && node?.newValue) {
          flowSync.updateNode(node.newValue);
          // if (
          //   node.oldValue.isCollapsed !== undefined &&
          //   node.oldValue.isCollapsed !== node.newValue.isCollapsed
          // ) {
          //   flowSync.collapseGroup(node.newValue.id, node.newValue.isCollapsed);
          // }
        } else if (node?.newValue) {
          flowSync.addNode(node.newValue);
        } else if (node?.newValue === undefined) {
          flowSync.delNode(nodeID);
        }
      });
    });

    edgeStorage.addStateChangedListener(diff => {
      Object.keys(diff).forEach(edgeID => {
        const edge = diff[edgeID];
        if (edge?.oldValue && edge?.newValue) {
          flowSync.updateEdge(edge.newValue);
        } else if (edge?.newValue) {
          flowSync.addEdge(edge.newValue);
        } else if (edge?.newValue === undefined && edge?.oldValue) {
          flowSync.delEdge(edge.oldValue);
        }
      });
    });

    groupStorage.addStateChangedListener(diff => {
      Object.keys(diff).forEach(groupID => {
        const group = diff[groupID];
        if (group?.oldValue && group?.newValue) {
          flowSync.updateGroup(group.newValue);
        } else if (!group?.oldValue && group?.newValue) {
          flowSync.addGroup(group.newValue);
        } else if (group?.newValue === undefined && group?.oldValue) {
          flowSync.delGroup(group.oldValue.id);
        }
      });
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
