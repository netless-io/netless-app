export function element<T extends keyof HTMLElementTagNameMap>(tag: T) {
  return document.createElement(tag);
}

export function add_class<T extends HTMLElement>(el: T, name: string) {
  el.className = `netless-app-quill-${name}`;
  return el;
}

export function next_tick() {
  return Promise.resolve();
}

export function color_to_string(color: number[]) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}
