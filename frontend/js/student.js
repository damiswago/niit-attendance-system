// Student dashboard: current session (check in / out), summary numbers and
// the student's own attendance history with course / date filters.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  const {
    api,
    showToast,
    withBusy,
    el,
    createAutocomplete,
    getUser,
    formatClock,
    buildAttendanceRow,
    emptyRow,
    loadingRow,
    errorRow,
    makeCell,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  // The student section is in the page for every role, so check who is signed in
  const user = getUser();

  if (!byId("studentDashboard") || !user || user.role !== "student") {
    return;
  }

  const REPORT_PATH = "/reports/student/attendance";
  const SUMMARY_PATH = "/reports/student/summary";
  const TARGET_RATE = 75; // rate that gets a green badge; half of it amber
  const POLL_MS = 30000; // how often the session card refreshes itself

  // ---------- DOM ----------
  const dashboard = byId("studentDashboard");
  const sessionBox = byId("currentSession");
  const courseInput = byId("studentCourseFilter");
  const courseList = byId("studentCourseSuggestions");
  const dateInput = byId("studentDateFilter");
  const filterButton = byId("filterStudentAttendanceButton");
  const clearButton = byId("clearStudentAttendanceFiltersButton");
  const tableBody = byId("studentAttendanceTableBody");

  // The summary row isn't in the HTML; it is added under the page subtitle
  const summary = el("div", { id: "studentSummary", className: "stat-row" });
  dashboard.querySelector(".page-subtitle").after(summary);

  // Per-course breakdown, shown under the tiles when there is more than one
  const courseSummary = el("div", { id: "studentCourseSummary" });
  summary.after(courseSummary);

  // ---------- State ----------
  const state = {
    records: [], // all of this student's attendance records
    courses: [], // course names for the filter search box
    session: null, // today's active session, if any
    sessionError: "", // set when the session could not be loaded
    sessionRetry: true, // false when trying again can't help (e.g. no class yet)
    summary: null, // server-side totals, including sessions never attended
  };

  // ---------- Summary ----------
  // Comes from the server so it can count sessions the student never signed in
  // to (those have no attendance record to count on this side).
  const rateTone = (rate) => {
    if (rate >= TARGET_RATE) {
      return "success";
    }

    return rate >= TARGET_RATE / 2 ? "warn" : "danger";
  };

  const rateText = (rate) =>
    rate === null || rate === undefined ? "-" : `${rate}%`;

  const tile = (label, value, tone) =>
    el(
      "div",
      { className: `stat${tone ? ` stat-${tone}` : ""}` },
      el("div", { className: "stat-value", text: String(value) }),
      el("div", { className: "stat-label", text: label }),
    );

  const renderSummary = () => {
    const data = state.summary;

    if (!data) {
      summary.replaceChildren();
      courseSummary.replaceChildren();
      return;
    }

    summary.replaceChildren(
      tile(
        "Attendance rate",
        rateText(data.rate),
        data.rate === null ? "" : rateTone(data.rate),
      ),
      tile("Sessions held", data.held),
      tile("On time", data.present),
      tile("Late", data.late),
      tile("Absent", data.absent, data.absent ? "danger" : ""),
    );

    if (!data.byCourse || data.byCourse.length < 2) {
      courseSummary.replaceChildren();
      return;
    }

    const body = document.createElement("tbody");

    data.byCourse.forEach((course) => {
      const row = document.createElement("tr");

      row.append(
        makeCell(course.course),
        makeCell(String(course.held)),
        makeCell(String(course.present)),
        makeCell(String(course.late)),
        makeCell(String(course.absent)),
        makeCell(
          course.rate === null
            ? "-"
            : el("span", {
                className: `badge badge-${rateTone(course.rate)}`,
                text: `${course.rate}%`,
              }),
        ),
      );

      body.appendChild(row);
    });

    const head = document.createElement("thead");
    const headRow = document.createElement("tr");

    ["Course", "Held", "On time", "Late", "Absent", "Rate"].forEach((label) =>
      headRow.appendChild(el("th", { scope: "col", text: label })),
    );
    head.appendChild(headRow);

    courseSummary.replaceChildren(
      el("h3", { text: "By course" }),
      el(
        "div",
        { className: "table-scroll" },
        el("table", { className: "report-table" }, head, body),
      ),
    );
  };

  // ---------- Current session ----------
  // Session dates are stored as the Lagos calendar day, times as "HH:mm" (WAT, UTC+1)
  const sessionWindow = (session) => {
    const day = String(session.date).slice(0, 10);

    return {
      start: new Date(`${day}T${session.startTime}:00+01:00`),
      end: new Date(`${day}T${session.endTime}:00+01:00`),
    };
  };

  // Works out what the card should say and which buttons are usable.
  // This is only a hint for the UI: the server decides what is really allowed.
  const describeSession = (session, record) => {
    const { start, end } = sessionWindow(session);
    const now = new Date();

    if (!record) {
      if (now < start) {
        return {
          label: "Not started",
          tone: "muted",
          note: `Check-in opens at ${session.startTime}.`,
        };
      }

      if (now > end) {
        return {
          label: "Ended",
          tone: "danger",
          note: "This session has ended.",
        };
      }

      return {
        label: "Not checked in",
        tone: "warn",
        note: "Check in now to be marked present.",
        canCheckIn: true,
      };
    }

    if (!record.isValid) {
      return {
        label: "Invalidated",
        tone: "danger",
        note:
          record.invalidationReason ||
          "Your attendance for this session was invalidated.",
      };
    }

    if (record.signOut) {
      const outcome =
        record.classAttended === true
          ? "Counted as attended."
          : "Not enough time in class to count as attended.";

      return {
        label: "Checked out",
        tone: "success",
        note: `Signed out at ${formatClock(record.signOut)}. ${outcome}`,
      };
    }

    return {
      label: "Checked in",
      tone: "success",
      note:
        `Signed in at ${formatClock(record.signIn)}` +
        `${record.status === "late" ? " (late)" : ""}. ` +
        "Remember to check out before you leave.",
      canCheckOut: true,
    };
  };

  const act = async (action, sessionId) => {
    const res = await api(`/attendance/${action}`, {
      method: "POST",
      body: { sessionId },
    });

    showToast(
      res.data.message || (res.ok ? "Done" : "Request failed"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      await refresh({ table: true });
    }
  };

  const renderSession = () => {
    sessionBox.replaceChildren();

    if (state.sessionError) {
      sessionBox.append(
        el("p", { className: "session-empty", text: state.sessionError }),
        ...(state.sessionRetry
          ? [
              el("button", {
                type: "button",
                className: "btn-outline",
                text: "Try again",
                onClick: () => refresh(),
              }),
            ]
          : []),
      );
      return;
    }

    const session = state.session;

    if (!session) {
      sessionBox.append(
        el("p", {
          className: "session-empty",
          text: "No class is in session right now.",
        }),
      );
      return;
    }

    const record = state.records.find(
      (item) => item.session && item.session._id === session._id,
    );
    const info = describeSession(session, record);

    const checkInButton = el("button", {
      type: "button",
      text: "Check in",
      disabled: !info.canCheckIn,
    });

    const checkOutButton = el("button", {
      type: "button",
      className: "btn-outline",
      text: "Check out",
      disabled: !info.canCheckOut,
    });

    checkInButton.addEventListener("click", () =>
      withBusy(checkInButton, () => act("check-in", session._id)),
    );

    checkOutButton.addEventListener("click", () =>
      withBusy(checkOutButton, async () => {
        const sure = window.confirm(
          "Check out now? You won't be able to check in again for this session.",
        );

        if (sure) {
          await act("check-out", session._id);
        }
      }),
    );

    sessionBox.append(
      el(
        "div",
        { className: "session-card" },
        el(
          "div",
          { className: "session-main" },
          el("div", { className: "session-title", text: session.course }),
          el("div", {
            className: "session-meta",
            text: `${session.startTime} \u2013 ${session.endTime}`,
          }),
          el("div", { className: "session-note", text: info.note }),
        ),
        el(
          "div",
          { className: "session-state" },
          el("span", {
            className: `badge badge-${info.tone}`,
            text: info.label,
          }),
          record && record.isValid && record.status === "late"
            ? el("span", { className: "badge badge-warn", text: "Late" })
            : null,
        ),
        el(
          "div",
          { className: "session-actions" },
          checkInButton,
          checkOutButton,
        ),
      ),
    );
  };

  // ---------- History table ----------
  const renderAttendance = (records = []) => {
    tableBody.replaceChildren();

    if (!records.length) {
      tableBody.appendChild(emptyRow(9, "No attendance records found."));
      return;
    }

    records.forEach((record) =>
      tableBody.appendChild(buildAttendanceRow(record)),
    );
  };

  const clearFilters = () => {
    courseInput.value = "";
    dateInput.value = "";
    courseList.innerHTML = "";
  };

  // ---------- Data ----------
  // Loads the session and the records together. Pass { table: true } to also
  // reset the filters and redraw the history table.
  const refresh = async ({ table = false } = {}) => {
    const [sessionRes, recordsRes, summaryRes] = await Promise.all([
      api("/sessions/current"),
      api(REPORT_PATH),
      table ? api(SUMMARY_PATH) : null,
    ]);

    if (recordsRes.ok) {
      state.records = recordsRes.data.attendance || [];
      state.courses = [
        ...new Set(
          state.records
            .map((record) => record.session && record.session.course)
            .filter(Boolean),
        ),
      ];

      if (table) {
        clearFilters();
        renderAttendance(state.records);
      }
    } else if (table) {
      const message =
        recordsRes.data.message || "Could not load your attendance";

      showToast(message, "error");
      tableBody.replaceChildren(errorRow(9, message));
    }

    // The totals only change after a check-in / check-out, so they are fetched
    // with the table and not on every 30-second poll
    if (summaryRes && summaryRes.ok) {
      state.summary = summaryRes.data.summary;
      renderSummary();
    }

    if (sessionRes.ok) {
      state.session = sessionRes.data.session || null;
      state.sessionError = "";
    } else if (sessionRes.status === 404) {
      // The API answers 404 when nothing is running: not an error
      state.session = null;
      state.sessionError = "";
    } else {
      state.session = null;
      state.sessionError =
        sessionRes.data.message || "Could not load the current session.";
      // 403 = no class assigned: waiting or retrying won't change that
      state.sessionRetry = sessionRes.status !== 403;
    }

    renderSession();
  };

  // ---------- Filters ----------
  // The API filters by course OR date, so using one clears the other.
  createAutocomplete({
    input: courseInput,
    list: courseList,
    getItems: () => state.courses,
    onType: () => {
      dateInput.value = "";
    },
  });

  dateInput.addEventListener("change", () => {
    courseInput.value = "";
    courseList.innerHTML = "";
  });

  const applyFilter = async () => {
    const course = courseInput.value.trim();
    const date = dateInput.value;

    if (!course && !date) {
      showToast("Pick a course or a date to filter by", "error");
      return;
    }

    if (course && date) {
      showToast("Please use only one filter at a time", "error");
      return;
    }

    const path = course
      ? `${REPORT_PATH}/course/${encodeURIComponent(course)}`
      : `${REPORT_PATH}/date/${encodeURIComponent(date)}`;

    const res = await api(path);

    if (!res.ok) {
      showToast(res.data.message || "Could not load attendance", "error");
      return;
    }

    renderAttendance(res.data.attendance);
  };

  // ---------- Wire up ----------
  filterButton.addEventListener("click", () =>
    withBusy(filterButton, applyFilter),
  );

  clearButton.addEventListener("click", () =>
    withBusy(clearButton, async () => {
      clearFilters();
      renderAttendance(state.records);
    }),
  );

  tableBody.replaceChildren(loadingRow(9));
  refresh({ table: true });

  // Keep the card honest while the page stays open (class starts, auto sign-out...)
  setInterval(() => {
    if (!document.hidden) {
      refresh();
    }
  }, POLL_MS);
});