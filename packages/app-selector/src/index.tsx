import styles from "./index.css?inline";

import type { NetlessApp, Storage } from "@netless/window-manager";
import ReactDOM from "react-dom";
import { App } from "./app";

export interface SelectorAttributes {
  count: number;
  teacher: string;
}

export interface MagixEventPayloads {
  ping: number; // ping as message event key, `number` is the payload format.
  pong: {
    c: number;
  };
}

export type Step = "pickOptions" | "start" | "finish";

export type SelectorStorage = {
  selected: string[];
  step: Step;
  startAt?: number;
  finishAt?: number;
  optionsCount: number;
};

export type Answer = {
  uid: string;
  name: string;
  answer: string[];
  time: number;
};

export type AnswerStorage = Storage<Record<string, Answer>>;

export type Api = {
  updateStep: (step: Step, optionsCount: number, selected: string[]) => void;
  studentAnswer: (answer: string[]) => void;
  finish: () => void;
  restart: () => void;
  updateTitle: (time: string, reset?: boolean) => void;
};

const Selector: NetlessApp<SelectorAttributes, MagixEventPayloads> = {
  kind: "Selector",
  config: {
    enableShadowDOM: true,
    width: 0.5,
    height: 0.7,
  },
  setup(context) {
    const box = context.box;
    box.setResizable(false);

    box.mountStyles(styles);
    const title = box.title;
    const updateTitle = (time: string, reset?: boolean) => {
      if (reset) {
        box.setTitle(title);
      } else {
        box.setTitle(`${title}      ${time}`);
      }
    };

    const $content = document.createElement("div");
    $content.className = "app-selector-container";
    box.mountContent($content);
    const storage = context.createStorage<SelectorStorage>("selector", {
      optionsCount: 4,
      selected: [],
      step: "pickOptions",
    });
    const answerStorage = context.createStorage("answer");

    // const isTeacher = context.storage.state.teacher === context.currentMember?.uid;
    const isTeacher = false;
    const updateStep = (step: Step, optionsCount: number, selected: string[]) => {
      const startAt = Date.now();
      storage.setState({ step, optionsCount, selected, startAt });
    };
    const studentAnswer = (answer: string[]) => {
      const uid = context.currentMember?.uid || "";
      const name = context.currentMember?.payload?.nickName;
      const time = Date.now();
      answerStorage.setState({
        [uid]: {
          uid,
          name,
          answer,
          time,
        },
      });
    };
    (window as any).answerStorage = answerStorage;
    const finish = () => {
      storage.setState({ step: "finish", finishAt: Date.now() });
    };
    const restart = () => {
      storage.setState({ step: "pickOptions", finishAt: undefined, startAt: undefined });
      answerStorage.emptyStorage();
    };
    const api = { updateStep, studentAnswer, finish, restart, updateTitle };
    ReactDOM.render(
      <App
        storage={storage}
        answerStorage={answerStorage}
        isTeacher={isTeacher}
        api={api}
        uid={context.currentMember?.uid}
      />,
      $content
    );
  },
};

// function log(...args: unknown[]) {
//   return console.log("%c [Selector] ", "background:#FF8C00;color:#fff;", ...args);
// }

export default Selector;
