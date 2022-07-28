import "./dnd-node.less";

type INndNodeProps = {
  size: { width: number; height: number };
  data: {
    label: string;
    stroke: string;
    fill: string;
    fontFill: string;
    fontSize: number;
  };
};

export const DndNode = (props: INndNodeProps) => {
  const { size = { width: 126, height: 104 }, data } = props;
  const { width, height } = size;
  const { label, stroke, fill, fontFill, fontSize } = data;

  return (
    <div
      className="container"
      style={{
        width,
        height,
        borderColor: stroke,
        backgroundColor: fill,
        color: fontFill,
        fontSize,
      }}
    >
      <span>{label}</span>
    </div>
  );
};
