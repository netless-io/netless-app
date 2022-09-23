import type { Storage } from "@netless/window-manager";
import { useState, type FunctionComponent } from "react";
import { useEffect } from "react";
import { Button, Layout, Space, Row, Col, Spin } from "antd";
import type { AnswerStorage, Api, Step } from "./index";
import { TeacherWaiting } from "./teacher-waiting";
import { StudentSelecting } from "./selecting";

export type IAppProps = {
  storage: Storage;
  answerStorage: AnswerStorage;
  isTeacher: boolean;
  api: Api;
  uid: string | undefined;
};

const { Sider, Content, Footer } = Layout;
export const OPTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"];
export const pickOption = (count: number) => {
  const sliceCount = count < 2 ? 2 : count;
  return OPTIONS.slice(0, sliceCount);
};

export const App: FunctionComponent<IAppProps> = props => {
  const { storage } = props;
  const [step, updateStep] = useState<Step>(storage.state.step);

  useEffect(() => {
    console.log("[App] useEffect", storage.state, props.answerStorage.state);
    return storage.on("stateChanged", () => {
      updateStep(storage.state.step);
    });
  }, []);

  const stepPickOptions = props.isTeacher ? <PickOptions {...props} /> : <StudentWait />;
  const stepStart = props.isTeacher ? (
    <TeacherWaiting
      answerStorage={props.answerStorage}
      storage={props.storage}
      finish={props.api.finish}
      restart={props.api.restart}
      updateTitle={props.api.updateTitle}
    />
  ) : (
    <StudentSelecting
      uid={props.uid}
      step={step}
      storage={props.storage}
      answerStorage={props.answerStorage}
      updateTitle={props.api.updateTitle}
      optionsCount={storage.state.optionsCount}
      studentAnswer={props.api.studentAnswer}
    />
  );
  let render = stepPickOptions;
  switch (step) {
    case "pickOptions": {
      render = stepPickOptions;
      break;
    }
    case "finish":
    case "start": {
      render = stepStart;
      break;
    }
  }
  return <Layout className="w-full h-full">{render}</Layout>;
};

const PickOptions = (props: IAppProps) => {
  const [optionsCount, updatesCount] = useState<number>(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);

  const addOptions = () => {
    const nextCount = optionsCount + 1;
    if (nextCount > OPTIONS.length) return;
    updatesCount(nextCount);
  };
  const removeOptions = () => {
    const nextCount = optionsCount - 1;
    if (nextCount < 2) return;
    updatesCount(nextCount);
  };

  const selectOption = (option: string) => {
    if (selected.includes(option)) {
      setSelected(selected.filter(s => s !== option));
    } else {
      setSelected([...selected, option]);
    }
  };

  useEffect(() => {
    setCanSubmit(selected.length > 0);
  }, [selected]);

  const submit = () => {
    props.api.updateStep("start", optionsCount, selected);
  };

  return (
    <>
      <Layout>
        <Content className="p-14">
          <div className="border shadow-sm w-full h-full justify-center p-5">
            <Row className="h-full">
              {pickOption(optionsCount).map((option, index) => (
                <Col key={index} span={6} className="flex items-center justify-center">
                  <Button
                    size="large"
                    type={selected.includes(option) ? "primary" : "default"}
                    shape="circle"
                    onClick={() => selectOption(option)}
                  >
                    {option}
                  </Button>
                </Col>
              ))}
            </Row>
          </div>
        </Content>
        <Sider width={"15%"} className="p-4 bg-transparent">
          <Space direction="vertical" className="w-full h-full flex items-center justify-center">
            <Button className="h-24 w-50" onClick={addOptions}>
              +
            </Button>
            <Button className="h-24 w-50" onClick={removeOptions}>
              -
            </Button>
          </Space>
        </Sider>
      </Layout>
      <Footer className="pt-0">
        <Content>
          <Button
            block
            type="primary"
            size={"large"}
            className="bg-primary"
            disabled={!canSubmit}
            onClick={submit}
          >
            开始答题
          </Button>
        </Content>
      </Footer>
    </>
  );
};

const StudentWait = () => {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Spin tip="老师出题中" size="large" />
    </div>
  );
};
