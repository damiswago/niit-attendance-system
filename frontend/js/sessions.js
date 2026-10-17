// Admin: schedule view. Postpone or cancel a class day, schedule / reschedule /
// cancel a replacement, and undo postponements and cancellations.
// The server decides which actions each row allows (entry.actions); this file
// only shows them and sends the right request.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("sessionsContainer")) {
    return;
  }

  const {
    api,
    showToast,
    withBusy,
    el,
    showPanel,
    makeCell,
    emptyRow,
    loadingRow,
    errorRow,
    formatDate,
    getClasses,
    fillSelect,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const openButton = byId("manageSessionsButton");
  const fromInput = byId("sessionFrom");
  const toInput = byId("sessionTo");
  const classFilter = byId("sessionClassFilter");
  const loadButton = byId("loadSessionsButton");
  const tableBody = byId("sessionsTableBody");

  const dialog = byId("sessionDialog");
  const dialogForm = byId("sessionDialogForm");
  const dialogTitle = byId("sessionDialogTitle");
  const dialogSummary = byId("sessionDialogSummary");
  const dialogError = byId("sessionDialogError");
  const dialogCancel = byId("sessionDialogCancel");
  const dialogConfirm = byId("sessionDialogConfirm");
  const reasonGroup = byId("sessionReasonGroup");
  const reasonInput = byId("sessionReason");
  const replacementRow = byId("scheduleReplacementRow");
  const replacementToggle = byId("scheduleReplacement");
  const replacementFields = byId("replacementFields");
  const replacementDate = byId("replacementDate");
  const replacementStart = byId("replacementStart");
  const replacementEnd = byId("replacementEnd");

  // ---------- State ----------
  const state = { entries: [], today: "", pending: null, opened: false };

  // ---------- Dates ----------
  const DAY_MS = 24 * 60 * 60 * 1000;

  const todayLagos = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
      new Date(),
    );

  const addDays = (key, days) =>
    new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS)
      .toISOString()
      .slice(0, 10);

  const weekday = (key) =>
    new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      timeZone: "UTC",
      weekday: "short",
    });

  const slot = (item) => `${item.startTime}\u00a0\u2013\u00a0${item.endTime}`;

  const laterOf = (a, b) => (a > b ? a : b);

  // ---------- What each action looks like ----------
  // replacement: "optional" shows a checkbox, "required" always asks for it
  const ACTIONS = {
    postpone: {
      label: "Postpone",
      title: "Postpone session",
      confirm: "Postpone",
      reason: true,
      replacement: "optional",
      warning:
        "Attendance already recorded for this session will be marked invalid.",
    },
    cancel: {
      label: "Cancel class",
      title: "Cancel session",
      confirm: "Cancel session",
      reason: true,
      danger: true,
      warning:
        "Attendance already recorded for this session will be marked invalid.",
    },
    add_replacement: {
      label: "Add replacement",
      title: "Schedule a replacement session",
      confirm: "Schedule",
      reason: false,
      replacement: "required",
    },
    reschedule: {
      label: "Reschedule",
      title: "Reschedule replacement session",
      confirm: "Reschedule",
      reason: true,
      replacement: "required",
      warning: "Any attendance already recorded for it will be deleted.",
    },
    cancel_replacement: {
      label: "Cancel replacement",
      title: "Cancel replacement session",
      confirm: "Cancel replacement",
      reason: true,
      danger: true,
      warning:
        "The original session stays postponed, with no replacement scheduled.",
    },
    undo_postponement: {
      label: "Undo postponement",
      ask: "Undo this postponement? Its replacement session (if any) will be removed.",
    },
    undo_cancellation: {
      label: "Undo cancellation",
      ask: "Undo this cancellation and restore the session?",
    },
  };

  // ---------- Requests ----------
  // Turns an action + row + form values into the API call. Days that have no
  // session record yet are addressed by timetable + date ("occurrence").
  const requestFor = (action, entry, values = {}) => {
    const reason = values.reason || undefined;
    const replacement = values.withReplacement
      ? {
          replacementDate: values.date,
          replacementStartTime: values.start,
          replacementEndTime: values.end,
        }
      : {};

    switch (action) {
      case "postpone":
        return entry.id
          ? {
              path: `/sessions/${entry.id}/postpone`,
              body: { reason, ...replacement },
            }
          : {
              path: "/sessions/postpone-occurrence",
              body: {
                timetable: entry.timetable,
                date: entry.date,
                reason,
                ...replacement,
              },
            };

      case "cancel":
        return entry.id
          ? { path: `/sessions/${entry.id}/cancel`, body: { reason } }
          : {
              path: "/sessions/cancel-occurrence",
              body: { timetable: entry.timetable, date: entry.date, reason },
            };

      // A postponed original gets its replacement; a replacement row is
      // itself rescheduled. Both go through the postpone endpoint.
      case "add_replacement":
      case "reschedule":
        return {
          path: `/sessions/${entry.id}/postpone`,
          body: { reason, ...replacement },
        };

      case "cancel_replacement":
        return {
          path: `/sessions/${entry.id}/cancel-replacement`,
          body: { reason },
        };

      case "undo_postponement":
        return { path: `/sessions/${entry.id}/undo-postponement`, body: {} };

      case "undo_cancellation":
        return { path: `/sessions/${entry.id}/undo-cancellation`, body: {} };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  };

  const send = (request) =>
    api(request.path, { method: "PATCH", body: request.body });

  // ---------- Table ----------
  const detailLines = (entry) => {
    const lines = [];

    if (entry.reason) {
      lines.push(`Reason: ${entry.reason}`);
    }

    if (entry.replacement) {
      lines.push(
        `Moved to ${weekday(entry.replacement.date)} ${formatDate(entry.replacement.date)}, ${entry.replacement.startTime}\u00a0\u2013\u00a0${entry.replacement.endTime}`,
      );
    } else if (entry.status === "postponed") {
      lines.push("No replacement scheduled yet");
    }

    if (entry.original) {
      lines.push(
        `Replaces ${weekday(entry.original.date)} ${formatDate(entry.original.date)}, ${entry.original.startTime}\u00a0\u2013\u00a0${entry.original.endTime}`,
      );
    }

    return lines;
  };

  const actionButton = (action, entry) => {
    const button = el("button", {
      type: "button",
      text: ACTIONS[action].label,
      className: ACTIONS[action].danger ? "btn-danger-outline" : undefined,
    });

    button.addEventListener("click", () =>
      withBusy(button, async () => {
        if (ACTIONS[action].ask) {
          await runDirect(action, entry);
        } else {
          openDialog(action, entry);
        }
      }),
    );

    return button;
  };

  const renderRows = () => {
    tableBody.replaceChildren();

    if (!state.entries.length) {
      tableBody.appendChild(
        emptyRow(
          7,
          "No classes in this period. Check the dates, and that active timetables cover them.",
        ),
      );
      return;
    }

    state.entries.forEach((entry) => {
      const row = el("tr", {
        className:
          [
            entry.isReplacement ? "replacement" : "",
            entry.date === state.today ? "today" : "",
          ]
            .join(" ")
            .trim() || undefined,
      });

      const dateCell = makeCell(
        el(
          "span",
          {},
          `${weekday(entry.date)} ${formatDate(entry.date)}`,
          entry.date === state.today
            ? el("span", { className: "badge badge-role", text: "Today" })
            : null,
        ),
      );

      const courseCell = makeCell(
        el(
          "span",
          {},
          entry.course,
          entry.isReplacement
            ? el("span", {
                className: "badge badge-muted",
                text: "Replacement",
              })
            : null,
        ),
      );

      const actionsCell = makeCell("");

      entry.actions.forEach((action) =>
        actionsCell.appendChild(actionButton(action, entry)),
      );

      row.append(
        dateCell,
        makeCell(slot(entry)),
        courseCell,
        makeCell((entry.class && entry.class.name) || "Unassigned"),
        makeCell((entry.instructor && entry.instructor.name) || "N/A"),
        makeCell(entry.status),
        actionsCell,
      );

      tableBody.appendChild(row);
    });
  };

  // ---------- Data ----------
  const load = async () => {
    const params = new URLSearchParams();

    if (fromInput.value) {
      params.set("from", fromInput.value);
    }

    if (toInput.value) {
      params.set("to", toInput.value);
    }

    if (classFilter.value) {
      params.set("class", classFilter.value);
    }

    tableBody.replaceChildren(loadingRow(7));

    const res = await api(`/sessions/schedule?${params}`);

    if (!res.ok) {
      const message = res.data.message || "Could not load sessions";

      showToast(message, "error");
      tableBody.replaceChildren(errorRow(7, message));
      return;
    }

    state.entries = res.data.sessions || [];
    state.today = res.data.today || "";

    renderRows();
  };

  const loadFilterClasses = async () => {
    const { classes, error } = await getClasses();

    if (error) {
      showToast(error, "error");
    }

    fillSelect(classFilter, classes, {
      placeholder: "All classes",
      selected: classFilter.value,
    });
  };

  // ---------- Undo (no form needed) ----------
  const runDirect = async (action, entry) => {
    if (!window.confirm(ACTIONS[action].ask)) {
      return;
    }

    const res = await send(requestFor(action, entry));

    showToast(
      res.data.message || (res.ok ? "Done" : "Request failed"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      await load();
    }
  };

  // ---------- Dialog ----------
  const showDialog = () =>
    typeof dialog.showModal === "function"
      ? dialog.showModal()
      : dialog.setAttribute("open", "");

  const closeDialog = () => {
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }

    state.pending = null;
  };

  const syncReplacementFields = () => {
    const config = ACTIONS[state.pending.action];
    const needed =
      config.replacement === "required" ||
      (config.replacement === "optional" && replacementToggle.checked);

    replacementFields.hidden = !needed;
  };

  const openDialog = (action, entry) => {
    const config = ACTIONS[action];

    state.pending = { action, entry };

    dialogTitle.textContent = config.title;
    dialogSummary.replaceChildren(
      ...[
        el("div", {
          text: `${entry.course} \u00b7 ${(entry.class && entry.class.name) || "No class"} \u00b7 ${weekday(entry.date)} ${formatDate(entry.date)}, ${slot(entry)}`,
        }),
        config.warning
          ? el("div", { className: "dialog-warning", text: config.warning })
          : null,
      ].filter(Boolean),
    );

    dialogError.textContent = "";
    reasonInput.value = "";
    reasonGroup.hidden = !config.reason;

    replacementRow.hidden = config.replacement !== "optional";
    replacementToggle.checked = true;

    // A replacement can't be earlier than today or than the original session
    const earliest = laterOf(
      state.today,
      entry.original ? entry.original.date : entry.date,
    );

    replacementDate.min = earliest;
    replacementDate.value = action === "reschedule" ? entry.date : "";
    replacementStart.value = entry.startTime;
    replacementEnd.value = entry.endTime;

    dialogConfirm.textContent = config.confirm;
    dialogConfirm.classList.toggle("btn-danger", Boolean(config.danger));

    syncReplacementFields();
    showDialog();
  };

  // Returns { values } or { error }
  const readDialog = () => {
    const { action, entry } = state.pending;
    const config = ACTIONS[action];
    const withReplacement =
      config.replacement === "required" ||
      (config.replacement === "optional" && replacementToggle.checked);

    const values = {
      reason: config.reason ? reasonInput.value.trim() : "",
      withReplacement,
      date: replacementDate.value,
      start: replacementStart.value,
      end: replacementEnd.value,
    };

    if (!withReplacement) {
      return { values };
    }

    if (!values.date || !values.start || !values.end) {
      return { error: "Enter the replacement date, start time and end time." };
    }

    if (values.end <= values.start) {
      return { error: "The end time must be after the start time." };
    }

    if (new Date(`${values.date}T${values.start}:00+01:00`) <= new Date()) {
      return { error: "The replacement must be scheduled for a future time." };
    }

    const earliest = laterOf(
      state.today,
      entry.original ? entry.original.date : entry.date,
    );

    if (values.date < earliest) {
      return {
        error: "The replacement can't be before the original session.",
      };
    }

    return { values };
  };

  const submitDialog = async (event) => {
    event.preventDefault();

    if (!state.pending) {
      return;
    }

    const { values, error } = readDialog();

    if (error) {
      dialogError.textContent = error;
      return;
    }

    dialogError.textContent = "";

    await withBusy(dialogConfirm, async () => {
      const { action, entry } = state.pending;
      const res = await send(requestFor(action, entry, values));

      if (!res.ok) {
        // The toast would sit behind the open dialog, so show the error here
        dialogError.textContent = res.data.message || "Request failed";
        return;
      }

      closeDialog();
      showToast(res.data.message || "Done");
      await load();
    });
  };

  // ---------- Wire up ----------
  openButton.addEventListener("click", async () => {
    showPanel("sessionsContainer", openButton);

    if (!state.opened) {
      state.opened = true;
      fromInput.value = fromInput.value || todayLagos();
      toInput.value = toInput.value || addDays(fromInput.value, 13);
    }

    await Promise.all([loadFilterClasses(), load()]);
  });

  loadButton.addEventListener("click", () => withBusy(loadButton, load));
  classFilter.addEventListener("change", load);

  replacementToggle.addEventListener("change", () => {
    if (state.pending) {
      syncReplacementFields();
    }
  });

  dialogForm.addEventListener("submit", submitDialog);
  dialogCancel.addEventListener("click", closeDialog);
  dialog.addEventListener("close", () => {
    state.pending = null;
  });
});