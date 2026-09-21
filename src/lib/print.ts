/*
 * Print isolation helper.
 *
 * Problem: printing a node that lives inside a modal produces clipped output
 * and blank pages (invisible-but-present layout). Solution: move the printable
 * node to be a direct child of <body>, add a marker class so the print CSS
 * (`body.<class> > *:not(#node) { display: none }`) hides the whole app, print,
 * then restore the node to its original spot.
 */
export function printIsolated(nodeId: string, bodyClass: string): void {
  const node = document.getElementById(nodeId);
  if (!node) {
    window.print();
    return;
  }
  const placeholder = document.createComment(`${nodeId}-slot`);
  node.replaceWith(placeholder);
  document.body.appendChild(node);
  document.body.classList.add(bodyClass);

  const restore = () => {
    document.body.classList.remove(bodyClass);
    placeholder.replaceWith(node);
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);

  window.print();

  // Fallback for WebViews that never fire `afterprint` — poll the print media
  // state so we don't yank the node out of an open print preview.
  const fallbackRestore = () => {
    if (window.matchMedia?.("print").matches) {
      setTimeout(fallbackRestore, 400);
      return;
    }
    if (document.body.classList.contains(bodyClass)) restore();
  };
  setTimeout(fallbackRestore, 2000);
}
