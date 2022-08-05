export const BOARD_SIZE = 15;

export type Cell = "o" | "x" | "";

export function judge(board: Cell[][], i: number, j: number): Cell {
  const cell = board[i][j];
  if (cell === "") {
    return "";
  }

  let sum: number;

  sum = 1;
  for (let a = i; board[a + 1] && board[++a][j] === cell; ) ++sum;
  for (let a = i; board[a - 1] && board[--a][j] === cell; ) ++sum;
  if (sum >= 5) return cell;

  sum = 1;
  for (let b = j; board[i][b + 1] && board[i][++b] === cell; ) ++sum;
  for (let b = j; board[i][b - 1] && board[i][--b] === cell; ) ++sum;
  if (sum >= 5) return cell;

  sum = 1;
  for (let a = i, b = j; board[a + 1] && board[++a][--b] === cell; ) ++sum;
  for (let a = i, b = j; board[a - 1] && board[--a][++b] === cell; ) ++sum;
  if (sum >= 5) return cell;

  sum = 1;
  for (let a = i, b = j; board[a + 1] && board[++a][++b] === cell; ) ++sum;
  for (let a = i, b = j; board[a - 1] && board[--a][--b] === cell; ) ++sum;
  if (sum >= 5) return cell;

  return "";
}

export interface Operation {
  i: number;
  j: number;
  c: Exclude<Cell, "">;
}

// { 0: { i: 5, j: 5, c: 'o' },
//   1: { i: 5, j: 6, c: 'x' } }
export interface Operations {
  [key: number]: Operation;
}

function sortedKeys(obj: object) {
  return Object.keys(obj).map(Number).sort();
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(""));
}

export function judgeFromAllOperations(ops: Operations): Cell {
  const board = emptyBoard();
  for (const key of sortedKeys(ops)) {
    const { i, j, c } = ops[key];
    board[i][j] = c;
    const cell = judge(board, i, j);
    if (cell) return cell;
  }
  return "";
}

export function buildBoardFromOperations(ops: Operations): Cell[][] {
  const board = emptyBoard();
  sortedKeys(ops).forEach(key => {
    const { c, i, j } = ops[key];
    board[i][j] = c;
  });
  return board;
}

export function getNextStep(ops: Operations): number {
  return Object.keys(ops).reduce((s, i) => Math.max(s, Number(i)), -1) + 1;
}

export interface GomokuState {
  xPlayer: string | null;
  oPlayer: string | null;
  turn: Exclude<Cell, "">;
}

export const defaultState: GomokuState = {
  xPlayer: null,
  oPlayer: null,
  turn: "o",
};
