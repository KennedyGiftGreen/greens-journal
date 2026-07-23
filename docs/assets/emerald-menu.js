(() => {
  const storageKey = "greens-journal-menu-collapsed";
  const icons = {
    calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 3.75v3M16.5 3.75v3M4.25 9h15.5"/><rect x="4.25" y="5.25" width="15.5" height="15" rx="3"/><path d="M8 12.5h.01M12 12.5h.01M16 12.5h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01"/></svg>',
    "trade log": '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.25" y="3.75" width="15.5" height="16.5" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.25V5.5M4 19.25h16"/><path d="m7.25 15 3.35-3.35 2.75 2.15 4.9-6.05"/><path d="M15.25 7.75h3v3"/></svg>',
    capital: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="6.25" width="16.5" height="12.5" rx="3"/><path d="M3.75 10.25h16.5M7.5 14.5h3.25"/></svg>',
    "sign out": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H7.25A2.25 2.25 0 0 0 5 7.25v9.5A2.25 2.25 0 0 0 7.25 19H10M14.5 8l4 4-4 4M9 12h9"/></svg>'
  };

  function installPremiumIcons(sidebar) {
    sidebar.querySelectorAll("nav button").forEach((button) => {
      const label = button.textContent?.trim().replace(/\s+/g, " ").toLowerCase();
      const icon = Object.entries(icons).find(([name]) => label?.includes(name))?.[1];
      const slot = button.querySelector(":scope > span");
      if (icon && slot && !slot.dataset.premiumIcon) {
        slot.dataset.premiumIcon = "true";
        slot.innerHTML = icon;
      }
    });
  }

  function initializeMenu() {
    const shell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".sidebar");
    const appLogo = sidebar?.querySelector(".app-logo");

    if (!shell || !sidebar || sidebar.querySelector(".sidebar-collapse-toggle")) {
      return Boolean(shell && sidebar);
    }

    installPremiumIcons(sidebar);

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
