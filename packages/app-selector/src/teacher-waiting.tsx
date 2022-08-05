import type { AnswerStorage, Step } from "./index";
import type { Storage } from "@netless/window-manager";
import { Table, Layout, Button } from "antd";
import { useEffect, useState } from "react";
import { dayjs } from "./utils";
import { useCountUp } from "./use-count-up";
import { clsx } from "clsx";

const { Content, Footer } = Layout;

export type TeacherWaitingProps = {
  storage: Storage;
  answerStorage: AnswerStorage;
  finish: () => void;
  restart: () => void;
  updateTitle: (time: string, reset?: boolean) => void;
};

export const TeacherWaiting = (props: TeacherWaitingProps) => {
  const { storage, answerStorage } = props;
  const [step, setStep] = useState<Step>(storage.state.step);
  const [stopTimer, setStopTimer] = useState(step === "start" ? false : true);
  useCountUp({ startAt: storage.state.startAt, stop: stopTimer, updateTitle: props.updateTitle });

  const answers = Object.values(answerStorage.state);

  let correctRate = 0;
  if (answers.length > 0) {
    const correctAnswers = answers.filter(
      a => JSON.stringify(a.answer) === JSON.stringify(storage.state.selected)
    );
    correctRate = (correctAnswers.length / answers.length) * 100;
  }

  const columns = [
    {
      title: "用户名",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "答案",
      dataIndex: "answer",
      key: "uid",
      render: (answer: string[]) => {
        return <span>{answer.join(",")}</span>;
      },
    },
    {
      title: "用时",
      dataIndex: "time",
      key: "time",
      render: (time: number) => {
        const duration = dayjs.duration(dayjs(time).diff(dayjs(storage.state.startAt)));
        return <span>{duration.format("mm:ss")}</span>;
      },
    },
  ];

  useEffect(() => {
    return props.storage.addStateChangedListener(() => {
      setStep(props.storage.state.step);
    });
  }, []);

  const finish = () => {
    if (step === "start") {
      props.finish();
      setStopTimer(true);
    } else {
      props.restart();
      props.updateTitle("", true);
    }
  };

  return (
    <Layout>
      <Content className="p-3">
        <Table
          dataSource={answers}
          columns={columns}
          rowKey={row => row.uid}
          pagination={false}
          bordered
          size="large"
          scroll={{ y: 240 }}
          footer={() => <span>正确率: {correctRate}%</span>}
        ></Table>
        {/* <div className="mt-4 pl-12 pr-12"></div> */}
      </Content>
      <Footer>
        <Button
          block
          type="primary"
          className={clsx("h-9", step === "finish" ? "warn-button" : undefined)}
          onClick={finish}
        >
          {step === "start" ? "结束答题" : "重新开始"}
        </Button>
      </Footer>
    </Layout>
  );
};
