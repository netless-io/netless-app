import style from "./style.scss?inline";
import { combine } from "value-enhancer";
import { SideEffectManager } from "side-effect-manager";

export function renderAccessControl(props) {
  const sideEffect = new SideEffectManager();
  renderMask();
  renderNav();
  return () => sideEffect.flushAll();

  function renderMask() {
    const $mask = document.createElement("div");
    $mask.className = "netless-scratch-mask";

    const $cursorMsg = document.createElement("div");
    $cursorMsg.className = "netless-scratch-cursor";
    $cursorMsg.textContent = "对方正在操作...";
    $mask.appendChild($cursorMsg);

    const $style = document.createElement("style");
    $style.textContent = style;
    $mask.appendChild($style);

    const showCursorMsg = () => {
      $cursorMsg.style.opacity = 1;
      sideEffect.setTimeout(
        () => {
          $cursorMsg.style.opacity = 0;
        },
        5000,
        "showCursorMsg"
      );
    };

    sideEffect.addEventListener($mask, "mousemove", ev => {
      $cursorMsg.style.transform = `translate(${ev.clientX + 20}px,${ev.clientY + 20}px)`;
      showCursorMsg();
    });

    sideEffect.addEventListener($mask, "mouseout", () => {
      $cursorMsg.style.opacity = 0;
    });

    sideEffect.add(() =>
      props.author$.subscribe(author => {
        const authorInfo = props.app.roomMembers.find(({ uid }) => author === uid);
        const nickName = authorInfo?.userPayload?.nickName;
        $cursorMsg.textContent = nickName ? `${nickName} 正在操作...` : "对方正在操作...";
      })
    );

    sideEffect.add(() =>
      props.isAuthor$.subscribe(isAuthor => {
        $mask.classList.toggle("is-active", !isAuthor);
      })
    );

    document.documentElement.appendChild($mask);
  }

  function renderNav() {
    const $nav = document.createElement("div");
    $nav.className = "netless-scratch-nav";

    const $requestAuthor = document.createElement("button");
    $requestAuthor.className = "netless-scratch-nav-btn";
    $nav.appendChild($requestAuthor);

    sideEffect.add(() =>
      props.isAuthor$.subscribe(isAuthor => {
        $requestAuthor.textContent = isAuthor ? "操作中" : "请求操作";
      })
    );

    sideEffect.add(() =>
      combine(
        [props.isAuthor$, props.isWritable$],
        ([isAuthor, isWritable]) => isAuthor || !isWritable
      ).subscribe(disabled => {
        $requestAuthor.disabled = disabled;
      })
    );

    sideEffect.addEventListener($requestAuthor, "click", () => {
      if (props.isWritable$.value) {
        props.makeAuthor();
      }
    });

    document.documentElement.appendChild($nav);
  }
}
