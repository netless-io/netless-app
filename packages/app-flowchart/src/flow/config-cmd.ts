import { createCmdConfig, DisposableCollection, uuidv4 } from "@antv/xflow";
import type { CmdConfigProps } from "./index";
import { debounce } from "lodash-es";

export const useCmdConfig = createCmdConfig((config, value) => {
  const apis = value.getValue() as CmdConfigProps;

  config.setRegisterHookFn(hooks => {
    const list = [
      hooks.addNode.registerHook({
        name: "set node config",
        handler: async args => {
          if (!args.nodeConfig) return;
          args.nodeConfig = {
            ...args.nodeConfig,
            id: args.nodeConfig.id || `node-${uuidv4()}`,
          };
        },
      }),
      hooks.addNode.registerHook({
        name: "sync node",
        handler: async args => {
          if (!args.nodeConfig) return;
          if (args.options?.isRenderGraph) return;
          if (args.nodeConfig.renderKey === "GROUP_NODE_RENDER_ID") return;
          apis.addNode(args.nodeConfig);
        },
      }),
      hooks.updateNode.registerHook({
        name: "sync node",
        handler: async args => {
          if (args.nodeConfig) {
            apis.updateNode(args.nodeConfig);
          }
        },
      }),
      hooks.delNode.registerHook({
        name: "sync node",
        handler: async args => {
          apis.delNode(args.nodeConfig.id);
        },
      }),
      hooks.addEdge.registerHook({
        name: "sync edge",
        handler: async args => {
          if (args.options?.isRenderGraph) return;
          // edge 在 add 时没有 ID
          setTimeout(() => {
            apis.addEdge(args.edgeConfig);
          }, 50);
        },
      }),
      hooks.updateEdge.registerHook({
        name: "sync edge",
        handler: async args => {
          apis.addEdge(args.edgeConfig);
        },
      }),
      hooks.delEdge.registerHook({
        name: "sync edge",
        handler: async args => {
          setTimeout(() => {
            if (args.edgeConfig) {
              apis.delEdge(args.edgeConfig.id);
            }
          }, 50);
        },
      }),
      hooks.addGroup.registerHook({
        name: "sync group",
        handler: async args => {
          if (!args.nodeConfig) return;
          args.nodeConfig = {
            ...args.nodeConfig,
            id: args.nodeConfig.id || `group-${uuidv4()}`,
          };
          const addGroup = debounce(apis.addGroup, 100);
          addGroup(args.nodeConfig);
        },
      }),
      hooks.delGroup.registerHook({
        name: "sync group",
        handler: async args => {
          const delGroup = debounce(apis.delGroup, 50);
          console.log("del group", args.nodeConfig);
          delGroup(args.nodeConfig.id);
        },
      }),
      hooks.collapseGroup.registerHook({
        name: "sync group",
        handler: async args => {
          console.log("collapse group", args);
          apis.collapseGroup(args.nodeId, args.isCollapsed, args.collapsedSize);
        },
      }),
    ];
    const toDispose = new DisposableCollection();
    toDispose.pushAll(list);
    return toDispose;
  });
});
