import { useEffect, useState } from "react";
import { dayjs } from "./utils";

export type ICountUpProps = {
  startAt: number;
  stop?: boolean;
  updateTitle: (time: string) => void;
};

const getDuration = (startAt: number) => dayjs.duration(dayjs(Date.now()).diff(dayjs(startAt)));

export const useCountUp = (props: ICountUpProps) => {
  const { startAt } = props;
  const [duration, setDuration] = useState(getDuration(startAt));
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (props.stop) return;
    const intervalTimer = window.setInterval(() => {
      setDuration(getDuration(startAt));
    }, 1000);
    setTimer(intervalTimer);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (props.stop) {
      clearInterval(timer);
    }
  }, [props.stop]);

  useEffect(() => {
    props.updateTitle(duration.format("HH:mm:ss"));
  }, [duration]);
};
