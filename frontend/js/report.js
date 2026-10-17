// Shared attendance report: combinable filters, paging and CSV export.
// Used by the admin and instructor dashboards; each passes its own endpoint,
// element ids and a function that loads the filter options.
// Needs: common.js (NIIT helpers) loaded first.
(() => {
  const {
    api,
    showToast,
    withBusy,
    el,
    createAutocomplete,
    buildAttendanceRow,
    emptyRow,
    loadingRow,
    errorRow,
    formatDateTime,
    fillSelect,
  } = NIIT;

  const PAGE_SIZE = 50; // rows per page on screen
  const EXPORT_PAGE_SIZE = 200; // the server's maximum, used to export fast
  const EXPORT_MAX = 20000; // beyond this, ask to narrow the filters

  // ---------- CSV ----------
  // Spreadsheet apps run text that starts with = + - @ as a formula, so such
  // values (a student could have typed any name) are prefixed with a quote.
  const csvCell = (value) => {
    let text = value === null || value === undefined ? "" : String(value);

    if (/^[=+\-@\t\r]/.test(text)) {
      text = `'${text}`;
    }

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const CSV_HEADERS = [
    "Student",
    "Email",
    "Course",
    "Class",
    "Date",
    "Session start",
    "Session end",
    "Sign in",
    "Sign out",
    "Sign out method",
    "Status",
    "Class attended",
    "Valid",
    "Invalid reason",
  ];

  const classNameOf = (record) =>
    (record.session &&
      record.session.timetable &&
      record.session.timetable.class &&
      record.session.timetable.class.name) ||
    "";

  const csvRow = (record) => {
    const session = record.session || {};
    const student = record.student || {};

    let attended = "Pending";

    if (record.classAttended === true) {
      attended = "Yes";
    } else if (record.classAttended === false) {
      attended = "No";
    }

    return [
      student.name || "",
      student.email || "",
      session.course || "",
      classNameOf(record),
      session.date ? new Date(session.date).toISOString().slice(0, 10) : "",
      session.startTime || "",
      session.endTime || "",
      record.signIn ? formatDateTime(record.signIn) : "",
      record.signOut ? formatDateTime(record.signOut) : "",
      record.signOutMethod || "",
      record.status || "",
      attended,
      record.isValid ? "Valid" : "Invalid",
      record.invalidationReason || "",
    ]
      .map(csvCell)
      .join(",");
  };

  // Downloads lines of CSV text as a file
  const downloadLines = (filename, lines) => {
    // The BOM makes Excel read the file as UTF-8 (names with accents)
    const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const todayLagos = () =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
      new Date(),
    );

  const downloadCsv = (records) =>
    downloadLines(`attendance-${todayLagos()}.csv`, [
      CSV_HEADERS.map(csvCell).join(","),
      ...records.map(csvRow),
    ]);

  NIIT.csvCell = csvCell;
  NIIT.downloadCsvLines = downloadLines;

  // ---------- The report ----------
  // ids: { course, class, student, instructor?, date, courseList, studentList,
  //        instructorList?, apply, clear, export, tableBody, count, pager,
  //        prev, next, pageInfo }  (element ids; instructor ones are optional)
  // loadOptions: async () => ({ students, instructors, courses, classes, failed })
  NIIT.createReport = ({
    path,
    ids,
    columns = 11,
    classPlaceholder = "All classes",
    loadOptions,
  }) => {
    const $ = (key) => (ids[key] ? document.getElementById(ids[key]) : null);

    const courseInput = $("course");
    const classSelect = $("class");
    const studentInput = $("student");
    const instructorInput = $("instructor"); // admin only
    const dateInput = $("date");
    const tableBody = $("tableBody");
    const countLine = $("count");
    const pager = $("pager");
    const prevButton = $("prev");
    const nextButton = $("next");
    const pageInfo = $("pageInfo");
    const lists = ["courseList", "studentList", "instructorList"]
      .map($)
      .filter(Boolean);

    // query = the filters last applied with "Filter" (page changes and export
    // use these, not whatever is half-typed in the boxes)
    const state = {
      students: [],
      instructors: [],
      courses: [],
      query: "",
      pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 },
    };

    // ---------- Filters ----------
    createAutocomplete({
      input: courseInput,
      list: $("courseList"),
      getItems: () => state.courses,
    });

    // A student / instructor must be picked from the list so we have their id;
    // typing again invalidates the earlier pick
    createAutocomplete({
      input: studentInput,
      list: $("studentList"),
      getItems: () => state.students,
      getLabel: (student) => student.name,
      onType: () => {
        studentInput.dataset.studentId = "";
      },
      onSelect: (student) => {
        studentInput.dataset.studentId = student._id;
      },
    });

    if (instructorInput) {
      createAutocomplete({
        input: instructorInput,
        list: $("instructorList"),
        getItems: () => state.instructors,
        getLabel: (instructor) => instructor.name,
        onType: () => {
          instructorInput.dataset.instructorId = "";
        },
        onSelect: (instructor) => {
          instructorInput.dataset.instructorId = instructor._id;
        },
      });
    }

    const clearFilters = () => {
      courseInput.value = "";
      classSelect.value = "";
      studentInput.value = "";
      studentInput.dataset.studentId = "";
      dateInput.value = "";

      if (instructorInput) {
        instructorInput.value = "";
        instructorInput.dataset.instructorId = "";
      }

      lists.forEach((list) => (list.innerHTML = ""));
    };

    // Returns { query } (possibly empty = everything) or { error }
    const buildQuery = () => {
      if (studentInput.value.trim() && !studentInput.dataset.studentId) {
        return { error: "Please choose a student from the suggestions" };
      }

      if (
        instructorInput &&
        instructorInput.value.trim() &&
        !instructorInput.dataset.instructorId
      ) {
        return { error: "Please choose an instructor from the suggestions" };
      }

      const params = new URLSearchParams();
      const add = (name, value) => value && params.set(name, value);

      add("course", courseInput.value.trim());
      add("class", classSelect.value);
      add("student", studentInput.dataset.studentId);
      add("date", dateInput.value);

      if (instructorInput) {
        add("instructor", instructorInput.dataset.instructorId);
      }

      return { query: params.toString() };
    };

    const showLoading = () => tableBody.replaceChildren(loadingRow(columns));

    // ---------- Data ----------
    const applyOptions = (options) => {
      state.students = options.students || [];
      state.instructors = options.instructors || [];
      state.courses = options.courses || [];

      fillSelect(classSelect, options.classes || [], {
        placeholder: classPlaceholder,
        selected: classSelect.value,
      });

      if (options.failed) {
        showToast("Some filter options could not be loaded", "error");
      }
    };

    const fetchReport = (query = "", page = 1, limit = PAGE_SIZE) => {
      const params = new URLSearchParams(query);

      params.set("page", String(page));
      params.set("limit", String(limit));

      return api(`${path}?${params}`);
    };

    // ---------- Render ----------
    const renderRows = (records = []) => {
      const studentNames = new Map(state.students.map((s) => [s._id, s.name]));

      tableBody.replaceChildren();

      if (!records.length) {
        tableBody.appendChild(
          emptyRow(columns, "No attendance records found."),
        );
        return;
      }

      records.forEach((record) => {
        const studentId =
          (record.student && record.student._id) || record.student;
        const studentName =
          (record.student && record.student.name) ||
          studentNames.get(studentId) ||
          studentId;

        tableBody.appendChild(
          buildAttendanceRow(record, {
            studentName,
            className: classNameOf(record),
          }),
        );
      });
    };

    const renderPager = () => {
      const { page, limit, total, totalPages } = state.pagination;

      countLine.textContent = total
        ? `Showing ${(page - 1) * limit + 1}\u2013${Math.min(page * limit, total)} of ${total} ${total === 1 ? "record" : "records"}`
        : "0 records";

      pager.hidden = totalPages <= 1;
      pageInfo.textContent = `Page ${page} of ${totalPages}`;
      prevButton.disabled = page <= 1;
      nextButton.disabled = page >= totalPages;
    };

    const showReport = (res) => {
      if (!res.ok) {
        const message = res.data.message || "Could not load attendance";

        showToast(message, "error");
        tableBody.replaceChildren(errorRow(columns, message));
        return;
      }

      state.pagination = res.data.pagination || state.pagination;

      renderRows(res.data.attendance);
      renderPager();
    };

    // ---------- Export ----------
    // Collects every record matching the applied filters, one server page at a
    // time. Returns the records, or null after showing why it can't.
    const fetchAllRecords = async () => {
      const first = await fetchReport(state.query, 1, EXPORT_PAGE_SIZE);

      if (!first.ok) {
        showToast(first.data.message || "Could not export", "error");
        return null;
      }

      const { total, totalPages } = first.data.pagination;

      if (!total) {
        showToast("There are no records to export", "error");
        return null;
      }

      if (total > EXPORT_MAX) {
        showToast(
          `${total} records is too many to export at once. Narrow the filters (for example by class or date) and try again.`,
          "error",
        );
        return null;
      }

      let records = first.data.attendance;

      for (let page = 2; page <= totalPages; page++) {
        const res = await fetchReport(state.query, page, EXPORT_PAGE_SIZE);

        if (!res.ok) {
          showToast(res.data.message || "Could not export", "error");
          return null;
        }

        records = records.concat(res.data.attendance);
      }

      return records;
    };

    // ---------- Wire up ----------
    $("apply").addEventListener("click", () =>
      withBusy($("apply"), async () => {
        const { query, error } = buildQuery();

        if (error) {
          showToast(error, "error");
          return;
        }

        state.query = query;
        showLoading();
        showReport(await fetchReport(query));
      }),
    );

    $("clear").addEventListener("click", () =>
      withBusy($("clear"), async () => {
        clearFilters();
        state.query = "";
        showLoading();
        showReport(await fetchReport());
      }),
    );

    $("export").addEventListener("click", () =>
      withBusy($("export"), async () => {
        const records = await fetchAllRecords();

        if (records) {
          downloadCsv(records);
        }
      }),
    );

    // Not withBusy: the pager decides which buttons are enabled for the new
    // page (e.g. Next is disabled on the last page), and withBusy would turn
    // the clicked button back on afterwards.
    const goToPage = async (page) => {
      prevButton.disabled = true;
      nextButton.disabled = true;
      showLoading();

      const res = await fetchReport(state.query, page);

      showReport(res);

      if (!res.ok) {
        renderPager(); // keep the current page's buttons as they were
      }
    };

    prevButton.addEventListener("click", () =>
      goToPage(state.pagination.page - 1),
    );
    nextButton.addEventListener("click", () =>
      goToPage(state.pagination.page + 1),
    );

    return {
      // Loads the filter options and the first page together, renders once
      open: async () => {
        showLoading();

        const [options, report] = await Promise.all([
          loadOptions(),
          fetchReport(state.query),
        ]);

        applyOptions(options);
        showReport(report);
      },
    };
  };
})();