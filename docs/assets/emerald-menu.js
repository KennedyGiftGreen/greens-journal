(() => {
  const storageKey = "greens-journal-menu-collapsed";
  const logoSource = "/greens-journal/assets/greens-journal-logo.jpeg";

  function createLogoFrame(className) {
    const frame = document.createElement("span");
    frame.className = `brand-logo-frame ${className}`;
    const image = document.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.src = logoSource;
    frame.appendChild(image);
    return frame;
  }

  function installBrandLogos() {
    document.querySelectorAll(".auth-brand:not([data-custom-logo])").forEach((brand) => {
      brand.dataset.customLogo = "true";
      brand.replaceChildren(createLogoFrame("auth-brand-logo"));
    });
    document.querySelectorAll(".app-logo:not([data-custom-logo])").forEach((brand) => {
      brand.dataset.customLogo = "true";
      brand.replaceChildren(createLogoFrame("sidebar-brand-logo"));
    });
  }

  function initializeMenu() {
    installBrandLogos();
    const shell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".sidebar");
    const appLogo = sidebar?.querySelector(".app-logo");

    if (!shell || !sidebar || sidebar.querySelector(".sidebar-collapse-toggle")) {
      return Boolean(shell && sidebar);
    }

    const header = document.createElement("div");
    header.className = "sidebar-head";
    sidebar.insertBefore(header, sidebar.firstChild);
    if (appLogo) header.appendChild(appLogo);

    const toggle = document.createElement("button");
    toggle.className = "sidebar-collapse-toggle";
    toggle.type = "button";
    header.appendChild(toggle);

    sidebar.querySelectorAll("nav button").forEach((button) => {
      const label = button.textContent?.trim().replace(/\s+/g, " ");
      if (label) button.setAttribute("title", label);
    });

    const applyState = (collapsed) => {
      shell.classList.toggle("menu-collapsed", collapsed);
      toggle.textContent = collapsed ? "›" : "‹";
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", collapsed ? "Open navigation menu" : "Close navigation menu");
      toggle.setAttribute("title", collapsed ? "Open menu" : "Close menu");
      window.localStorage.setItem(storageKey, String(collapsed));
    };

    applyState(window.localStorage.getItem(storageKey) === "true");
    toggle.addEventListener("click", () => {
      applyState(!shell.classList.contains("menu-collapsed"));
    });
    return true;
  }

  if (!initializeMenu()) {
    const observer = new MutationObserver(() => {
      if (initializeMenu()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const brandObserver = new MutationObserver(installBrandLogos);
  brandObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
