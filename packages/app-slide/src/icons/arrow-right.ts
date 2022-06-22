export function arrowRightSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-arrow-right`);
  $svg.setAttribute("viewBox", "0 0 500 500");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute(
    "d",
    "M322.19 250.041L162.527 409.705c-2.722 2.865-2.651 7.378.143 10.1 2.793 2.65 7.163 2.65 9.956 0l164.75-164.75c2.793-2.793 2.793-7.306 0-10.1l-164.75-164.75c-2.865-2.722-7.378-2.65-10.099.143-2.651 2.794-2.651 7.163 0 9.957l159.664 159.736z"
  );

  $svg.appendChild($path);

  return $svg;
}
