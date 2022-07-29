/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MindMapNode } from "./index";
import { MIN_ORDER, MAX_ORDER } from "./constants";
import { next_id } from "./internal";

export interface Node {
  parent: string | null;
  label: string;
  order: number;
}

class _Node implements Node {
  parent: string | null;
  label: string;
  order: number;
  constructor(parent: string | null, label: string, order: number) {
    this.parent = parent;
    this.label = label;
    this.order = order;
  }
}

export function createNode(parent: string | null, label: string, order: number): Node {
  return new _Node(parent, label, order);
}

export type Dict<T = any> = Record<string, T>;

// Stored in storage "nodes", let's call it `var nodes$$`
//
// insert / modify (including changing its parent, order, label) node:
// let nodeId = next_id()
// nodes$$.setState({ [nodeId]: createNode(parent, label, order) })
//
// delete node:
// nodes$$.setState({ [nodeId]: undefined })
export type Nodes = Dict<Node>;
// This tree:
//   root -> a -> b
//        -> c
// is represented as:
//   id1: { parent: null, label: "root" }
//   id2: { parent: id1 , label: "a"    }
//   id3: { parent: id2 , label: "b"    }
//   id4: { parent: id1 , label: "c"    }

export interface TreeNode {
  id: string;
  label: string;
  order: number;
  children: TreeNode[];
}

// Using class for better performance
class _TreeNode implements TreeNode {
  id: string;
  label: string;
  order: number;
  children: _TreeNode[];
  constructor(id: string, label: string, order: number, children: _TreeNode[]) {
    this.id = id;
    this.label = label;
    this.children = children;
    this.order = order;
  }
}

// Returns roots
export function reconstruct(nodes: Nodes): TreeNode[] {
  const map = new Map<string, _TreeNode>();
  const ids = Object.keys(nodes);
  const roots: _TreeNode[] = [];
  ids.forEach(id => {
    map.set(id, new _TreeNode(id, nodes[id].label, nodes[id].order, []));
  });
  ids.forEach(id => {
    const me = map.get(id) as _TreeNode;
    const parentId = nodes[id].parent;
    const parent = parentId && map.get(parentId);
    if (parent) {
      parent.children.push(me);
    } else {
      roots.push(me);
    }
  });
  map.forEach(node => {
    node.children.sort(compareNode);
  });
  roots.sort(compareNode);
  return roots;
}

export function deconstruct(node: MindMapNode) {
  const nodes: Nodes = {};
  deconstruct_(node, nodes, null, 0);
  return nodes;
}

function deconstruct_(node: MindMapNode, nodes: Nodes, parent: string | null, index: number) {
  const id = next_id();
  nodes[id] = createNode(parent, node.label, index * 16);
  if (node.children) {
    node.children.forEach((child, index) => {
      deconstruct_(child, nodes, id, index);
    });
  }
}

export function compareNode(a: TreeNode, b: TreeNode) {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : a.id.localeCompare(b.id);
}

// Find an "order" to insert a node below some parent node
export function orderBy(parent: TreeNode | null, from: TreeNode | null, to: TreeNode | null) {
  if (parent === null) return 0;
  const children = parent.children;
  if (children.length === 0) {
    return MIN_ORDER;
  }
  if (children.length === 1 && from) {
    return MAX_ORDER;
  }
  if (from === null) {
    return children[0].order / 2;
  }
  if (to === null) {
    return children[children.length - 1].order + 16;
  }
  return (from.order + to.order) / 2;
}
