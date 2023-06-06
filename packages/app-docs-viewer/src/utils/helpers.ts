export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function flattenEvent(ev: MouseEvent | TouchEvent): MouseEvent | Touch {
  return (ev as TouchEvent).touches ? (ev as TouchEvent).touches[0] : (ev as MouseEvent);
}

export function preventEvent(ev: Event): void {
  ev.stopPropagation();
  if (ev.cancelable) {
    ev.preventDefault();
  }
}

export function isEditable(el: EventTarget | null) {
  if (!el) return false;
  const tagName = (el as HTMLElement).tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}
