(() => {
  const VIEW = "daily-analysis";
  const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const maxFileSize = 8 * 1024 * 1024;
  const today = () => new Date().toISOString().slice(0, 10);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
  const dateLabel = (value, weekday = true) => new Intl.DateTimeFormat("en-US", {
    ...(weekday ? { weekday: "long" } : {}), month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  const compactDate = (value) => new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
  const analysisIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.75" y="4.25" width="16.5" height="15.5" rx="3"/><path d="m6.75 16 3.4-3.5 2.65 2.35 2.15-2.1 2.3 2.45"/><circle cx="15.85" cy="8.65" r="1.35"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 7.25h14.5M9 7.25V4.8h6v2.45M7 7.25l.7 12h8.6l.7-12M10 10.75v5M14 10.75v5"/></svg>';
  let currentView = "";
  let entries = [];
  let loading = false;
  let filter = "";
  let calendarSummaries = new Map();
  let calendarLoading = false;
  let calendarUserId = "";
  let entriesLoadedAt = 0;
  let authListenerInstalled = false;

  const client = () => window.greensJournalSupabase;

  function deactivate() {
    currentView = "";
    const workspace = document.querySelector(".workspace");
    workspace?.classList.remove("daily-analysis-active");
    workspace?.querySelector(".daily-analysis-page")?.remove();
    document.querySelectorAll(".daily-analysis-nav-button").forEach((button) => button.classList.remove("active"));
  }

  function installNavigation() {
    const nav = document.querySelector('.sidebar nav[aria-label="Dashboard navigation"]');
    if (!nav) return false;
    nav.querySelectorAll("button:not(.daily-analysis-nav-button)").forEach((button) => {
      if (button.dataset.analysisExitBound) return;
      button.dataset.analysisExitBound = "true";
      button.addEventListener("click", deactivate, { capture: true });
    });
    if (!nav.querySelector(".daily-analysis-nav-button")) {
      const button = document.createElement("button");
      button.className = "daily-analysis-nav-button";
      button.type = "button";
      button.title = "Daily Analysis";
      button.innerHTML = `<span data-premium-icon="true">${analysisIcon}</span> Daily analysis`;
      button.addEventListener("click", () => showAnalysis(false));
      nav.insertBefore(button, nav.querySelector(".mobile-signout") || null);
    }
    if (currentView === VIEW) nav.querySelector(".daily-analysis-nav-button")?.classList.add("active");
    return true;
  }

  function installCalendarAction() {
    const topbar = document.querySelector(".topbar");
    const title = topbar?.querySelector("h1")?.textContent?.toLowerCase() || "";
    const actions = topbar?.querySelector(".topbar-actions");
    document.querySelectorAll(".analysis-quick-add").forEach((button) => {
      if (!title.includes("calendar") || !actions?.contains(button)) button.remove();
    });
    if (!actions || !title.includes("calendar") || actions.querySelector(".analysis-quick-add")) return;
    const button = document.createElement("button");
    button.className = "analysis-quick-add";
    button.type = "button";
    button.innerHTML = `${analysisIcon}<span>Chart analysis</span>`;
    button.addEventListener("click", () => showAnalysis(true));
    const logButton = actions.querySelector(".log-button");
    actions.insertBefore(button, logButton || null);
  }

  async function ensureCalendarSummaries() {
    const title = document.querySelector(".topbar h1")?.textContent?.toLowerCase() || "";
    if (!title.includes("calendar") || !client() || calendarLoading) return;
    if (calendarUserId) {
      markCalendarDays();
      return;
    }
    calendarLoading = true;
    try {
      const { data: authData } = await client().auth.getSession();
      const user = authData?.session?.user;
      if (!user) return;
      const { data, error } = await client()
        .from("daily_analyses")
        .select("id, analysis_date, title, market_bias, notes")
        .order("analysis_date", { ascending: false });
      if (error) throw error;
      calendarUserId = user.id;
      setCalendarSummaries(data || []);
    } catch (error) {
      console.error("Unable to show daily analysis on the calendar.", error);
    } finally {
      calendarLoading = false;
    }
  }

  function setCalendarSummaries(rows) {
    calendarSummaries = new Map(rows.map((row) => [row.analysis_date, row]));
    markCalendarDays();
  }

  function markCalendarDays() {
    const monthLabel = document.querySelector(".calendar-toolbar h2")?.textContent?.trim();
    const cells = Array.from(document.querySelectorAll(".calendar-grid .day-cell"));
    if (!monthLabel || !cells.length) return;
    const monthParts = monthLabel.match(/^([A-Za-z]+)\s+(\d{4})$/);
    if (!monthParts) return;
    const year = Number(monthParts[2]);
    const month = new Date(`${monthParts[1]} 1, 2000 12:00:00 UTC`).getUTCMonth();
    if (!Number.isFinite(year) || Number.isNaN(month)) return;
    const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const firstCellTime = Date.UTC(year, month, 1 - firstWeekday);
    cells.forEach((cell, index) => {
      const date = new Date(firstCellTime + index * 86400000).toISOString().slice(0, 10);
      const summary = calendarSummaries.get(date);
      cell.dataset.analysisDate = date;
      cell.classList.toggle("has-daily-analysis", Boolean(summary));
      let marker = cell.querySelector(":scope > .calendar-analysis-indicator");
      if (summary && !marker) {
        marker = document.createElement("div");
        marker.className = "calendar-analysis-indicator";
        marker.innerHTML = `${analysisIcon}<span>Analysis</span>`;
        marker.setAttribute("aria-label", "Daily chart analysis saved");
        cell.appendChild(marker);
      } else if (!summary) {
        marker?.remove();
      }
      if (!cell.dataset.analysisClickBound) {
        cell.dataset.analysisClickBound = "true";
        cell.addEventListener("click", () => window.setTimeout(renderSelectedCalendarAnalysis, 0));
      }
    });
    renderSelectedCalendarAnalysis();
  }

  function renderSelectedCalendarAnalysis() {
    const selected = document.querySelector(".calendar-grid .day-cell.selected");
    const summary = selected ? calendarSummaries.get(selected.dataset.analysisDate) : null;
    const dayPanel = document.querySelector(".day-panel");
    const existing = document.querySelector(".calendar-analysis-card");
    if (!summary || !dayPanel) {
      existing?.remove();
      return;
    }
    if (existing?.dataset.analysisDate === summary.analysis_date) return;
    existing?.remove();
    const card = document.createElement("article");
    card.className = "calendar-analysis-card";
    card.dataset.analysisDate = summary.analysis_date;
    card.innerHTML = `<header><div>${analysisIcon}</div><span><small>DAILY ANALYSIS</small><strong>${escapeHtml(summary.title || "Daily market review")}</strong></span><b class="${escapeHtml((summary.market_bias || "Neutral").toLowerCase())}">${escapeHtml(summary.market_bias || "Neutral")}</b></header>${summary.notes ? `<p>${escapeHtml(summary.notes)}</p>` : ""}<button type="button">Open charts and notes</button>`;
    card.querySelector("button")?.addEventListener("click", async () => {
      await showAnalysis(false);
      const entry = entries.find((item) => item.id === summary.id);
      if (entry) openFormModal(entry);
    });
    const dayTrades = dayPanel.querySelector(".day-trades");
    dayPanel.insertBefore(card, dayTrades || null);
  }

  async function showAnalysis(openForm) {
    currentView = VIEW;
    document.querySelectorAll(".sidebar nav button").forEach((button) => button.classList.toggle("active", button.classList.contains("daily-analysis-nav-button")));
    renderPage();
    await loadEntries(false);
    if (openForm && currentView === VIEW) openFormModal();
  }

  async function loadEntries(force = false) {
    const supabase = client();
    if (!supabase || loading) return;
    if (!force && entriesLoadedAt && Date.now() - entriesLoadedAt < 120000) {
      renderPage();
      return;
    }
    loading = true;
    renderPage();
    try {
      const { data: analysisRows, error: analysisError } = await supabase
        .from("daily_analyses")
        .select("id, analysis_date, title, market_bias, notes, created_at, updated_at")
        .order("analysis_date", { ascending: false })
        .order("id", { ascending: false });
      if (analysisError) throw analysisError;
      const rows = analysisRows || [];
      setCalendarSummaries(rows);
      if (!rows.length) {
        entries = [];
        entriesLoadedAt = Date.now();
        return;
      }
      const { data: chartRows, error: chartError } = await supabase
        .from("analysis_charts")
        .select("id, analysis_id, storage_path, file_name, created_at")
        .in("analysis_id", rows.map((row) => row.id))
        .order("created_at");
      if (chartError) throw chartError;
      const charts = chartRows || [];
      const { data: signedRows, error: signedError } = charts.length
        ? await supabase.storage.from("analysis-charts").createSignedUrls(charts.map((chart) => chart.storage_path), 3600)
        : { data: [], error: null };
      if (signedError) throw signedError;
      const hydratedCharts = charts.map((chart, index) => ({ ...chart, signedUrl: signedRows?.[index]?.signedUrl || "" }));
      entries = rows.map((row) => ({
        ...row,
        charts: hydratedCharts.filter((chart) => chart.analysis_id === row.id),
      }));
      entriesLoadedAt = Date.now();
    } catch (error) {
      showToast(error?.message || "Unable to load daily analysis.", true);
    } finally {
      loading = false;
      if (currentView === VIEW) renderPage();
    }
  }

  function renderPage() {
    const workspace = document.querySelector(".workspace");
    if (!workspace || currentView !== VIEW) return;
    workspace.classList.add("daily-analysis-active");
    let page = workspace.querySelector(".daily-analysis-page");
    if (!page) {
      page = document.createElement("section");
      page.className = "daily-analysis-page";
      workspace.appendChild(page);
    }
    const visibleEntries = filter
      ? entries.filter((entry) => entry.analysis_date.startsWith(filter))
      : entries;
    const chartCount = entries.reduce((total, entry) => total + entry.charts.length, 0);
    const activeDays = new Set(entries.map((entry) => entry.analysis_date)).size;
    page.innerHTML = `
      <header class="daily-analysis-topbar">
        <div><p>TRADING JOURNAL</p><h1>Daily analysis</h1></div>
        <div class="topbar-actions"><button class="log-button add-analysis-button" type="button">+ Add analysis</button></div>
      </header>
      <div class="daily-analysis-content">
        <section class="analysis-hero">
          <div class="analysis-hero-icon">${analysisIcon}</div>
          <div><p>CHART WORKSPACE</p><h2>Study the market even when you do not trade.</h2><span>Save screenshots, market bias, and observations without creating a trade entry.</span></div>
          <button type="button">+ Upload today’s charts</button>
        </section>
        <section class="analysis-summary" aria-label="Daily analysis summary">
          <article><span>Analysis days</span><strong>${activeDays}</strong><small>Days reviewed without requiring a trade</small></article>
          <article><span>Saved charts</span><strong>${chartCount}</strong><small>Private chart screenshots</small></article>
          <article><span>Most recent</span><strong>${entries[0] ? compactDate(entries[0].analysis_date) : "—"}</strong><small>${entries[0] ? escapeHtml(entries[0].title || "Daily market review") : "No analysis saved yet"}</small></article>
        </section>
        <section class="analysis-list-heading">
          <div><p>ANALYSIS ARCHIVE</p><h2>Your chart reviews</h2></div>
          <div><input aria-label="Filter daily analysis by month" class="analysis-month-filter" type="month" value="${filter}"><button class="analysis-refresh" type="button" ${loading ? "disabled" : ""}>${loading ? "Updating…" : "↻ Refresh"}</button></div>
        </section>
        <section class="analysis-entry-list">${loading && !entries.length ? '<div class="analysis-loading">Loading your chart analysis…</div>' : visibleEntries.length ? visibleEntries.map(renderEntry).join("") : renderEmpty(Boolean(filter))}</section>
      </div>`;
    page.querySelector(".add-analysis-button")?.addEventListener("click", () => openFormModal());
    page.querySelector(".analysis-hero button")?.addEventListener("click", () => openFormModal());
    page.querySelector(".analysis-empty button")?.addEventListener("click", () => filter ? setFilter("") : openFormModal());
    page.querySelector(".analysis-refresh")?.addEventListener("click", () => loadEntries(true));
    page.querySelector(".analysis-month-filter")?.addEventListener("change", (event) => setFilter(event.target.value));
    page.querySelectorAll("[data-edit-analysis]").forEach((button) => button.addEventListener("click", () => openFormModal(entries.find((entry) => String(entry.id) === button.dataset.editAnalysis))));
    page.querySelectorAll("[data-delete-analysis]").forEach((button) => button.addEventListener("click", () => deleteEntry(button.dataset.deleteAnalysis)));
    page.querySelectorAll("[data-open-chart]").forEach((button) => button.addEventListener("click", () => {
      const entry = entries.find((item) => String(item.id) === button.dataset.entryId);
      const chart = entry?.charts.find((item) => String(item.id) === button.dataset.openChart);
      if (chart) openLightbox(chart);
    }));
  }

  function setFilter(value) {
    filter = value;
    renderPage();
  }

  function renderEntry(entry) {
    const title = entry.title || "Daily market review";
    const bias = entry.market_bias || "Watching";
    return `<article class="analysis-entry">
      <header><div><span>${dateLabel(entry.analysis_date)}</span><h3>${escapeHtml(title)}</h3></div><span class="analysis-bias ${escapeHtml(bias.toLowerCase())}">${escapeHtml(bias)}</span></header>
      ${entry.notes ? `<p class="analysis-notes">${escapeHtml(entry.notes)}</p>` : ""}
      <div class="analysis-chart-grid">${entry.charts.length ? entry.charts.map((chart) => `<button data-entry-id="${entry.id}" data-open-chart="${chart.id}" type="button"><img alt="${escapeHtml(chart.file_name)}" loading="lazy" src="${escapeHtml(chart.signedUrl)}"><span>${escapeHtml(chart.file_name)}</span></button>`).join("") : '<div class="analysis-no-chart">No screenshots attached</div>'}</div>
      <footer><span>${entry.charts.length} chart${entry.charts.length === 1 ? "" : "s"}</span><div><button class="analysis-edit" data-edit-analysis="${entry.id}" type="button">Edit</button><button class="premium-delete" data-delete-analysis="${entry.id}" aria-label="Delete daily analysis" title="Delete" type="button">${trashIcon}</button></div></footer>
    </article>`;
  }

  function renderEmpty(filtered) {
    return `<article class="analysis-empty"><div>${analysisIcon}</div><h3>${filtered ? "No reviews in this month" : "Save your first chart analysis"}</h3><p>${filtered ? "Clear the month filter to see your other reviews." : "Upload screenshots and write down what you noticed, even when you decided not to take a trade."}</p><button class="log-button" type="button">${filtered ? "Show all reviews" : "+ Add daily analysis"}</button></article>`;
  }

  function openFormModal(entry = null) {
    document.querySelector(".analysis-modal-backdrop")?.remove();
    const modal = document.createElement("div");
    modal.className = "modal-backdrop analysis-modal-backdrop";
    modal.innerHTML = `<section class="trade-modal analysis-modal" role="dialog" aria-modal="true" aria-labelledby="analysis-form-title">
      <header><div><p>DAILY CHART REVIEW</p><h2 id="analysis-form-title">${entry ? "Edit daily analysis" : "Add daily analysis"}</h2></div><button class="analysis-modal-close" aria-label="Close daily analysis form" type="button">×</button></header>
      <form>
        <div class="form-section"><h3>Review details</h3><div class="form-grid two"><label>Date<input name="analysis_date" required type="date" value="${entry?.analysis_date || today()}"></label><label>Market bias<select name="market_bias"><option ${entry?.market_bias === "Bullish" ? "selected" : ""}>Bullish</option><option ${entry?.market_bias === "Bearish" ? "selected" : ""}>Bearish</option><option ${!entry?.market_bias || entry?.market_bias === "Neutral" ? "selected" : ""}>Neutral</option><option ${entry?.market_bias === "Watching" ? "selected" : ""}>Watching</option></select></label></div><label>Title<input name="title" maxlength="100" placeholder="Morning market analysis" value="${escapeHtml(entry?.title || "")}"></label><label>Analysis notes<textarea name="notes" placeholder="What did you see? What levels mattered? Why did you decide to trade or stay out?">${escapeHtml(entry?.notes || "")}</textarea></label></div>
        <div class="form-section chart-section"><h3>Chart screenshots</h3><p>Upload multiple PNG, JPG, WebP, or GIF images. Maximum 8 MB per image.</p><label class="chart-upload"><input accept="image/png,image/jpeg,image/webp,image/gif" multiple type="file"><span>＋ Choose chart images</span></label><div class="analysis-pending-files"></div>${entry?.charts.length ? `<div class="analysis-existing-charts">${entry.charts.map((chart) => `<article data-existing-chart="${chart.id}"><button data-preview-existing="${chart.id}" type="button"><img alt="${escapeHtml(chart.file_name)}" src="${escapeHtml(chart.signedUrl)}"></button><small>${escapeHtml(chart.file_name)}</small><button class="remove-analysis-chart" data-remove-chart="${chart.id}" type="button">Remove</button></article>`).join("")}</div>` : ""}</div>
        <div class="analysis-form-error" role="alert"></div>
        <footer><button class="cancel-button" type="button">Cancel</button><button class="save-button" type="submit">${entry ? "Save changes" : "Save analysis"}</button></footer>
      </form>
    </section>`;
    document.body.appendChild(modal);
    let pendingFiles = [];
    const close = () => modal.remove();
    const renderPending = () => {
      const holder = modal.querySelector(".analysis-pending-files");
      holder.innerHTML = pendingFiles.map((file, index) => `<span><small>${escapeHtml(file.name)}</small><button data-remove-pending="${index}" aria-label="Remove ${escapeHtml(file.name)}" type="button">×</button></span>`).join("");
      holder.querySelectorAll("[data-remove-pending]").forEach((button) => button.addEventListener("click", () => {
        pendingFiles = pendingFiles.filter((_, index) => index !== Number(button.dataset.removePending));
        renderPending();
      }));
    };
    modal.addEventListener("mousedown", (event) => { if (event.target === modal) close(); });
    modal.querySelector(".analysis-modal-close")?.addEventListener("click", close);
    modal.querySelector(".cancel-button")?.addEventListener("click", close);
    modal.querySelector('input[type="file"]')?.addEventListener("change", (event) => {
      pendingFiles = [...pendingFiles, ...Array.from(event.target.files || [])];
      event.target.value = "";
      renderPending();
    });
    modal.querySelectorAll("[data-preview-existing]").forEach((button) => button.addEventListener("click", () => {
      const chart = entry.charts.find((item) => String(item.id) === button.dataset.previewExisting);
      if (chart) openLightbox(chart);
    }));
    modal.querySelectorAll("[data-remove-chart]").forEach((button) => button.addEventListener("click", async () => {
      const chart = entry.charts.find((item) => String(item.id) === button.dataset.removeChart);
      if (!chart || !window.confirm("Remove this chart screenshot?")) return;
      button.disabled = true;
      const storageResult = await client().storage.from("analysis-charts").remove([chart.storage_path]);
      if (storageResult.error) return showFormError(modal, storageResult.error.message);
      const { error } = await client().from("analysis_charts").delete().eq("id", chart.id);
      if (error) return showFormError(modal, error.message);
      entry.charts = entry.charts.filter((item) => item.id !== chart.id);
      modal.querySelector(`[data-existing-chart="${chart.id}"]`)?.remove();
      showToast("Chart removed");
    }));
    modal.querySelector("form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        analysis_date: String(form.get("analysis_date")),
        title: String(form.get("title") || "").trim(),
        market_bias: String(form.get("market_bias") || "Neutral"),
        notes: String(form.get("notes") || "").trim(),
        updated_at: new Date().toISOString(),
      };
      if (!entry && !pendingFiles.length && !payload.notes && !payload.title) return showFormError(modal, "Add at least one chart screenshot or an analysis note.");
      for (const file of pendingFiles) {
        if (!allowedTypes.has(file.type)) return showFormError(modal, `${file.name} is not a supported image.`);
        if (file.size > maxFileSize) return showFormError(modal, `${file.name} is larger than 8 MB.`);
      }
      const save = modal.querySelector(".save-button");
      save.disabled = true;
      save.textContent = "Saving…";
      try {
        let savedEntry;
        if (entry) {
          const { data, error } = await client().from("daily_analyses").update(payload).eq("id", entry.id).select("id, analysis_date, title, market_bias, notes, created_at, updated_at").single();
          if (error) throw error;
          savedEntry = { ...data, charts: entry.charts };
        } else {
          const { data, error } = await client().from("daily_analyses").insert(payload).select("id, analysis_date, title, market_bias, notes, created_at, updated_at").single();
          if (error) throw error;
          savedEntry = { ...data, charts: [] };
        }
        if (pendingFiles.length) {
          const { data: authData, error: authError } = await client().auth.getUser();
          if (authError || !authData.user) throw authError || new Error("Please sign in again before uploading charts.");
          for (const file of pendingFiles) {
            const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "png";
            const path = `${authData.user.id}/${savedEntry.id}/${crypto.randomUUID()}.${extension}`;
            const upload = await client().storage.from("analysis-charts").upload(path, file, { contentType: file.type, upsert: false });
            if (upload.error) throw upload.error;
            const record = await client().from("analysis_charts").insert({ analysis_id: savedEntry.id, storage_path: path, file_name: file.name });
            if (record.error) {
              await client().storage.from("analysis-charts").remove([path]);
              throw record.error;
            }
          }
        }
        close();
        showToast(entry ? "Daily analysis updated" : "Daily analysis saved");
        await loadEntries(true);
      } catch (error) {
        const message = error?.code === "23505"
          ? "A daily analysis already exists for this date. Open that entry and select Edit to add more charts."
          : error?.message || "Unable to save daily analysis.";
        showFormError(modal, message);
        save.disabled = false;
        save.textContent = entry ? "Save changes" : "Save analysis";
      }
    });
  }

  function showFormError(modal, message) {
    const box = modal.querySelector(".analysis-form-error");
    box.textContent = message;
  }

  async function deleteEntry(id) {
    const entry = entries.find((item) => String(item.id) === String(id));
    if (!entry || !window.confirm("Delete this daily analysis and all of its chart screenshots?")) return;
    if (entry.charts.length) {
      const storageResult = await client().storage.from("analysis-charts").remove(entry.charts.map((chart) => chart.storage_path));
      if (storageResult.error) return showToast(storageResult.error.message, true);
    }
    const { error } = await client().from("daily_analyses").delete().eq("id", entry.id);
    if (error) return showToast(error.message, true);
    entries = entries.filter((item) => item.id !== entry.id);
    calendarSummaries.delete(entry.analysis_date);
    markCalendarDays();
    showToast("Daily analysis deleted");
    renderPage();
  }

  function openLightbox(chart) {
    document.querySelector(".analysis-lightbox")?.remove();
    const lightbox = document.createElement("div");
    lightbox.className = "chart-lightbox analysis-lightbox";
    lightbox.innerHTML = `<section role="dialog" aria-modal="true" aria-label="Chart preview"><header><strong>${escapeHtml(chart.file_name)}</strong><button aria-label="Close chart preview" type="button">×</button></header><img alt="${escapeHtml(chart.file_name)}" src="${escapeHtml(chart.signedUrl)}"></section>`;
    document.body.appendChild(lightbox);
    const close = () => lightbox.remove();
    lightbox.addEventListener("mousedown", (event) => { if (event.target === lightbox) close(); });
    lightbox.querySelector("header button")?.addEventListener("click", close);
  }

  function showToast(message, isError = false) {
    document.querySelector(".analysis-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `analysis-toast${isError ? " error" : ""}`;
    toast.innerHTML = `<span>${isError ? "!" : "✓"}</span><div><strong>${escapeHtml(message)}</strong><small>${isError ? "Please try again." : "Your journal is up to date."}</small></div>`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function syncInterface() {
    installNavigation();
    installCalendarAction();
    if (!authListenerInstalled && client()) {
      authListenerInstalled = true;
      client().auth.onAuthStateChange((_event, session) => {
        const nextUserId = session?.user?.id || "";
        if (nextUserId !== calendarUserId) {
          calendarUserId = "";
          calendarSummaries = new Map();
          entries = [];
          entriesLoadedAt = 0;
        }
      });
    }
    ensureCalendarSummaries();
    markCalendarDays();
    if (currentView === VIEW && !document.querySelector(".daily-analysis-page")) renderPage();
  }
  let observerQueued = false;
  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    window.requestAnimationFrame(() => {
      observerQueued = false;
      syncInterface();
    });
  });
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  syncInterface();
})();
