// Attendance summary: one row per student for a class, including students who
// never signed in (the other reports only list check-ins). Used by the admin
// and instructor dashboards.
// Needs: common.js and report.js (for the CSV helpers) loaded first.
(() => {
  const {
    api,
    showToast,
    withBusy,
    el,
    createAutocomplete,
    makeCell,
    formatDate,
    formatClock,
    emptyRow,
    loadingRow,
    errorRow,
    fillSelect,
    csvCell,
    downloadCsvLines,
  } = NIIT;

  // Attendance rate that gets a green badge; half of it gets amber, below is red
  const TARGET_RATE = 75;

  const COLUMNS = 7;

  const rateBadge = (rate) => {
    if (rate === null || rate === undefined) {
      return el("span", {
        className: "badge badge-muted",
        text: "No data",
        title: "Nothing has settled yet for this student",
      });
    }

    let tone = "danger";

    if (rate >= TARGET_RATE) {
      tone = "success";
    } else if (rate >= TARGET_RATE / 2) {
      tone = "warn";
    }

    return el("span", { className: `badge badge-${tone}`, text: `${rate}%` });
  };

  // Lowest rate first (students with no data last), then by name
  const SORTERS = {
    name: (a, b) => a.student.name.localeCompare(b.student.name),
    rate: (a, b) => {
      const ra = a.rate === null ? Infinity : a.rate;
      const rb = b.rate === null ? Infinity : b.rate;

      return ra - rb || a.student.name.localeCompare(b.student.name);
    },
  };

  const CSV_HEADERS = [
    "Student",
    "Email",
    "Class",
    "Sessions held",
    "On time",
    "Late",
    "Absent",
    "Invalid",
    "Counted as attended",
    "Awaiting check-out",
    "Attendance rate (%)",
  ];

  // ---------- Drill-down: every session for one student ----------
  const DETAIL_COLUMNS = 4;

  const OUTCOMES = {
    attended: { label: "Attended", tone: "success" },
    left_early: { label: "Left early", tone: "warn" },
    invalid: { label: "Invalidated", tone: "muted" },
    absent: { label: "Absent", tone: "danger" },
    pending: { label: "Awaiting check-out", tone: "muted" },
  };

  // What each "Show" choice keeps
  const SHOW = {
    all: () => true,
    issues: (item) =>
      ["absent", "left_early", "invalid"].includes(item.outcome),
    attended: (item) => item.outcome === "attended",
  };

  const NOTHING_TO_SHOW = {
    all: "No sessions in this period.",
    issues: "Nothing missed in this period.",
    attended: "No attended sessions in this period.",
  };

  const weekday = (key) =>
    new Date(`${key}T00:00:00.000Z`).toLocaleDateString("en-GB", {
      timeZone: "UTC",
      weekday: "short",
    });

  const signedTimes = (item) => {
    const signedIn = item.signIn ? `Signed in ${formatClock(item.signIn)}` : "";
    const signedOut = item.signOut ? `, out ${formatClock(item.signOut)}` : "";

    return `${signedIn}${signedOut}`;
  };

  // What the reader should know about each kind of result
  const detailText = (item) => {
    switch (item.outcome) {
      case "absent":
        return "No sign-in recorded";
      case "invalid":
        return item.invalidationReason || "This record was invalidated";
      case "left_early":
        return `${signedTimes(item)}. Did not stay long enough to count.`;
      case "pending":
        return `${signedTimes(item)}. Counted once check-out is settled at the end of the day.`;
      default:
        return `${signedTimes(item)}.`;
    }
  };

  const filterText = (params) => {
    const parts = [];

    if (params.get("course")) {
      parts.push(params.get("course"));
    }

    const from = params.get("from");
    const to = params.get("to");

    if (from || to) {
      parts.push(
        `${from ? formatDate(from) : "start"} \u2013 ${to ? formatDate(to) : "today"}`,
      );
    }

    return parts.length ? parts.join(" \u00b7 ") : "All sessions so far";
  };

  // The data of the student currently shown, so changing "Show" re-draws the
  // list without asking the server again
  let detailData = null;

  const detailEl = (id) => document.getElementById(id);

  const showDetailDialog = () => {
    const dialog = detailEl("studentDetailDialog");

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  };

  const renderDetail = () => {
    const body = detailEl("studentDetailBody");
    const { totals, held, sessions } = detailData;
    const choice = detailEl("studentDetailFilter").value;

    const counts = [
      `${totals.attended} attended`,
      `${totals.absent} absent`,
      `${totals.leftEarly} left early`,
      `${totals.invalid} invalidated`,
    ];

    if (totals.pending) {
      counts.push(`${totals.pending} awaiting check-out`);
    }

    if (totals.lateArrivals) {
      counts.push(
        `${totals.lateArrivals} late ${totals.lateArrivals === 1 ? "arrival" : "arrivals"}`,
      );
    }

    counts.push(`${held} ${held === 1 ? "session" : "sessions"} held`);
    detailEl("studentDetailCounts").textContent = counts.join(" \u00b7 ");

    const shown = sessions.filter(SHOW[choice] || SHOW.all);

    body.replaceChildren();

    if (!shown.length) {
      body.appendChild(
        emptyRow(
          DETAIL_COLUMNS,
          NOTHING_TO_SHOW[choice] || NOTHING_TO_SHOW.all,
        ),
      );
      return;
    }

    shown.forEach((item) => {
      const outcome = OUTCOMES[item.outcome];
      const row = document.createElement("tr");

      row.append(
        makeCell(`${weekday(item.date)} ${formatDate(item.date)}`),
        makeCell(`${item.startTime}\u00a0\u2013\u00a0${item.endTime}`),
        makeCell(item.course),
        makeCell(
          el(
            "div",
            {},
            el("span", {
              className: `badge badge-${outcome.tone}`,
              text: outcome.label,
            }),
            item.late
              ? el("span", { className: "badge badge-warn", text: "Late" })
              : null,
            el("div", { className: "muted", text: detailText(item) }),
          ),
        ),
      );

      body.appendChild(row);
    });
  };

  // params: the filters of the summary the row came from, so the list covers
  // exactly the sessions the row's numbers were counted over
  const openStudentDetail = async (student, params) => {
    const body = detailEl("studentDetailBody");
    const query = new URLSearchParams(params);

    query.set("student", student._id);

    detailData = null;
    detailEl("studentDetailFilter").value = "all";
    detailEl("studentDetailTitle").textContent = student.name;
    detailEl("studentDetailSummary").textContent = filterText(params);
    detailEl("studentDetailCounts").textContent = "";
    body.replaceChildren(loadingRow(DETAIL_COLUMNS));
    showDetailDialog();

    const res = await api(`/reports/summary/sessions?${query}`);

    if (!res.ok) {
      body.replaceChildren(
        errorRow(DETAIL_COLUMNS, res.data.message || "Could not load the list"),
      );
      return;
    }

    detailData = res.data;
    detailEl("studentDetailSummary").textContent =
      `${res.data.class.name} \u00b7 ${filterText(params)}`;

    renderDetail();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const close = detailEl("studentDetailClose");

    if (!close) {
      return;
    }

    const dialog = detailEl("studentDetailDialog");

    close.addEventListener("click", () =>
      typeof dialog.close === "function"
        ? dialog.close()
        : dialog.removeAttribute("open"),
    );

    detailEl("studentDetailFilter").addEventListener("change", () => {
      if (detailData) {
        renderDetail();
      }
    });
  });

  // ids: { class, course, courseList, from, to, sort, show, export, info, body }
  // loadOptions: async () => ({ classes, courses, failed })
  NIIT.createSummary = ({
    ids,
    classPlaceholder = "Choose a class",
    loadOptions,
  }) => {
    const $ = (key) => document.getElementById(ids[key]);

    const classSelect = $("class");
    const courseInput = $("course");
    const fromInput = $("from");
    const toInput = $("to");
    const sortSelect = $("sort");
    const showButton = $("show");
    const exportButton = $("export");
    const info = $("info");
    const tableBody = $("body");

    const state = { courses: [], result: null, params: null };

    createAutocomplete({
      input: courseInput,
      list: $("courseList"),
      getItems: () => state.courses,
    });

    const prompt = () => {
      info.textContent = "";
      tableBody.replaceChildren(
        emptyRow(COLUMNS, "Choose a class and press Show."),
      );
    };

    const sortedRows = () =>
      [...state.result.students].sort(
        SORTERS[sortSelect.value] || SORTERS.name,
      );

    const render = () => {
      const { result } = state;

      info.textContent = `${result.class.name} \u00b7 ${result.sessionsHeld} ${result.sessionsHeld === 1 ? "session" : "sessions"} held \u00b7 ${result.students.length} ${result.students.length === 1 ? "student" : "students"}`;

      tableBody.replaceChildren();

      if (!result.students.length) {
        tableBody.appendChild(
          emptyRow(COLUMNS, "No active students are in this class."),
        );
        return;
      }

      sortedRows().forEach((row) => {
        const tr = document.createElement("tr");

        const nameButton = el("button", {
          type: "button",
          className: "link-button",
          text: row.student.name,
          title: `See every session for ${row.student.name}`,
        });

        nameButton.addEventListener("click", () =>
          openStudentDetail(row.student, state.params),
        );

        tr.append(
          makeCell(nameButton),
          makeCell(String(row.held)),
          makeCell(String(row.present)),
          makeCell(String(row.late)),
          makeCell(String(row.absent)),
          makeCell(String(row.counted)),
          makeCell(rateBadge(row.rate)),
        );

        tableBody.appendChild(tr);
      });
    };

    const buildQuery = () => {
      const params = new URLSearchParams();
      const add = (name, value) => value && params.set(name, value);

      add("class", classSelect.value);
      add("course", courseInput.value.trim());
      add("from", fromInput.value);
      add("to", toInput.value);

      return params;
    };

    const load = async () => {
      if (!classSelect.value) {
        showToast("Please choose a class first", "error");
        return;
      }

      state.result = null;
      info.textContent = "";
      tableBody.replaceChildren(loadingRow(COLUMNS));

      const params = buildQuery();
      const res = await api(`/reports/summary?${params}`);

      if (!res.ok) {
        const message = res.data.message || "Could not load the summary";

        showToast(message, "error");
        tableBody.replaceChildren(errorRow(COLUMNS, message));
        return;
      }

      state.result = res.data;
      state.params = params;
      render();
    };

    const exportCsv = () => {
      if (!state.result || !state.result.students.length) {
        showToast("There is nothing to export yet", "error");
        return;
      }

      const className = state.result.class.name;
      const lines = [
        CSV_HEADERS.map(csvCell).join(","),
        ...sortedRows().map((row) =>
          [
            row.student.name,
            row.student.email,
            className,
            row.held,
            row.present,
            row.late,
            row.absent,
            row.invalid,
            row.counted,
            row.pending,
            row.rate === null ? "" : row.rate,
          ]
            .map(csvCell)
            .join(","),
        ),
      ];

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
      }).format(new Date());

      downloadCsvLines(`attendance-summary-${today}.csv`, lines);
    };

    showButton.addEventListener("click", () => withBusy(showButton, load));
    exportButton.addEventListener("click", exportCsv);
    classSelect.addEventListener("change", () => {
      state.result = null;
      prompt();
    });

    // Re-sorting never needs the server
    sortSelect.addEventListener("change", () => {
      if (state.result) {
        render();
      }
    });

    return {
      open: async () => {
        const options = await loadOptions();

        state.courses = options.courses || [];

        fillSelect(classSelect, options.classes || [], {
          placeholder: classPlaceholder,
          selected: classSelect.value,
        });

        if (options.failed) {
          showToast("Some options could not be loaded", "error");
        }

        if (!state.result) {
          prompt();
        }
      },
    };
  };

  // ---------- Admin wiring ----------
  document.addEventListener("DOMContentLoaded", () => {
    const openButton = document.getElementById("attendanceSummaryButton");

    if (!openButton || !document.getElementById("summaryContainer")) {
      return;
    }

    const summary = NIIT.createSummary({
      ids: {
        class: "sumClass",
        course: "sumCourse",
        courseList: "sumCourseList",
        from: "sumFrom",
        to: "sumTo",
        sort: "sumSort",
        show: "sumShow",
        export: "sumExport",
        info: "sumInfo",
        body: "sumBody",
      },
      loadOptions: async () => {
        const [classResult, timetables] = await Promise.all([
          NIIT.getClasses(),
          api("/timetable"),
        ]);

        return {
          classes: classResult.classes,
          courses: [
            ...new Set(
              (timetables.ok ? timetables.data.timetables || [] : []).map(
                (timetable) => timetable.course,
              ),
            ),
          ],
          failed: Boolean(classResult.error) || !timetables.ok,
        };
      },
    });

    openButton.addEventListener("click", async () => {
      NIIT.showPanel("summaryContainer", openButton);
      await summary.open();
    });
  });
})();
