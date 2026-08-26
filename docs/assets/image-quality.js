(() => {
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;
  let scanFrame = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function addQualityNotes(root = document) {
    root.querySelectorAll?.(".chart-section > p").forEach((paragraph) => {
      if (paragraph.dataset.qualityNote === "true") return;
      paragraph.dataset.qualityNote = "true";
      const note = document.createElement("span");
      note.className = "chart-quality-note";
      note.textContent = "Original image quality is preserved. Open a chart and select 100% for pixel-perfect detail.";
      paragraph.appendChild(note);
    });
  }

  function enhanceLightbox(lightbox) {
    if (!(lightbox instanceof HTMLElement) || lightbox.dataset.hqViewer === "true") return;
    const section = lightbox.querySelector(":scope > section");
    const header = section?.querySelector(":scope > header");
    const image = section?.querySelector(":scope > img");
    const closeButton = header?.querySelector("button");
    const fileName = header?.querySelector("strong")?.textContent?.trim() || image?.alt || "Chart screenshot";
    if (!section || !header || !image || !closeButton) return;

    lightbox.dataset.hqViewer = "true";
    section.classList.add("hq-viewer");
    header.classList.add("hq-viewer-header");

    const title = document.createElement("div");
    title.className = "hq-viewer-title";
    const titleText = header.querySelector("strong");
    if (titleText) title.appendChild(titleText);
    const dimensions = document.createElement("small");
    dimensions.textContent = "Loading original image…";
    title.appendChild(dimensions);
    header.prepend(title);

    const controls = document.createElement("div");
    controls.className = "hq-viewer-controls";
    controls.innerHTML = `
      <button class="hq-fit" type="button" title="Fit the entire image in the viewer">Fit</button>
      <button class="hq-actual" type="button" title="Show one image pixel per screen pixel">100%</button>
      <button class="hq-zoom-out" aria-label="Zoom out" type="button">−</button>
      <span class="hq-zoom-value" aria-live="polite">100%</span>
      <button class="hq-zoom-in" aria-label="Zoom in" type="button">+</button>
      <a class="hq-open-original" href="${image.currentSrc || image.src}" rel="noopener noreferrer" target="_blank" title="Open the untouched original image in a new tab">Original</a>
    `;
    closeButton.classList.add("hq-close");
    closeButton.title = "Close chart viewer";
    controls.appendChild(closeButton);
    header.appendChild(controls);

    const stage = document.createElement("div");
    stage.className = "hq-image-stage";
    stage.tabIndex = 0;
    image.parentNode.insertBefore(stage, image);
    stage.appendChild(image);
    image.draggable = false;
    image.decoding = "async";

    let scale = 1;
    let fitted = true;
    const zoomValue = controls.querySelector(".hq-zoom-value");
    const originalLink = controls.querySelector(".hq-open-original");

    function renderScale(nextScale, preserveCenter = true) {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const oldScale = scale || 1;
      const centerX = (stage.scrollLeft + stage.clientWidth / 2) / oldScale;
      const centerY = (stage.scrollTop + stage.clientHeight / 2) / oldScale;
      scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      image.style.width = `${Math.max(1, Math.round(image.naturalWidth * scale))}px`;
      image.style.height = `${Math.max(1, Math.round(image.naturalHeight * scale))}px`;
      zoomValue.textContent = `${Math.round(scale * 100)}%`;
      if (preserveCenter) {
        requestAnimationFrame(() => {
          stage.scrollLeft = Math.max(0, centerX * scale - stage.clientWidth / 2);
          stage.scrollTop = Math.max(0, centerY * scale - stage.clientHeight / 2);
        });
      } else {
        requestAnimationFrame(() => stage.scrollTo({ left: 0, top: 0 }));
      }
    }

    function fitImage() {
      if (!image.naturalWidth || !image.naturalHeight) return;
      const availableWidth = Math.max(1, stage.clientWidth - 28);
      const availableHeight = Math.max(1, stage.clientHeight - 28);
      fitted = true;
      renderScale(Math.min(1, availableWidth / image.naturalWidth, availableHeight / image.naturalHeight), false);
    }

    function showActualSize() {
      fitted = false;
      renderScale(1, false);
    }

    function zoom(factor) {
      fitted = false;
      renderScale(scale * factor);
    }

    function imageReady() {
      dimensions.textContent = `${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px • original file`;
      originalLink.href = image.currentSrc || image.src;
      requestAnimationFrame(fitImage);
    }

    controls.querySelector(".hq-fit")?.addEventListener("click", fitImage);
    controls.querySelector(".hq-actual")?.addEventListener("click", showActualSize);
    controls.querySelector(".hq-zoom-out")?.addEventListener("click", () => zoom(0.8));
    controls.querySelector(".hq-zoom-in")?.addEventListener("click", () => zoom(1.25));
    image.addEventListener("dblclick", () => fitted ? showActualSize() : fitImage());
    stage.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    lightbox.addEventListener("keydown", (event) => {
      if (event.key === "+" || event.key === "=") zoom(1.25);
      if (event.key === "-") zoom(0.8);
      if (event.key === "0") showActualSize();
      if (event.key.toLowerCase() === "f") fitImage();
    });

    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(() => {
      if (fitted) fitImage();
    }) : null;
    resizeObserver?.observe(stage);
    lightbox.addEventListener("DOMNodeRemoved", () => resizeObserver?.disconnect(), { once: true });

    if (image.complete && image.naturalWidth) imageReady();
    else image.addEventListener("load", imageReady, { once: true });
  }

  function scan(root = document) {
    addQualityNotes(root);
    if (root instanceof HTMLElement && root.matches(".chart-lightbox")) enhanceLightbox(root);
    root.querySelectorAll?.(".chart-lightbox").forEach(enhanceLightbox);
  }

  function scheduleScan(root = document) {
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      scan(root);
    });
  }

  const observer = new MutationObserver((mutations) => {
    const added = mutations.flatMap((mutation) => Array.from(mutation.addedNodes));
    const root = added.find((node) => node instanceof HTMLElement) || document;
    scheduleScan(root);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scan();
      observer.observe(document.body, { childList: true, subtree: true });
    }, { once: true });
  } else {
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();

