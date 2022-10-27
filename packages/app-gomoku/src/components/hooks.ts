/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AppContext } from "@netless/window-manager";
import type { GomokuState, Operation, Operations } from "../model";
import { getNickNameByUID, type MemberIDType } from "./utils";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import {
  defaultState,
  getNextStep,
  judgeFromAllOperations,
  buildBoardFromOperations,
} from "../model";

export function useWritable(context: AppContext) {
  const [writable, setWritable] = useState(() => context.isWritable);

  useEffect(
    () => context.emitter.on("writableChange", () => setWritable(context.isWritable)),
    [context]
  );

  return writable;
}

export function useStorage<T extends Record<string, any>>(
  context: AppContext,
  namespace: string,
  defaultState: () => T
): [T, (v: Partial<T>) => void] {
  const [storage] = useState(() => context.createStorage<T>(namespace, defaultState()));
  const [state, _setState] = useState(storage.state);
  const setState = useMemo(() => storage.setState.bind(storage), [context]);

  useEffect(
    () =>
      storage.on("stateChanged", () => {
        _setState({ ...storage.state });
      }),
    [storage]
  );

  return [state, setState];
}

export function useMembers(context: AppContext) {
  const [members, setMembers] = useState(() => context.members);

  useEffect(() => context.emitter.on("roomMembersChange", setMembers), [context]);

  return members;
}

export function useMemberID(context: AppContext): MemberIDType {
  return useMemo(() => context.currentMember?.uid || "", [context]);
}

export function useGomokuStates(context: AppContext) {
  const [syncState, setSyncState] = useStorage<GomokuState>(context, "gomoku", () => defaultState);
  const [operations, setOperations] = useStorage<Operations>(context, "operations", () => ({}));

  const isWritable = useWritable(context);
  const members = useMembers(context);
  const memberID = useMemberID(context);

  const board = useMemo(() => buildBoardFromOperations(operations), [operations]);

  const [winner, loser] = useMemo(() => {
    const result = judgeFromAllOperations(operations);
    if (!result) return [null, null];
    return result === "o"
      ? [syncState.oPlayer, syncState.xPlayer]
      : [syncState.xPlayer, syncState.oPlayer];
  }, [operations, syncState.oPlayer, syncState.xPlayer]);

  const [winnerName, loserName] = useMemo(() => {
    const winnerName = winner && (getNickNameByUID(members, winner) || winner);
    const loserName = loser && (getNickNameByUID(members, loser) || loser);
    return [winnerName, loserName];
  }, [members, winner, loser]);

  const readonly = useMemo(() => {
    if (!isWritable) return true;
    if (syncState.oPlayer && syncState.oPlayer === memberID) return syncState.turn !== "o";
    if (syncState.xPlayer && syncState.xPlayer === memberID) return syncState.turn !== "x";
    return Boolean(syncState.oPlayer && syncState.xPlayer);
  }, [syncState.oPlayer, syncState.xPlayer, syncState.turn, memberID, isWritable]);

  const isShowLogin = useMemo(() => {
    if (!isWritable) return false;
    if (syncState.oPlayer === memberID || syncState.xPlayer === memberID) return false;
    return !syncState.oPlayer || !syncState.xPlayer;
  }, [syncState.xPlayer, syncState.oPlayer, memberID, isWritable]);

  const isShowWaiting = useMemo(() => {
    if (winner !== null) return false;
    if (syncState.oPlayer === memberID && !syncState.xPlayer) return true;
    if (syncState.xPlayer === memberID && !syncState.oPlayer) return true;
    return false;
  }, [syncState.xPlayer, syncState.oPlayer, memberID]);

  const onLogin = useCallback(() => {
    if (!syncState.oPlayer) {
      setSyncState({ oPlayer: memberID });
    } else if (!syncState.xPlayer) {
      setSyncState({ xPlayer: memberID });
    }
  }, [syncState.oPlayer, syncState.xPlayer, memberID]);

  const onOperation = useCallback(
    (row: number, col: number) => {
      if (isWritable) {
        const operation: Operation = { i: row, j: col, c: syncState.turn };
        setOperations({ [getNextStep(operations)]: operation });
        setSyncState({ turn: syncState.turn === "o" ? "x" : "o" });
      }
    },
    [operations, syncState.turn]
  );

  return {
    board,
    turn: syncState.turn,
    readonly,
    winner,
    loser,
    winnerName,
    loserName,
    memberID,
    isShowLogin,
    isShowWaiting,
    onLogin,
    onOperation,
  };
}
