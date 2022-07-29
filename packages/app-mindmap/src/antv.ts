// Copy from https://x6.antv.vision/zh/examples/showcase/practices#mindmap
import type { Cell } from "@antv/x6";
import type { TreeNode } from "./model";

import { Graph, Path } from "@antv/x6";
import Hierarchy from "@antv/hierarchy";

export type NodeType = "topic" | "topic-branch" | "topic-child";

export interface MindMapData {
  id: string;
  type: NodeType;
  label: string;
  width: number;
  height: number;
  children?: MindMapData[];
}

const typeMap = ["topic", "topic-branch", "topic-child"] as const;
const sizeMap = [
  [100, 40],
  [80, 30],
  [80, 30],
] as const;

export function toMindMapData(root: TreeNode, depth = 0): MindMapData {
  const { id, label, children } = root;
  const index = depth > 2 ? 2 : depth;
  const type = typeMap[index];
  const [minWidth, height] = sizeMap[index];
  const width = calculateWidth(label, minWidth);
  const data: MindMapData = { id, type, label, width, height };
  if (children) {
    data.children = children.map(e => toMindMapData(e, depth + 1));
  }
  return data;
}

const PADDING = 10;

let canvas: HTMLCanvasElement | undefined;
let context: CanvasRenderingContext2D | null | undefined;
function calculateWidth(label: string, minWidth: number) {
  if (context === undefined) {
    canvas = document.createElement("canvas");
    context = canvas.getContext("2d");
    if (context) {
      context.font = "14px sans-serif";
    }
  }
  if (context === null) {
    return label.length * 10;
  }
  const width = context.measureText(label).width + PADDING;
  return width < minWidth ? minWidth : width;
}

export interface HierarchyResult {
  id: string;
  x: number;
  y: number;
  data: MindMapData;
  children?: HierarchyResult[];
}

export function defineShapes() {
  const circlePlus =
    "https://gw.alipayobjects.com/mdn/rms_43231b/afts/img/A*SYCuQ6HHs5cAAAAAAAAAAAAAARQnAQ";

  const topicImageAttrs = { refX: "100%", refY: "50%", refY2: -8, width: 16, height: 16 };

  Graph.registerNode(
    "topic",
    {
      inherit: "rect",
      markup: [
        { tagName: "rect", selector: "body" },
        { tagName: "image", selector: "img" },
        { tagName: "text", selector: "label" },
      ],
      attrs: {
        body: { rx: 6, ry: 6, stroke: "#5F95FF", fill: "#EFF4FF", strokeWidth: 1 },
        img: {
          ref: "body",
          ...topicImageAttrs,
          "xlink:href": circlePlus,
          event: "add:topic",
          class: "topic-image",
        },
        label: { fontSize: 14, fill: "#262626" },
      },
    },
    true
  );

  Graph.registerNode(
    "topic-child",
    {
      inherit: "rect",
      markup: [
        { tagName: "rect", selector: "body" },
        { tagName: "text", selector: "label" },
      ],
      attrs: {
        body: { rx: 6, ry: 6, fill: "transparent", strokeWidth: 1, stroke: "#5F95FF" },
        label: { fontSize: 14, fill: "currentColor" },
      },
    },
    true
  );

  Graph.registerConnector(
    "mindmap",
    (sourcePoint, targetPoint, _routerPoints, options) => {
      const midX = sourcePoint.x + 10;
      const midY = sourcePoint.y;
      const ctrX = (targetPoint.x - midX) / 5 + midX;
      const ctrY = targetPoint.y;
      const pathData = `M ${sourcePoint.x} ${sourcePoint.y} L ${midX} ${midY} Q ${ctrX} ${ctrY} ${targetPoint.x} ${targetPoint.y}`;
      return options.raw ? Path.parse(pathData) : pathData;
    },
    true
  );

  // 边
  Graph.registerEdge(
    "mindmap-edge",
    {
      inherit: "edge",
      connector: { name: "mindmap" },
      attrs: {
        line: { targetMarker: "", stroke: "#A2B1C3", strokeWidth: 2 },
      },
      zIndex: 0,
    },
    true
  );
}

export function doLayout(data: MindMapData): HierarchyResult {
  return Hierarchy.mindmap(data, {
    direction: "H",
    getHeight(d: MindMapData) {
      return d.height;
    },
    getWidth(d: MindMapData) {
      return d.width;
    },
    getHGap() {
      return 20;
    },
    getVGap() {
      return 10;
    },
    getSide() {
      return "right";
    },
  });
}

export function gatherCells(g: Graph, item: HierarchyResult) {
  const cells: Cell[] = [];
  gatherCells_(g, item, cells);
  return cells;
}

function gatherCells_(g: Graph, item: HierarchyResult, cells: Cell[]) {
  const { data, children } = item;
  cells.push(
    g.createNode({
      id: data.id,
      shape: data.type === "topic-child" ? "topic-child" : "topic",
      x: item.x,
      y: item.y,
      width: data.width,
      height: data.height,
      label: data.label,
      type: data.type,
    })
  );
  if (children) {
    children.forEach(node => {
      cells.push(
        g.createEdge({
          shape: "mindmap-edge",
          source: {
            cell: item.id,
            anchor:
              node.data.type === "topic-child"
                ? { name: "right", args: { dx: -16 } }
                : { name: "center", args: { dx: "25%" } },
          },
          target: {
            cell: node.id,
            anchor: { name: "left" },
          },
        })
      );
      gatherCells_(g, node, cells);
    });
  }
}
