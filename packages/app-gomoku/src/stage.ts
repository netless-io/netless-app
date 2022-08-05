import type { Cell } from "./model";

class Cursor {
  declare row: number;
  declare col: number;
  constructor(row: number, col: number) {
    this.row = row;
    this.col = col;
  }
}

function noop() {
  /* noop */
}

function cursor_not_equal(a: Cursor, row: number, col: number) {
  return a.row !== row || a.col !== col;
}

function reset_transform(context: CanvasRenderingContext2D) {
  if (context.resetTransform) {
    context.resetTransform();
  } else {
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}

export class GomokuStage {
  declare canvas: HTMLCanvasElement;
  declare context: CanvasRenderingContext2D;

  padding = 12;
  rows = 15;
  cellSize = 30;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d") as CanvasRenderingContext2D;
  }

  $container: HTMLElement | null = null;
  board: Cell[][] = [];
  cursor = new Cursor(-1, -1);
  color: Cell = "";
  resizeObserver: ResizeObserver | null = null;
  disposers = new Set<() => void>();

  onClick: (row: number, col: number) => void = noop;

  mount($container: HTMLElement | null) {
    this.$container = $container;
    if ($container) {
      $container.appendChild(this.canvas);
      $container.addEventListener("pointermove", this.onPointerMove);
      $container.addEventListener("click", this.tryMove);
      const observer = new ResizeObserver(this.refresh.bind(this));
      this.resizeObserver = observer;
      observer.observe($container);
      this.disposers.add(() => {
        $container.removeEventListener("pointermove", this.onPointerMove);
        $container.removeEventListener("click", this.tryMove);
        observer.disconnect();
      });
      this.refresh();
    }
    return this.unmount.bind(this);
  }

  onPointerMove = ({ clientX, clientY }: PointerEvent) => {
    const { left, top } = this.canvas.getBoundingClientRect();
    const row = Math.round((clientX - left - this.padding) / this.cellSize);
    const col = Math.round((clientY - top - this.padding) / this.cellSize);
    this.setCursor(row, col);
  };

  tryMove = () => {
    if (this.hasCursor() && this.color !== "") {
      const { row, col } = this.cursor;
      this.onClick(row, col);
    }
  };

  unmount() {
    this.disposers.forEach(dispose => dispose());
    this.disposers.clear();
    this.cursor = new Cursor(-1, -1);
    this.board = [];
    this.onClick = noop;
    this.$container = null;
    this.resizeObserver = null;
  }

  setBoard(board: Cell[][]) {
    if (this.board !== board) {
      this.board = board;
      this.refresh();
    }
  }

  onOperation(onClick: (row: number, col: number) => void) {
    this.onClick = onClick;
  }

  setCursor(row: number, col: number) {
    if (cursor_not_equal(this.cursor, row, col)) {
      this.cursor = new Cursor(row, col);
      this.refresh();
    }
  }

  setColor(color: Cell) {
    if (this.color !== color) {
      this.color = color;
      this.refresh();
    }
  }

  refresh() {
    if (!this.$container) return;

    const { $container, canvas, context } = this;
    const { width, height } = $container.getBoundingClientRect();
    const size = Math.min(width, height);
    canvas.style.width = canvas.style.height = `${size}px`;
    const scale = window.devicePixelRatio;
    const fullSize = Math.floor(size * scale);
    canvas.width = canvas.height = fullSize; // also triggers clearing
    // XXX: safari has a bug that reset canvas size will cause memory leak

    reset_transform(context);
    context.scale(scale, scale);

    const padding = this.padding;
    const realSize = size - padding * 2;
    const rows = this.rows;
    const cellSize = realSize / (rows - 1);
    const pointSize = cellSize / Math.E;
    this.cellSize = cellSize;

    // background
    context.fillStyle = "#FF851B";
    context.fillRect(0, 0, fullSize, fullSize);

    // border
    context.strokeStyle = "#000";
    context.lineWidth = 4;
    context.lineJoin = "round";
    context.strokeRect(padding, padding, realSize, realSize);
    context.fillRect(padding, padding, realSize, realSize);

    // cells
    context.lineWidth = 1;
    context.beginPath();
    for (let i = 1; i <= rows - 2; ++i) {
      const a = padding + i * cellSize;
      context.moveTo(padding, a);
      context.lineTo(padding + realSize, a);
      context.moveTo(a, padding);
      context.lineTo(a, padding + realSize);
    }
    context.stroke();

    // special point x 4
    context.fillStyle = "#000";
    context.beginPath();
    for (const i of [3, 11]) {
      for (const j of [3, 11]) {
        const x = padding + i * cellSize;
        const y = padding + j * cellSize;
        context.moveTo(x, y);
        context.ellipse(x, y, 2, 2, 0, 0, 2 * Math.PI);
      }
    }
    context.fill();

    // board
    const whites: Cursor[] = [];
    const blacks: Cursor[] = [];
    this.board.forEach((line, row) => {
      line.forEach((value, col) => {
        if (value === "o") whites.push(new Cursor(row, col));
        if (value === "x") blacks.push(new Cursor(row, col));
      });
    });
    context.lineWidth = 2;
    context.strokeStyle = "#000";
    const paint = ({ row, col }: Cursor) => {
      const a = row * cellSize + padding;
      const b = col * cellSize + padding;
      context.moveTo(a, b);
      context.ellipse(a, b, pointSize, pointSize, 0, 0, 2 * Math.PI);
    };
    // blacks
    if (blacks.length) {
      context.fillStyle = "#000";
      context.beginPath();
      blacks.forEach(paint);
      context.stroke();
      context.fill();
    }
    // whites
    if (whites.length) {
      context.fillStyle = "#fff";
      context.beginPath();
      whites.forEach(paint);
      context.stroke();
      context.fill();
    }
    // cursor
    if (this.color && this.hasCursor()) {
      context.strokeStyle = "transparent";
      context.fillStyle = this.color === "o" ? "#ffffff70" : "#00000070";
      context.beginPath();
      paint(this.cursor);
      context.stroke();
      context.fill();
    }
  }

  hasCursor() {
    const { row, col } = this.cursor;
    return this.board[row] && this.board[row][col] === "";
  }
}
