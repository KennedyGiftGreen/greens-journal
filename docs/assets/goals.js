(() => {
  const GOALS_VIEW = "goals";
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (value) => new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
  const dateLabel = (value) => value
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`))
    : "No deadline";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[char]);
  const goalIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25"/><circle cx="12" cy="12" r="4.25"/><path d="M12 3.75V1.9M20.25 12h1.85M12 20.25v1.85M3.75 12H1.9"/><circle cx="12" cy="12" r=".75"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z"/></svg>';
  const sunIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.75"/><path d="M12 2.75v2M12 19.25v2M21.25 12h-2M4.75 12h-2M18.55 5.45l-1.4 1.4M6.85 17.15l-1.4 1.4M18.55 18.55l-1.4-1.4M6.85 6.85l-1.4-1.4"/></svg>';
  let currentView = "";
  let goals = [];
  let trades = [];
  let latestBalance = null;
  let loading = false;

  const client = () => window.greensJournalSupabase;

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("greens-journal-theme", theme);
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      const dark = theme === "dark";
      button.innerHTML = dark ? sunIcon : moonIcon;
      button.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      button.setAttribute("title", dark ? "Light mode" : "Dark mode");
    });
  }

  function deactivateGoals() {
    currentView = "";
    const workspace = document.querySelector(".workspace");
    workspace?.classList.remove("goals-active");
    workspace?.querySelector(".goals-page")?.remove();
    document.querySelectorAll(".goals-nav-button").forEach((button) => button.classList.remove("active"));
  }

  function installNavigation() {
    const sidebar = document.querySelector(".sidebar");
    const nav = sidebar?.querySelector('nav[aria-label="Dashboard navigation"]');
    if (!nav) return false;

    nav.querySelectorAll("button:not(.goals-nav-button)").forEach((button) => {
      if (button.dataset.goalsExitBound) return;
      button.dataset.goalsExitBound = "true";
      button.addEventListener("click", deactivateGoals, { capture: true });
    });

    if (!nav.querySelector(".goals-nav-button")) {
      const button = document.createElement("button");
      button.className = "goals-nav-button";
      button.type = "button";
      button.title = "Goals";
      button.innerHTML = `<span data-premium-icon="true">${goalIcon}</span> Goals`;
      button.addEventListener("click", showGoals);
      const signOut = nav.querySelector(".mobile-signout");
      nav.insertBefore(button, signOut || null);
    }
    if (currentView === GOALS_VIEW) nav.querySelector(".goals-nav-button")?.classList.add("active");
    return true;
  }

  async function loadGoalsData() {
    const supabase = client();
    if (!supabase || loading) return;
    loading = true;
    renderGoalsPage();
    try {
      const [goalResult, tradeResult, balanceResult] = await Promise.all([
        supabase.from("goals").select("id, name, goal_type, target_amount, start_date, target_date, created_at").order("created_at", { ascending: false }),
        supabase.from("trades").select("trade_date, pnl, fees").order("trade_date"),
        supabase.from("account_balance_snapshots").select("balance, balance_date").order("balance_date", { ascending: false }).order("id", { ascending: false }).limit(1),
      ]);
      if (goalResult.error) throw goalResult.error;
      if (tradeResult.error) throw tradeResult.error;
      if (balanceResult.error) throw balanceResult.error;
      goals = goalResult.data || [];
      trades = tradeResult.data || [];
      latestBalance = balanceResult.data?.[0] || null;
    } catch (error) {
      showMessage(error?.message || "Unable to load goals.", true);
    } finally {
      loading = false;
      if (currentView === GOALS_VIEW) renderGoalsPage();
    }
  }

  function goalProgress(goal) {
    const target = Number(goal.target_amount) || 0;
    const current = goal.goal_type === "balance"
      ? Number(latestBalance?.balance || 0)
      : trades
        .filter((trade) => !goal.start_date || trade.trade_date >= goal.start_date)
        .reduce((sum, trade) => sum + Number(trade.pnl || 0) - Number(trade.fees || 0), 0);
    const percent = target > 0 ? Math.max(0, Math.min(100, current / target * 100)) : 0;
    const remaining = Math.max(0, target - current);
    const targetTime = goal.target_date ? new Date(`${goal.target_date}T00:00:00Z`).getTime() : null;
    const startTime = new Date(`${goal.start_date || goal.created_at?.slice(0, 10) || today()}T00:00:00Z`).getTime();
    const nowTime = new Date(`${today()}T00:00:00Z`).getTime();
    const daysLeft = targetTime === null ? null : Math.max(0, Math.ceil((targetTime - nowTime) / 86400000));
    let status = "In progress";
    let statusClass = "active";
    if (current >= target && target > 0) {
      status = "Goal reached";
      statusClass = "reached";
    } else if (targetTime !== null && targetTime < nowTime) {
      status = "Deadline passed";
      statusClass = "behind";
    } else if (targetTime !== null && targetTime > startTime) {
      const elapsed = Math.max(0, Math.min(1, (nowTime - startTime) / (targetTime - startTime)));
      status = percent / 100 + 0.03 >= elapsed ? "On track" : "Behind pace";
      statusClass = status === "On track" ? "on-track" : "behind";
    }
    return { current, target, percent, remaining, daysLeft, status, statusClass };
  }

  function renderGoalsPage() {
    const workspace = document.querySelector(".workspace");
    if (!workspace || currentView !== GOALS_VIEW) return;
    workspace.classList.add("goals-active");
    let page = workspace.querySelector(".goals-page");
    if (!page) {
      page = document.createElement("section");
      page.className = "goals-page";
      workspace.appendChild(page);
    }

    const reachedCount = goals.filter((goal) => goalProgress(goal).current >= Number(goal.target_amount)).length;
    const closest = goals
      .filter((goal) => goalProgress(goal).remaining > 0)
      .sort((a, b) => goalProgress(b).percent - goalProgress(a).percent)[0];
    const theme = document.documentElement.dataset.theme || "light";
    page.innerHTML = `
      <header class="goals-topbar">
        <div><p>TRADING JOURNAL</p><h1>Financial goals</h1></div>
        <div class="topbar-actions">
          <button class="theme-toggle goals-theme-toggle" type="button" aria-label="Switch theme">${theme === "dark" ? sunIcon : moonIcon}</button>
          <button class="log-button add-goal-button" type="button">+ Add goal</button>
        </div>
      </header>
      <div class="goals-content">
        <section class="goals-intro">
          <div><p>YOUR TARGETS</p><h2>Turn your results into measurable progress.</h2><span>Profit goals update from logged trades after fees. Balance goals use your latest broker balance.</span></div>
          <div class="goal-ring" style="--goal-progress:${closest ? goalProgress(closest).percent : 0}%"><div><strong>${closest ? Math.round(goalProgress(closest).percent) : 0}%</strong><small>${closest ? "closest goal" : "add a goal"}</small></div></div>
        </section>
        <section class="goals-summary" aria-label="Goals summary">
          <article><span>Active goals</span><strong>${Math.max(0, goals.length - reachedCount)}</strong><small>${goals.length ? `${goals.length} total goal${goals.length === 1 ? "" : "s"}` : "Create your first target"}</small></article>
          <article><span>Goals reached</span><strong>${reachedCount}</strong><small>${reachedCount ? "Keep building momentum" : "Your completed goals appear here"}</small></article>
          <article><span>Closest target</span><strong>${closest ? money(goalProgress(closest).remaining) : "—"}</strong><small>${closest ? `remaining for ${escapeHtml(closest.name)}` : "No active goal yet"}</small></article>
        </section>
        <section class="goals-list-header"><div><p>GOAL TRACKER</p><h2>Your goals</h2></div><button class="goal-refresh" type="button" ${loading ? "disabled" : ""}>${loading ? "Updating…" : "↻ Refresh"}</button></section>
        <section class="goals-grid">${loading && !goals.length ? '<div class="goals-loading">Updating your progress…</div>' : goals.length ? goals.map(renderGoalCard).join("") : renderEmptyState()}</section>
      </div>`;

    page.querySelector(".add-goal-button")?.addEventListener("click", () => openGoalForm());
    page.querySelector(".goal-empty button")?.addEventListener("click", () => openGoalForm());
    page.querySelector(".goal-refresh")?.addEventListener("click", loadGoalsData);
    page.querySelector(".goals-theme-toggle")?.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
    page.querySelectorAll("[data-edit-goal]").forEach((button) => button.addEventListener("click", () => openGoalForm(goals.find((goal) => String(goal.id) === button.dataset.editGoal))));
    page.querySelectorAll("[data-delete-goal]").forEach((button) => button.addEventListener("click", () => deleteGoal(button.dataset.deleteGoal)));
  }

  function renderGoalCard(goal) {
    const progress = goalProgress(goal);
    const pace = progress.daysLeft && progress.remaining > 0 ? progress.remaining / progress.daysLeft : null;
    const typeLabel = goal.goal_type === "balance" ? "Account balance" : "Trading profit";
    return `<article class="goal-card">
      <header><div><span class="goal-type">${typeLabel}</span><h3>${escapeHtml(goal.name)}</h3></div><span class="goal-status ${progress.statusClass}">${progress.status}</span></header>
      <div class="goal-amounts"><div><small>Current</small><strong>${money(progress.current)}</strong></div><div><small>Target</small><strong>${money(progress.target)}</strong></div></div>
      <div class="goal-progress-label"><span>${progress.percent.toFixed(1)}% complete</span><span>${money(progress.remaining)} remaining</span></div>
      <div class="goal-progress-track"><i style="width:${progress.percent}%"></i></div>
      <div class="goal-details">
        <span><small>Started</small><strong>${dateLabel(goal.start_date)}</strong></span>
        <span><small>Deadline</small><strong>${dateLabel(goal.target_date)}</strong></span>
        <span><small>${progress.daysLeft === null ? "Pace" : "Time left"}</small><strong>${progress.daysLeft === null ? "No deadline" : `${progress.daysLeft} day${progress.daysLeft === 1 ? "" : "s"}`}</strong></span>
        <span><small>Needed pace</small><strong>${pace === null ? "—" : `${money(pace)}/day`}</strong></span>
      </div>
      <footer><button class="goal-edit" data-edit-goal="${goal.id}" type="button">Edit goal</button><button class="premium-delete goal-delete" data-delete-goal="${goal.id}" aria-label="Delete goal" title="Delete" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.75 7.25h14.5M9 7.25V4.8h6v2.45M7 7.25l.7 12h8.6l.7-12M10 10.75v5M14 10.75v5"/></svg></button></footer>
    </article>`;
  }

  function renderEmptyState() {
    return `<article class="goal-empty"><div>${goalIcon}</div><h3>Set your first financial goal</h3><p>For example, create a trading profit goal of $5,000 and Greens Journal will calculate your progress automatically.</p><button class="log-button" type="button">+ Add first goal</button></article>`;
  }

  function openGoalForm(goal = null) {
    document.querySelector(".goal-modal-backdrop")?.remove();
    const modal = document.createElement("div");
    modal.className = "modal-backdrop goal-modal-backdrop";
    modal.innerHTML = `<section class="capital-modal goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-form-title">
      <header><div><p>FINANCIAL TARGET</p><h2 id="goal-form-title">${goal ? "Edit goal" : "Add a new goal"}</h2></div><button class="goal-modal-close" aria-label="Close goal form" type="button">×</button></header>
      <form>
        <label>Goal name<input name="name" maxlength="80" placeholder="Make $5,000" required value="${escapeHtml(goal?.name || "")}"></label>
        <div class="form-grid two">
          <label>What should this track?<select name="goal_type"><option value="profit" ${goal?.goal_type !== "balance" ? "selected" : ""}>Trading profit after fees</option><option value="balance" ${goal?.goal_type === "balance" ? "selected" : ""}>Actual trading account balance</option></select></label>
          <label>Target amount ($)<input name="target_amount" inputmode="decimal" min="0.01" placeholder="5000.00" required step="0.01" type="number" value="${goal ? Number(goal.target_amount) : ""}"></label>
        </div>
        <div class="form-grid two">
          <label>Start date<input name="start_date" required type="date" value="${goal?.start_date || today()}"></label>
          <label>Target date <small>(optional)</small><input name="target_date" type="date" value="${goal?.target_date || ""}"></label>
        </div>
        <p class="goal-form-help">Profit goals count all logged P&amp;L after fees from the start date. Balance goals use the newest balance saved in Capital.</p>
        <div class="goal-form-error" role="alert"></div>
        <footer><button class="cancel-button" type="button">Cancel</button><button class="save-button" type="submit">${goal ? "Save changes" : "Create goal"}</button></footer>
      </form>
    </section>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener("mousedown", (event) => { if (event.target === modal) close(); });
    modal.querySelector(".goal-modal-close")?.addEventListener("click", close);
    modal.querySelector(".cancel-button")?.addEventListener("click", close);
    modal.querySelector("form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const payload = {
        name: String(form.get("name") || "").trim(),
        goal_type: String(form.get("goal_type") || "profit"),
        target_amount: Number(form.get("target_amount")),
        start_date: String(form.get("start_date") || today()),
        target_date: String(form.get("target_date") || "") || null,
      };
      const errorBox = modal.querySelector(".goal-form-error");
      if (payload.target_date && payload.target_date < payload.start_date) {
        errorBox.textContent = "The target date must be after the start date.";
        return;
      }
      const save = modal.querySelector(".save-button");
      save.disabled = true;
      save.textContent = "Saving…";
      const query = goal ? client().from("goals").update(payload).eq("id", goal.id) : client().from("goals").insert(payload);
      const { error } = await query;
      if (error) {
        errorBox.textContent = error.message;
        save.disabled = false;
        save.textContent = goal ? "Save changes" : "Create goal";
        return;
      }
      close();
      showMessage(goal ? "Goal updated" : "Goal created");
      await loadGoalsData();
    });
  }

  async function deleteGoal(id) {
    if (!window.confirm("Delete this goal? Your trades and capital records will not be affected.")) return;
    const { error } = await client().from("goals").delete().eq("id", id);
    if (error) return showMessage(error.message, true);
    goals = goals.filter((goal) => String(goal.id) !== String(id));
    showMessage("Goal deleted");
    renderGoalsPage();
  }

  function showMessage(message, isError = false) {
    document.querySelector(".goals-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = `goals-toast${isError ? " error" : ""}`;
    toast.innerHTML = `<span>${isError ? "!" : "✓"}</span><div><strong>${escapeHtml(message)}</strong><small>${isError ? "Please try again." : "Your goals are up to date."}</small></div>`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function showGoals() {
    currentView = GOALS_VIEW;
    document.querySelectorAll('.sidebar nav button').forEach((button) => button.classList.toggle("active", button.classList.contains("goals-nav-button")));
    renderGoalsPage();
    loadGoalsData();
  }

  const observer = new MutationObserver(() => {
    installNavigation();
    if (currentView === GOALS_VIEW && !document.querySelector(".goals-page")) renderGoalsPage();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installNavigation();
})();
