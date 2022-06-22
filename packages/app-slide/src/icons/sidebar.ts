export function sidebarSVG(namespace: string): SVGElement {
  const NS = "http://www.w3.org/2000/svg";

  const $svg = document.createElementNS(NS, "svg");
  $svg.setAttribute("class", `${namespace}-footer-icon-sidebar`);
  $svg.setAttribute("viewBox", "0 0 64 64");

  const $path = document.createElementNS(NS, "path");
  $path.setAttribute("fill", "currentColor");
  $path.setAttribute(
    "d",
    "M50 8H14c-3.309 0-6 2.691-6 6v36c0 3.309 2.691 6 6 6h36c3.309 0 6-2.691 6-6V14c0-3.309-2.691-6-6-6zM12 50V14c0-1.103.897-2 2-2h8v40h-8c-1.103 0-2-.897-2-2zm40 0c0 1.103-.897 2-2 2H26V12h24c1.103 0 2 .897 2 2z"
  );

  $svg.appendChild($path);

  return $svg;
}
