import type { NsNodeCmd, NsGraphCmd, NsEdgeCmd } from "@antv/xflow";
import {
  createKeybindingConfig,
  XFlowNodeCommands,
  XFlowEdgeCommands,
  XFlowGraphCommands,
  MODELS,
} from "@antv/xflow";

export const useKeybindingConfig = createKeybindingConfig(config => {
  // delete
  config.setKeybindingFunc(regsitry => {
    return regsitry.registerKeybinding([
      {
        id: "delete node or edge",
        keybinding: "backspace",
        callback: async function (_item, modelService, cmd) {
          const cells = await MODELS.SELECTED_CELLS.useValue(modelService);
          cells.map(cell => {
            if (cell.isNode()) {
              return cmd.executeCommand<NsNodeCmd.DelNode.IArgs>(XFlowNodeCommands.DEL_NODE.id, {
                nodeConfig: {
                  ...cell.getData(),
                  id: cell.id,
                },
              });
            }
            if (cell.isEdge()) {
              const cellData = cell.getData();
              if (!cellData) return;
              return cmd.executeCommand<NsEdgeCmd.DelEdge.IArgs>(XFlowEdgeCommands.DEL_EDGE.id, {
                edgeConfig: { ...cellData, id: cell.id },
              });
            }
          });
        },
      },
      {
        id: "copy",
        keybinding: ["command+c", "ctrl+c"],
        callback: async function (_item, _modelService, cmd, e) {
          e.preventDefault();
          cmd.executeCommand<NsGraphCmd.GraphCopySelection.IArgs>(
            XFlowGraphCommands.GRAPH_COPY.id,
            {}
          );
        },
      },
      {
        id: "paste",
        keybinding: ["command+v", "ctrl+v"],
        callback: async function (_item, _ctx, cmd, e) {
          e.preventDefault();
          cmd.executeCommand<NsGraphCmd.GraphPasteSelection.IArgs>(
            XFlowGraphCommands.GRAPH_PASTE.id,
            {}
          );
        },
      },
      {
        id: "undo",
        keybinding: ["meta+z", "ctrl+z"],
        callback: async function (_item, _ctx, cmd, e) {
          e.preventDefault();
          cmd.executeCommand<NsGraphCmd.GraphHistoryUndo.IArgs>(
            XFlowGraphCommands.GRAPH_HISTORY_UNDO.id,
            {}
          );
        },
      },
      {
        id: "redo",
        keybinding: ["meta+shift+z", "ctrl+shift+z"],
        callback: async function (_item, _ctx, cmd, e) {
          e.preventDefault();
          cmd.executeCommand<NsGraphCmd.GraphHistoryRedo.IArgs>(
            XFlowGraphCommands.GRAPH_HISTORY_REDO.id,
            {}
          );
        },
      },
    ]);
  });
});
