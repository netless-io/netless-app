export function spinnerSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-spinner`);
  $svg.setAttribute("viewBox", "0 0 512 512");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute(
    "d",
    "M304 48c0-26.5-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48s48-21.5 48-48zm0 416c0-26.5-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48s48-21.5 48-48zM48 304c26.5 0 48-21.5 48-48s-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48zm464-48c0-26.5-21.5-48-48-48s-48 21.5-48 48s21.5 48 48 48s48-21.5 48-48zM142.9 437c18.7-18.7 18.7-49.1 0-67.9s-49.1-18.7-67.9 0s-18.7 49.1 0 67.9s49.1 18.7 67.9 0zm0-294.2c18.7-18.7 18.7-49.1 0-67.9S93.7 56.2 75 75s-18.7 49.1 0 67.9s49.1 18.7 67.9 0zM369.1 437c18.7 18.7 49.1 18.7 67.9 0s18.7-49.1 0-67.9s-49.1-18.7-67.9 0s-18.7 49.1 0 67.9z"
  );

  const $animate = document.createElementNS(NS, "animateTransform");
  $animate.setAttribute("attributeName", "transform");
  $animate.setAttribute("attributeType", "xml");
  $animate.setAttribute("type", "rotate");
  $animate.setAttribute("from", "0 256 256");
  $animate.setAttribute("to", "360 256 256");
  $animate.setAttribute("begin", "0s");
  $animate.setAttribute("dur", "2s");
  $animate.setAttribute("fill", "freeze");
  $animate.setAttribute("repeatCount", "indefinite");
  $path.appendChild($animate);

  const $progress = document.createElementNS(NS, "text");
  $progress.setAttribute("x", "125");
  $progress.setAttribute("y", "345");
  $progress.setAttribute("data-id", "progress");
  $progress.style.fontSize = "246px";
  $progress.textContent = "20";
  $svg.appendChild($progress);
  $svg.appendChild($path);

  return $svg;
}
