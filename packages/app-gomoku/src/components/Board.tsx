import type { Cell } from "../model";

import clsx from "clsx";
import { useEffect, useRef, useState } from "preact/hooks";

import { GomokuStage } from "../stage";
import { wrap } from "./utils";

export interface BoardProps {
  board: Cell[][];
  turn: Cell;
  readonly: boolean;
  onOperation: (row: number, col: number) => void;
}

export function Board({ board, turn, readonly, onOperation }: BoardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [gomoku] = useState(() => new GomokuStage());

  useEffect(() => gomoku.mount(divRef.current), [gomoku]);
  useEffect(() => gomoku.setBoard(board), [board]);
  useEffect(() => gomoku.setColor(turn), [turn]);
  useEffect(() => gomoku.onOperation(onOperation), [onOperation]);

  return <div className={clsx(wrap("board"), { "is-readonly": readonly })} ref={divRef}></div>;
}
