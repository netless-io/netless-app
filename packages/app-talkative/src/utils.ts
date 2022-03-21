import type { AppContext } from "@netless/window-manager";

export interface UserPayload {
  memberId: number;
  uid: string;
  nickName: string;
}

export function getUserPayload(context: AppContext): UserPayload {
  const room = context.getRoom();
  const displayer = context.getDisplayer();
  const memberId = displayer.observerId;
  const userPayload = displayer.state.roomMembers.find(
    member => member.memberId === memberId
  )?.payload;
  const uid = room?.uid || userPayload?.uid || "";
  const nickName = userPayload?.nickName || uid;
  return { memberId, uid, nickName };
}
