// Instructor dashboard: own schedule (with a roster for each session), own
// timetables, and an attendance report for their classes.
// Needs: common.js and report.js loaded first.
document.addEventListener("DOMContentLoaded", () => {
  const dashboard = document.getElementById("instructorDashboard");
  const user = NIIT.getUser();

  // The instructor section is in the page for every role
  if (!dashboard || !user || user.role !== "instructor") {
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
    formatClock,
    fillSelect,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const scheduleButton = byId("instructorScheduleButton");
  const timetablesButton = byId("instructorTimetablesButton");
  const reportButton = byId("instructorReportButton");

  const fromInput = byId("instructorFrom");
  const toInput = byId("instructorTo");
  const classFilter = byId("instructorClassFilter");
  const loadButton = byId("instructorLoadSchedule");
  const scheduleBody = byId("instructorScheduleBody");
  const timetablesBody = byId("instructorTimetablesBody");

  const rosterDialog = byId("rosterDialog");
  const rosterTitle = byId("rosterTitle");
  const rosterSummary = byId("rosterSummary");
  const rosterCounts = byId("rosterCounts");
  const rosterError = byId("rosterError");
  const rosterBody = byId("rosterBody");
  const rosterRefresh = byId("rosterRefresh");
  const rosterClose = byId("rosterClose");

  // ---------- State ----------
  const state = {
    timetables: [],
    entries: [],
    today: "",
    rosterSessionId: null,
    datesSet: false,
  };

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

  // ---------- Timetables (also feed the class / course filters) ----------
  const loadTimetables = async () => {
    const res = await api("/timetable");

    if (!res.ok) {
      showToast(res.data.message || "Could not load your timetables", "error");
      return false;
    }

    state.timetables = res.data.timetables || [];

    return true;
  };

  // The classes this instructor teaches, from their timetables
  const myClasses = () => {
    const seen = new Map();

    state.timetables.forEach((timetable) => {
      if (timetable.class && !seen.has(timetable.class._id)) {
        seen.set(timetable.class._id, timetable.class);
      }
    });

    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  const renderTimetables = () => {
    timetablesBody.replaceChildren();

    if (!state.timetables.length) {
      timetablesBody.appendChild(
        emptyRow(
          6,
          "You have no timetables yet. An administrator sets these up.",
        ),
      );
      return;
    }

    state.timetables.forEach((timetable) => {
      const row = document.createElement("tr");

      row.append(
        makeCell(timetable.course),
        makeCell((timetable.class && timetable.class.name) || "Unassigned"),
        makeCell(timetable.daysOfWeek.join(", ")),
        makeCell(timetable.startTime),
        makeCell(timetable.endTime),
        makeCell(timetable.isActive ? "Active" : "Inactive"),
      );

      timetablesBody.appendChild(row);
    });
  };

  // ---------- Schedule ----------
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

  const rosterButton = (entry) => {
    const button = el("button", {
      type: "button",
      text: "Roster",
      title: "See who has checked in",
    });

    button.addEventListener("click", () =>
      withBusy(button, () => openRoster(entry)),
    );

    return button;
  };

  const renderSchedule = () => {
    scheduleBody.replaceChildren();

    if (!state.entries.length) {
      scheduleBody.appendChild(
        emptyRow(6, "No classes in this period. Try a different date range."),
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

      // Only days that already have a session record can show a roster; later
      // days get theirs when the day comes
      const rosterCell = entry.id
        ? makeCell(rosterButton(entry))
        : makeCell(
            el("span", { className: "muted", text: "Opens on the day" }),
          );

      row.append(
        dateCell,
        makeCell(slot(entry)),
        courseCell,
        makeCell((entry.class && entry.class.name) || "Unassigned"),
        makeCell(entry.status),
        rosterCell,
      );

      scheduleBody.appendChild(row);
    });
  };

  const loadSchedule = async () => {
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

    scheduleBody.replaceChildren(loadingRow(6));

    const res = await api(`/sessions/schedule?${params}`);

    if (!res.ok) {
      const message = res.data.message || "Could not load your schedule";

      showToast(message, "error");
      scheduleBody.replaceChildren(errorRow(6, message));
      return;
    }

    state.entries = res.data.sessions || [];
    state.today = res.data.today || "";

    renderSchedule();
  };

  // ---------- Roster ----------
  // A student with no record is "Not checked in" while the class is running,
  // "Absent" once it has ended, and nothing special if it never took place
  const statusOf = (item, info) => {
    const record = item.attendance;

    if (record) {
      return record.isValid ? record.status : "Invalid";
    }

    if (
      info.session.status === "cancelled" ||
      info.session.status === "postponed"
    ) {
      return "-";
    }

    if (info.ended) {
      return "Absent";
    }

    return info.started ? "Not checked in" : "Not started";
  };

  const attendedLabel = (record) => {
    if (!record) {
      return "-";
    }

    if (record.classAttended === true) {
      return "Yes";
    }

    return record.classAttended === false ? "No" : "Pending";
  };

  const renderRoster = (info) => {
    const { session } = info;
    const statuses = info.roster.map((item) => statusOf(item, info));
    const count = (label) => statuses.filter((s) => s === label).length;

    rosterTitle.textContent = session.course;
    rosterSummary.textContent = `${(session.class && session.class.name) || "No class"} \u00b7 ${weekday(session.date)} ${formatDate(session.date)}, ${slot(session)}`;

    const missing = info.ended ? "Absent" : "Not checked in";
    const parts = [
      `Present ${count("present")}`,
      `Late ${count("late")}`,
      ...(session.status === "cancelled" || session.status === "postponed"
        ? [`Session ${session.status}`]
        : [`${missing} ${count(missing)}`]),
      `Total ${info.roster.length}`,
    ];

    rosterCounts.textContent = parts.join(" \u00b7 ");

    rosterBody.replaceChildren();

    if (!info.roster.length) {
      rosterBody.appendChild(
        emptyRow(5, "No students are assigned to this class yet."),
      );
      return;
    }

    info.roster.forEach((item, index) => {
      const record = item.attendance;
      const row = document.createElement("tr");

      row.append(
        makeCell(item.student.name),
        makeCell(statuses[index]),
        makeCell(record && record.signIn ? formatClock(record.signIn) : "-"),
        makeCell(record && record.signOut ? formatClock(record.signOut) : "-"),
        makeCell(attendedLabel(record)),
      );

      rosterBody.appendChild(row);
    });
  };

  const showRosterDialog = () =>
    typeof rosterDialog.showModal === "function"
      ? rosterDialog.showModal()
      : rosterDialog.setAttribute("open", "");

  const closeRosterDialog = () => {
    if (typeof rosterDialog.close === "function") {
      rosterDialog.close();
    } else {
      rosterDialog.removeAttribute("open");
    }

    state.rosterSessionId = null;
  };

  const loadRoster = async () => {
    if (!state.rosterSessionId) {
      return;
    }

    const res = await api(`/sessions/${state.rosterSessionId}/roster`);

    if (!res.ok) {
      // A toast would sit behind the open dialog, so show the error inside it
      rosterError.textContent = res.data.message || "Could not load the roster";
      return;
    }

    rosterError.textContent = "";
    renderRoster(res.data);
  };

  const openRoster = async (entry) => {
    state.rosterSessionId = entry.id;

    rosterTitle.textContent = entry.course;
    rosterSummary.textContent = "Loading...";
    rosterCounts.textContent = "";
    rosterError.textContent = "";
    rosterBody.replaceChildren(loadingRow(5));

    showRosterDialog();
    await loadRoster();
  };

  // ---------- Panels ----------
  const openSchedule = async () => {
    showPanel("instructorScheduleContainer", scheduleButton);

    if (!state.datesSet) {
      state.datesSet = true;
      fromInput.value = fromInput.value || todayLagos();
      toInput.value = toInput.value || addDays(fromInput.value, 13);
    }

    await loadTimetables();

    fillSelect(classFilter, myClasses(), {
      placeholder: "All my classes",
      selected: classFilter.value,
    });

    await loadSchedule();
  };

  const openTimetables = async () => {
    showPanel("instructorTimetablesContainer", timetablesButton);
    timetablesBody.replaceChildren(loadingRow(6));

    if (await loadTimetables()) {
      renderTimetables();
    } else {
      timetablesBody.replaceChildren(
        errorRow(6, "Could not load your timetables"),
      );
    }
  };

  const report = NIIT.createReport({
    path: "/reports/instructor/attendance",
    classPlaceholder: "All my classes",
    ids: {
      course: "instCourse",
      class: "instClass",
      student: "instStudent",
      date: "instDate",
      courseList: "instCourseList",
      studentList: "instStudentList",
      apply: "instApply",
      clear: "instClear",
      export: "instExport",
      tableBody: "instReportBody",
      count: "instCount",
      pager: "instPager",
      prev: "instPrev",
      next: "instNext",
      pageInfo: "instPageInfo",
    },
    loadOptions: async () => {
      const [students, timetablesOk] = await Promise.all([
        api("/users/my-students"),
        loadTimetables(),
      ]);

      return {
        students: students.ok ? students.data.students || [] : [],
        courses: [...new Set(state.timetables.map((t) => t.course))],
        classes: myClasses(),
        failed: !students.ok || !timetablesOk,
      };
    },
  });

  const openReport = async () => {
    showPanel("instructorReportContainer", reportButton);
    await report.open();
  };

  const summaryButton = byId("instructorSummaryButton");

  const summary = NIIT.createSummary({
    ids: {
      class: "isumClass",
      course: "isumCourse",
      courseList: "isumCourseList",
      from: "isumFrom",
      to: "isumTo",
      sort: "isumSort",
      show: "isumShow",
      export: "isumExport",
      info: "isumInfo",
      body: "isumBody",
    },
    loadOptions: async () => {
      const ok = await loadTimetables();

      return {
        classes: myClasses(),
        courses: [...new Set(state.timetables.map((t) => t.course))],
        failed: !ok,
      };
    },
  });

  const openSummary = async () => {
    showPanel("instructorSummaryContainer", summaryButton);
    await summary.open();
  };

  // ---------- Wire up ----------
  summaryButton.addEventListener("click", openSummary);
  scheduleButton.addEventListener("click", openSchedule);
  timetablesButton.addEventListener("click", openTimetables);
  reportButton.addEventListener("click", openReport);

  loadButton.addEventListener("click", () =>
    withBusy(loadButton, loadSchedule),
  );
  classFilter.addEventListener("change", loadSchedule);

  rosterRefresh.addEventListener("click", () =>
    withBusy(rosterRefresh, loadRoster),
  );
  rosterClose.addEventListener("click", closeRosterDialog);
  rosterDialog.addEventListener("close", () => {
    state.rosterSessionId = null;
  });

  // Start on the schedule: it's what an instructor opens the page to see
  openSchedule();
});