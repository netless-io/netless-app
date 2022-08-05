import { wrap } from "./utils";

export interface WaitingProps {}

export function Waiting() {
  return <div className={wrap("waiting")}>Waiting for other players&hellip;</div>;
}
