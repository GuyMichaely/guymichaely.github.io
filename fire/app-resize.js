function initializeResizeHandles() {
  document.addEventListener("pointerdown", event => {
    const handle = event.target.closest(".resize-edge[data-resize-target]");
    if (!handle) return;

    const shell = handle.closest(".resize-shell");

    event.preventDefault();

    const resizeKey = handle.dataset.resizeTarget;
    const styles = window.getComputedStyle(shell);
    const minHeight = Number.parseFloat(styles.minHeight);
    const startRect = shell.getBoundingClientRect();
    const startHeight = startRect.height;
    const startClientY = event.clientY;
    const previousOverflowAnchor = document.documentElement.style.overflowAnchor;
    let currentClientY = event.clientY;
    let scrollDeltaForResize = 0;
    let lastScrollY = window.scrollY;
    let userScrollExpectedUntil = 0;

    document.documentElement.style.overflowAnchor = "none";
    shell.classList.add("is-resizing");

    const syncHeightToPointer = () => {
      const desiredHeight = startHeight + currentClientY - startClientY + scrollDeltaForResize;
      let maxHeight = Math.max(minHeight, shell.getBoundingClientRect().height, getResizeContentFitHeight(shell));
      let nextHeight = clamp(desiredHeight, minHeight, maxHeight);

      while (nextHeight === maxHeight && nextHeight < desiredHeight) {
        shell.style.height = `${nextHeight}px`;
        maxHeight = Math.max(minHeight, shell.getBoundingClientRect().height, getResizeContentFitHeight(shell));
        const expandedHeight = clamp(desiredHeight, minHeight, maxHeight);
        if (expandedHeight === nextHeight) break;
        nextHeight = expandedHeight;
      }

      state.resizeHeights[resizeKey] = nextHeight;
      shell.style.height = `${nextHeight}px`;
    };

    const onPointerMove = moveEvent => {
      currentClientY = moveEvent.clientY;
      syncHeightToPointer();
    };

    const onWheel = () => {
      userScrollExpectedUntil = performance.now() + 250;
    };

    const onResizeWheel = wheelEvent => {
      const beforeScrollY = window.scrollY;
      const wheelDelta = getWheelPixelDelta(wheelEvent);
      onWheel();

      requestAnimationFrame(() => {
        const actualScrollDelta = window.scrollY - beforeScrollY;
        const unconsumedDelta = wheelDelta - actualScrollDelta;
        const atScrollBoundary = wheelDelta > 0
          ? isScrolledToPageBottom()
          : isScrolledToPageTop();

        if (atScrollBoundary && Math.sign(unconsumedDelta) === Math.sign(wheelDelta)) {
          scrollDeltaForResize += unconsumedDelta;
          lastScrollY = window.scrollY;
          syncHeightToPointer();
        }
      });
    };

    const onScroll = () => {
      const nextScrollY = window.scrollY;
      const scrollDelta = nextScrollY - lastScrollY;
      lastScrollY = nextScrollY;

      if (performance.now() <= userScrollExpectedUntil) {
        scrollDeltaForResize += scrollDelta;
        syncHeightToPointer();
      }
    };

    const onPointerUp = () => {
      document.documentElement.style.overflowAnchor = previousOverflowAnchor;
      shell.classList.remove("is-resizing");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("wheel", onResizeWheel, true);
      window.removeEventListener("scroll", onScroll);
    };

    handle.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("wheel", onResizeWheel, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
  });
}


function getWheelPixelDelta(event) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}


function isScrolledToPageTop() {
  return window.scrollY <= 0;
}


function isScrolledToPageBottom() {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1;
}


function getResizeContentFitHeight(shell) {
  const scrollContainers = getResizeScrollContainers(shell);
  const currentHeight = shell.getBoundingClientRect().height;
  if (scrollContainers.length === 0) return currentHeight;

  const rowOverflowByTop = new Map();
  for (const node of scrollContainers) {
    const rowTop = Math.round(node.getBoundingClientRect().top);
    const overflow = node.scrollHeight - node.clientHeight;
    rowOverflowByTop.set(rowTop, Math.max(rowOverflowByTop.get(rowTop) || 0, overflow));
  }

  let fitHeight = currentHeight;
  for (const overflow of rowOverflowByTop.values()) {
    fitHeight += overflow;
  }

  return fitHeight;
}


function getResizeScrollContainers(shell) {
  return [...shell.querySelectorAll(".filter-values, .trade-filter-values, .target-breakdown-list, .target-sale-list, .rebalance-table-wrap, .table-wrap")];
}


function getResizeShellStyle(key) {
  const height = state.resizeHeights[key];
  return height === undefined ? "" : ` style="height:${formatPlainNumber(height)}px"`;
}
