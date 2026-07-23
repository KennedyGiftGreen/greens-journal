(() => {
  const storageKey = "greens-journal-menu-collapsed";

  function initializeMenu() {
    const shell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".sidebar");
    const appLogo = sidebar?.querySelector(".app-logo");

    if (!shell || !sidebar || sidebar.querySelector(".sidebar-collapse-toggle")) {
      return Boolean(shell && sidebar);
    }

    document.querySelectorAll(".logo-mark").forEach((logo) => logo.remove());

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
})();
