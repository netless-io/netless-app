import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import type { Answer } from "./index";
dayjs.extend(duration);

export { dayjs };

export const computedCorrectRate = (answers: Answer[], selected: string[]) => {
  let correctRate = 0;
  if (answers.length > 0) {
    const correctAnswers = answers.filter(
      a => JSON.stringify(a.answer) === JSON.stringify(selected)
    );
    correctRate = (correctAnswers.length / answers.length) * 100;
  }
  return correctRate;
};
