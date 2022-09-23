import type { AppContext, Storage } from "@netless/window-manager";
import type { NetlessAppMindMapAttributes } from "./index";

import { Graph, type Node } from "@antv/x6";
import { SideEffectManager } from "side-effect-manager";

import { add_class, element, next_id } from "./internal";
import { reconstruct, createNode, orderBy, type Nodes, type TreeNode, deconstruct } from "./model";
import { defineShapes, doLayout, gatherCells, toMindMapData, type NodeType } from "./antv";
import styles from "./style.scss?inline";

export class MindMapEditor {
  static readonly styles = styles;

  readonly defaultNodes: Nodes;
  readonly nodes$$: Storage<Nodes>;

  readonly $container: HTMLDivElement;
  readonly $graph: HTMLDivElement;
  readonly $input: HTMLInputElement;

  readonly graph: Graph;
  readonly sideEffect = new SideEffectManager();

  readonly tree: [node?: TreeNode] = [];

  private _destroyed = false;

  constructor(readonly context: AppContext<NetlessAppMindMapAttributes>) {
    if (context.attributes.root) {
      this.defaultNodes = deconstruct(context.attributes.root);
    } else {
      this.defaultNodes = { root: createNode(null, this.context.box.title, 0) };
    }

    this.nodes$$ = context.createStorage<Nodes>("nodes");

    this.$container = add_class(element("div"), "container");
    this.$graph = add_class(element("div"), "graph");
    this.$input = add_class(element("input"), "input");
    this.$container.appendChild(this.$graph);
    context.box.mountStyles(MindMapEditor.styles);
    context.box.mountContent(this.$container);

    this.graph = new Graph({
      container: this.$graph,
      connecting: {
        connectionPoint: "anchor",
      },
      selecting: {
        enabled: true,
      },
      keyboard: {
        enabled: true,
      },
      scroller: {
        enabled: true,
        pannable: true,
      },
      mousewheel: {
        enabled: true,
        modifiers: ["ctrl", "meta"],
        minScale: 0.5,
        maxScale: 2,
      },
    });

    setup(this);

    this.sideEffect.add(() => {
      const update = () => {
        this.$container.classList.toggle("is-readonly", !context.isWritable);
      };
      update();
      return context.emitter.on("writableChange", update);
    });

    this.sideEffect.add(() => {
      const observer = new ResizeObserver(() => {
        const { width, height } = this.$container.getBoundingClientRect();
        this.graph.resize(width, height);
      });
      observer.observe(this.$container);
      return () => observer.disconnect();
    });

    let raf = 0;
    const rerender = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.render());
    };
    this.sideEffect.addDisposer(this.nodes$$.on("stateChanged", rerender));

    this.render();
    this.graph.centerContent();
  }

  render() {
    if (this._destroyed) return;

    if (!this.nodes$$.state.root && this.context.isWritable) {
      this.nodes$$.setState(this.defaultNodes);
    }

    const roots = reconstruct(this.nodes$$.state);
    if (!roots.length) {
      this.graph.clearCells();
      return;
    }

    const root = doLayout(toMindMapData((this.tree[0] = roots[0])));
    const cells = gatherCells(this.graph, root);
    this.graph.resetCells(cells);
  }

  destroy() {
    this._destroyed = true;
    this.sideEffect.flushAll();
    this.graph.dispose();
  }
}

function setup({ sideEffect, graph, nodes$$, tree, context }: MindMapEditor) {
  defineShapes();

  function findTreeNode(id: string) {
    return tree[0] && findTreeNode_(id, tree[0]);
  }

  function findTreeNode_(id: string, node: TreeNode): TreeNode | undefined {
    if (node.id === id) return node;
    for (const child of node.children) {
      const result = findTreeNode_(id, child);
      if (result) return result;
    }
  }

  function addChildNode(id: string, label: string) {
    if (!context.isWritable) return;
    const parent = findTreeNode(id);
    if (!parent) return;
    const children = parent.children;
    const last = children.length ? children[children.length - 1] : null;
    nodes$$.setState({ [next_id()]: createNode(id, label, orderBy(parent, last, null)) });
  }

  function getChildLabel(type: NodeType) {
    if (type === "topic") return "new-branch";
    return "new-node";
  }

  function addSiblingNode(id: string, label: string) {
    if (!context.isWritable) return;
    const parentId = nodes$$.state[id]?.parent;
    if (!parentId) return;
    const parent = findTreeNode(parentId);
    if (!parent) return;
    const children = parent.children;
    const index = children.findIndex(e => e.id === id);
    if (index === -1) return; // should not happen
    const from = children[index];
    const to = children[index + 1] || null;
    nodes$$.setState({ [next_id()]: createNode(parentId, label, orderBy(parent, from, to)) });
  }

  function getLabel(type: NodeType) {
    if (type === "topic-branch") return "new-branch";
    return "new-node";
  }

  function removeNode(id: string) {
    if (!context.isWritable) return;
    const partial: Record<string, undefined> = { [id]: undefined };
    Object.keys(nodes$$.state).forEach(key => {
      const parent = nodes$$.state[key].parent;
      if (parent && parent in partial) {
        partial[key] = undefined;
      }
    });
    nodes$$.setState(partial);
  }

  function isX6NodeTool(target: EventTarget) {
    const el = target as HTMLElement;
    return el.className && el.className.includes("x6-node-tool-editor");
  }

  graph.on("add:topic", ({ node }: { node: Node }) => {
    if (!context.isWritable) return;
    addChildNode(node.id, getChildLabel(node.prop("type")));
  });

  graph.bindKey("tab", e => {
    if (!context.isWritable) return;
    if (!e.target || isX6NodeTool(e.target)) return;
    e.preventDefault();
    const selectedNodes = graph.getSelectedCells().filter(e => e.isNode());
    if (selectedNodes.length) {
      const node = selectedNodes[0];
      addChildNode(node.id, getChildLabel(node.prop("type")));
    }
  });

  graph.bindKey("enter", e => {
    if (!context.isWritable) return;
    if (!e.target) return;
    e.preventDefault();
    const selectedNodes = graph.getSelectedCells().filter(e => e.isNode());
    if (selectedNodes.length) {
      const node = selectedNodes[0];
      if (node.hasTool("node-editor")) {
        // trigger node editor hide itself
        document.dispatchEvent(new MouseEvent("mousedown"));
        return;
      }
      addSiblingNode(node.id, getLabel(node.prop("type")));
    }
  });

  graph.bindKey(["backspace", "delete"], e => {
    if (!context.isWritable) return;
    if (!e.target || isX6NodeTool(e.target)) return;
    const selectedNodes = graph.getSelectedCells().filter(e => e.isNode());
    if (selectedNodes.length) {
      const node = selectedNodes[0];
      removeNode(node.id);
    }
  });

  graph.on("node:dblclick", ({ node, e }: { node: Node; e: PointerEvent }) => {
    if (!context.isWritable) return;
    node.removeTool("node-editor");
    node.addTools({
      name: "node-editor",
      args: {
        event: e,
        attrs: {
          backgroundColor: "#EFF4FF",
        },
      },
    });
  });

  graph.bindKey("space", e => {
    if (!context.isWritable) return;
    if (!e.target || isX6NodeTool(e.target)) return;
    e.preventDefault();
    const selectedNodes = graph.getSelectedCells().filter(e => e.isNode());
    if (selectedNodes.length) {
      const node = selectedNodes[0];
      node.removeTool("node-editor");
      node.addTools({
        name: "node-editor",
        args: {
          event: e,
          attrs: {
            backgroundColor: "#EFF4FF",
          },
        },
      });
    }
  });

  graph.on("node:changed", ({ node }: { node: Node }) => {
    if (!context.isWritable) return;
    const data = nodes$$.state[node.id];
    if (!data) return;
    const label = node.getAttrByPath("text/text") as string;
    if (label !== data.label) {
      nodes$$.setState({ [node.id]: createNode(data.parent, label, data.order) });
    }
  });

  sideEffect.addDisposer(() => graph.off());
}
