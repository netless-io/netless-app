import type { MemberIDType } from "./utils";

import { wrap } from "./utils";

export interface WinnerProps {
  memberID: MemberIDType;
  winner: string | null;
  loser: string | null;
}

export function Winner({ memberID, winner, loser }: WinnerProps) {
  if (!winner && !loser) {
    return null;
  }
  return (
    <div className={wrap("winner")}>
      {memberID === winner ? "You Win!" : memberID === loser ? "You Lose!" : `${winner} Wins!`}
    </div>
  );
}
