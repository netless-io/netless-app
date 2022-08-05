import { wrap } from "./utils";

export interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  return (
    <div className={wrap("login")}>
      <button className={wrap("login-start")} onClick={onLogin}>
        Start
      </button>
    </div>
  );
}
