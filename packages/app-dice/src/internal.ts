export function noop() {
  /* noop */
}

export function next_tick() {
  return Promise.resolve();
}

export function element<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return document.createElement(tag);
}

export function append(target: Node, node: Node) {
  return target.appendChild(node);
}

export function add_class<T extends HTMLElement>(el: T, name: string) {
  el.classList.add(`netless-app-dice-${name}`);
  return el;
}

export function svg_element<T extends keyof SVGElementTagNameMap>(tag: T) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

export function attr(node: HTMLElement | SVGElement, key: string, value: string | null) {
  if (value == null) {
    node.removeAttribute(key);
  } else if (node.getAttribute(key) !== value) {
    node.setAttribute(key, value);
  }
}

export function set_svg_attributes(node: SVGElement, attributes: Record<string, string>) {
  for (const key in attributes) {
    attr(node, key, attributes[key]);
  }
}

export function color_to_string(color: number[]) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}
