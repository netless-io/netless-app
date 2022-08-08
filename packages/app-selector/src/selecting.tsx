import { Button, Col, Layout, Row, Table } from "antd";
import { computedCorrectRate, dayjs } from "./utils";
import { pickOption } from "./app";
import { useCountUp } from "./use-count-up";
import { useEffect, useState } from "react";
import type { Storage } from "@netless/window-manager";
import type { AnswerStorage, Step } from "./index";

const { Content, Footer } = Layout;

export type SelectingProps = {
  storage: Storage;
  answerStorage: AnswerStorage;
  optionsCount: number;
  step: Step;
  studentAnswer: (answer: string[]) => void;
  updateTitle: (time: string, reset?: boolean) => void;
  uid: string | undefined;
};

export const StudentSelecting = (props: SelectingProps) => {
  const { optionsCount, storage } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);
  const [isSubmit, setIsSubmit] = useState(false);
  const [stopTimer, setStopTimer] = useState(props.step === "start" ? false : true);
  useCountUp({ startAt: storage.state.startAt, updateTitle: props.updateTitle, stop: stopTimer });

  useEffect(() => {
    if (props.uid) {
      const myAnswer = props.answerStorage.state[props.uid];
      if (myAnswer) {
        setSelected(myAnswer.answer);
        setIsSubmit(true);
        setStopTimer(true);
      }
    }
  }, []);

  useEffect(() => {
    setStopTimer(props.step === "start" ? false : true);
  }, [props.step]);

  useEffect(() => {
    setCanSubmit(selected.length > 0);
  }, [selected]);

  const select = (option: string) => {
    if (isSubmit) return;
    if (selected.includes(option)) {
      setSelected(selected.filter(s => s !== option));
    } else {
      setSelected([...selected, option]);
    }
  };

  const submit = () => {
    props.studentAnswer(selected);
    setIsSubmit(true);
    setStopTimer(true);
  };

  const edit = () => {
    setIsSubmit(false);
  };

  const Selecting = (
    <Layout>
      <Content className="p-14">
        <div className="border shadow-sm w-full h-full justify-center p-5">
          <Row className="h-full">
            {pickOption(optionsCount).map((option, index) => (
              <Col key={index} span={6} className="flex items-center justify-center">
                <Button
                  key={index}
                  size="large"
                  shape="circle"
                  type={selected.includes(option) ? "primary" : "default"}
                  onClick={() => select(option)}
                >
                  {option}
                </Button>
              </Col>
            ))}
          </Row>
        </div>
      </Content>
      <Footer className="pt-0 -mt-3 flex justify-center">
        <div className="w-3/5">
          {isSubmit ? (
            <Button block type="primary" className="h-9 warn-button" onClick={edit}>
              修改答案
            </Button>
          ) : (
            <Button
              block
              type="primary"
              className="h-9"
              disabled={!canSubmit || isSubmit}
              onClick={submit}
            >
              提交答案
            </Button>
          )}
        </div>
      </Footer>
    </Layout>
  );

  return (
    <>{props.step === "finish" ? <StudentFinish {...props} selected={selected} /> : Selecting}</>
  );
};

type StudentFinishProps = SelectingProps & { selected: string[] };

export const StudentFinish = (props: StudentFinishProps) => {
  const { answerStorage, storage } = props;
  const answers = Object.values(answerStorage.state);
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
  const correctRate = computedCorrectRate(answers, storage.state.selected);

  return (
    <div className="p-6">
      <Table
        dataSource={answers}
        columns={columns}
        rowKey={row => row.uid}
        pagination={false}
        bordered
        size="large"
        scroll={{ y: 240 }}
      ></Table>
      <Row>
        <Col span={24} className="flex justify-center mt-2">
          <span>正确率: {correctRate}%</span>
        </Col>
        <Col span={24} className="flex justify-center mt-2">
          <span>正确答案: {storage.state.selected.join(",")}</span>
        </Col>
        {props.selected.length ? (
          <Col span={24} className="flex justify-center mt-2">
            <span>我的答案: {props.selected.join(",")}</span>
          </Col>
        ) : null}
      </Row>
    </div>
  );
};
