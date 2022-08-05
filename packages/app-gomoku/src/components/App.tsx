/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppContext } from "@netless/window-manager";

import { useGomokuStates } from "./hooks";

import { Board } from "./Board";
import { Login } from "./Login";
import { Waiting } from "./Waiting";
import { Winner } from "./Winner";

export interface Props {
  context: AppContext;
}

export function App({ context }: Props) {
  const $ = useGomokuStates(context);

  if (import.meta.env.DEV) {
    (window as any).gomoku = $;
  }

  return (
    <div class="netless-app-gomoku">
      <Board board={$.board} readonly={$.readonly} turn={$.turn} onOperation={$.onOperation} />
      {$.isShowLogin && <Login onLogin={$.onLogin} />}
      {$.isShowWaiting && <Waiting />}
      {($.winner || $.loser) && (
        <Winner winner={$.winnerName} loser={$.loserName} memberID={$.memberID} />
      )}
    </div>
  );
}
