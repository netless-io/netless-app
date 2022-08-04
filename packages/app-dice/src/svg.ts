import { svg_element, set_svg_attributes, append, element, add_class } from "./internal";

export function createSymbols() {
  const root = svg_element("svg");
  root.style.display = "none";
  set_svg_attributes(root, { width: "100", height: "100", viewBox: "0 0 100 100" });
  for (let i = 1; i <= 6; i++) {
    append(root, createSymbol(i));
  }
  return root;
}

function createSymbol(id: number) {
  const symbol = svg_element("symbol");
  set_svg_attributes(symbol, { id: `dice-face-${id}`, viewBox: "0 0 100 100" });
  if (id === 1 || id === 3 || id === 5) {
    append(symbol, createCircle(50, 50));
  }
  if (id === 2 || id === 3 || id === 4 || id === 5 || id === 6) {
    append(symbol, createCircle(25, 75));
    append(symbol, createCircle(75, 25));
  }
  if (id === 4 || id === 5 || id === 6) {
    append(symbol, createCircle(25, 25));
    append(symbol, createCircle(75, 75));
  }
  if (id === 6) {
    append(symbol, createCircle(25, 50));
    append(symbol, createCircle(75, 50));
  }
  return symbol;
}

function createCircle(cx: number, cy: number) {
  const circle = svg_element("circle");
  set_svg_attributes(circle, { cx: String(cx), cy: String(cy), r: "8" });
  return circle;
}

export function createCube(state: number[]) {
  const $cube = add_class(element("div"), "cube");
  const $faces: HTMLDivElement[] = [];
  for (let i = 1; i <= 6; ++i) {
    const $face = createFace(i, state[i - 1]);
    $faces.push($face);
    append($cube, $face);
  }
  return { $cube, $faces };
}

function createFace(index: number, id: number) {
  const $face = add_class(add_class(element("div"), "face"), `face-${index}`);
  const $pattern = svg_element("svg");
  set_svg_attributes($pattern, {
    width: "100",
    height: "100",
    viewBox: "0 0 100 100",
    fill: "#fff",
  });
  const $use = svg_element("use");
  set_svg_attributes($use, { href: `#dice-face-${id}` });
  append($pattern, $use);
  append($face, $pattern);
  return $face;
}
