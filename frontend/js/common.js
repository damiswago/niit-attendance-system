// Shared helpers for the dashboard scripts.
// Load this BEFORE every other page script.
(() => {
  // The ONLY place the API address lives. It must match your backend PORT.
  // Where the API lives. When this page is served by the same server as the API
  // (the normal deployment) that is simply "/api". The one exception is local
  // development with VS Code's Live Server (port 5500), where the API runs
  // separately on port 3000.
  const API_BASE = (() => {
    const { hostname, port, protocol } = window.location;
    const liveServer =
      port === "5500" && (hostname === "127.0.0.1" || hostname === "localhost");

    return liveServer ? `${protocol}//${hostname}:3000/api` : "/api";
  })();

  // fetch wrapper. Always resolves to { ok, status, data } and never throws.
  const api = async (path, { method = "GET", body } = {}) => {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });

      const data = await response.json().catch(() => ({}));

      // Session expired: send the user back to the login page
      // (auth endpoints use 401 for "wrong password", so they are excluded)
      if (response.status === 401 && !path.startsWith("/auth/")) {
        localStorage.removeItem("user");
        window.location.href = "index.html";
      }

      return { ok: response.ok, status: response.status, data };
    } catch {
      return {
        ok: false,
        status: 0,
        data: { message: "Cannot reach the server. Please try again." },
      };
    }
  };

  // Toast notification (one timer, so a new toast never gets cut short by an old one)
  let toastTimer;

  const showToast = (message, type = "success") => {
    const toast = document.getElementById("toast");

    if (!toast) {
      return;
    }

    clearTimeout(toastTimer);

    // Sit just below the top bar so it never covers the bar's buttons. If the
    // bar has scrolled out of view, sit just below the top of the screen.
    const topbar = document.querySelector(".topbar");
    const barBottom = topbar
      ? Math.max(topbar.getBoundingClientRect().bottom, 0)
      : 0;

    toast.style.top = `${Math.max(barBottom + 12, 20)}px`;

    toast.textContent = message;
    toast.classList.remove("success", "error");
    toast.classList.add(type, "show");

    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  };

  // Disables a button while an async task runs (prevents double clicks)
  const withBusy = async (button, task) => {
    if (button.disabled) {
      return;
    }

    button.disabled = true;

    try {
      return await task();
    } finally {
      button.disabled = false;
    }
  };

  // Tiny DOM builder, so pages never need innerHTML with server data.
  //   el("button", { className: "x", text: "Save", onClick: fn }, child, child)
  // "text" sets textContent, onXxx adds a listener, anything else is set as a
  // property (type, disabled, title...) or falls back to an attribute.
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);

    Object.entries(props).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) {
        return;
      }

      if (key === "className") {
        node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (/^on[A-Z]/.test(key)) {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    });

    children.flat().forEach((child) => {
      if (child !== null && child !== undefined && child !== false) {
        node.append(child);
      }
    });

    return node;
  };

  // Search-as-you-type dropdown with keyboard support (arrows, Enter, Esc)
  // and click-outside to close.
  //   getItems: () => array of items to search
  //   getLabel: item => text shown and searched
  //   onType:   called on every keystroke (use it to clear a stored id)
  //   onSelect: called with the chosen item
  const createAutocomplete = ({
    input,
    list,
    getItems,
    getLabel = (item) => item,
    onType,
    onSelect,
  }) => {
    let activeIndex = -1;

    const close = () => {
      list.innerHTML = "";
      activeIndex = -1;
    };

    const highlight = (index) => {
      const options = [...list.children];

      options.forEach((option, i) =>
        option.classList.toggle("active", i === index),
      );
      activeIndex = index;

      if (options[index]) {
        options[index].scrollIntoView({ block: "nearest" });
      }
    };

    input.addEventListener("input", () => {
      if (onType) {
        onType();
      }

      close();

      const query = input.value.trim().toLowerCase();

      if (!query) {
        return;
      }

      getItems()
        .filter((item) => getLabel(item).toLowerCase().includes(query))
        .forEach((item) => {
          const option = document.createElement("div");

          option.textContent = getLabel(item);

          option.addEventListener("click", () => {
            input.value = getLabel(item);
            close();

            if (onSelect) {
              onSelect(item);
            }
          });

          list.appendChild(option);
        });
    });

    input.addEventListener("keydown", (event) => {
      const count = list.children.length;

      if (event.key === "Escape") {
        close();
      }

      if (!count) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        highlight((activeIndex + 1) % count);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        highlight((activeIndex - 1 + count) % count);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        list.children[activeIndex].click();
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target !== input && !list.contains(event.target)) {
        close();
      }
    });

    return { close };
  };

  // Admin panels behave like tabs: show one, hide the rest
  const PANEL_IDS = [
    "usersContainer",
    "createUserContainer",
    "classesContainer",
    "timetableContainer",
    "sessionsContainer",
    "instructorScheduleContainer",
    "instructorTimetablesContainer",
    "instructorReportContainer",
    "summaryContainer",
    "instructorSummaryContainer",
    "attendanceContainer",
  ];

  const showPanel = (panelId, button) => {
    PANEL_IDS.forEach((id) => {
      const panel = document.getElementById(id);

      if (panel) {
        panel.style.display = id === panelId ? "block" : "none";
      }
    });

    document.querySelectorAll(".admin-actions button").forEach((b) => {
      b.classList.toggle("active", b === button);
      b.setAttribute("aria-pressed", String(b === button));
    });
  };

  // ---------- Classes ----------
  // Several panels need the class list (users, timetables, classes), so it is
  // fetched once and reused. Pass force = true after creating a class.
  let classCache = null;

  const getClasses = async (force = false) => {
    if (classCache && !force) {
      return { classes: classCache, error: "" };
    }

    const res = await api("/classes");

    if (!res.ok) {
      return {
        classes: classCache || [],
        error: res.data.message || "Could not load classes",
      };
    }

    classCache = res.data.classes || [];

    return { classes: classCache, error: "" };
  };

  // Fills a <select> with a blank first option plus one option per item.
  // `selected` is only applied if it matches one of the items.
  const fillSelect = (
    select,
    items,
    {
      placeholder = "Select",
      getValue = (item) => item._id,
      getLabel = (item) => item.name,
      selected = "",
    } = {},
  ) => {
    select.replaceChildren(
      el("option", { value: "", text: placeholder }),
      ...items.map((item) =>
        el("option", { value: getValue(item), text: getLabel(item) }),
      ),
    );

    select.value = items.some(
      (item) => String(getValue(item)) === String(selected),
    )
      ? selected
      : "";
  };

  // Table cell. Status-like words (Active, Late, Valid...) become colored badges.
  const BADGE_TONES = {
    active: "success",
    present: "success",
    valid: "success",
    yes: "success",
    completed: "success",
    late: "warn",
    pending: "warn",
    postponed: "warn",
    absent: "danger",
    invalid: "danger",
    suspended: "danger",
    blocked: "danger",
    cancelled: "danger",
    inactive: "muted",
    no: "muted",
    scheduled: "muted",
    "not checked in": "muted",
    "not started": "muted",
    manual: "muted",
    automatic: "muted",
    student: "role",
    instructor: "role",
    admin: "role",
  };

  const makeCell = (content = "") => {
    const cell = document.createElement("td");

    if (content instanceof Node) {
      cell.appendChild(content);
      return cell;
    }

    const text = String(content == null ? "" : content).trim();
    const tone = BADGE_TONES[text.toLowerCase()];

    if (!tone) {
      cell.textContent = text;
      return cell;
    }

    const badge = document.createElement("span");

    badge.className = `badge badge-${tone}`;
    badge.textContent = text;
    cell.appendChild(badge);

    return cell;
  };

  // Signed-in user cached by the login page (UI only, the server is the authority)
  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null; // corrupted value
    }
  };

  // ---------- Dates ----------
  // The backend stores a session's date as midnight UTC of the Lagos calendar
  // day, so it is read back in UTC. Real moments (sign in / out) are shown in
  // Lagos time, whatever timezone the browser is in.
  const NA = "N/A";
  const LOCALE = "en-GB";
  const TIME_ZONE = "Africa/Lagos";

  const toDate = (value) => {
    const date = value ? new Date(value) : null;

    return date && !isNaN(date) ? date : null;
  };

  const formatDate = (value) => {
    const date = toDate(value);

    return date
      ? date.toLocaleDateString(LOCALE, {
          timeZone: "UTC",
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : NA;
  };

  const formatDateTime = (value) => {
    const date = toDate(value);

    return date
      ? date.toLocaleString(LOCALE, {
          timeZone: TIME_ZONE,
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : NA;
  };

  // Time of day only, e.g. "08:07 am"
  const formatClock = (value) => {
    const date = toDate(value);

    return date
      ? date.toLocaleTimeString(LOCALE, {
          timeZone: TIME_ZONE,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : NA;
  };

  // ---------- Attendance report rows (admin + student share these) ----------
  // classAttended is null until the student has checked out
  const classAttendedLabel = (record) => {
    if (record.classAttended === true) {
      return "Yes";
    }

    return record.classAttended === false ? "No" : "Pending";
  };

  // One <tr> for an attendance record. Pass { studentName } to add the Student
  // column and { className } to add the Class column.
  // Column order matches the table headers in dashboard.html.
  const buildAttendanceRow = (record, options = {}) => {
    const session = record.session;

    const values = [session ? session.course : NA];

    // Optional Class column, right after Course
    if ("className" in options) {
      values.push(options.className || NA);
    }

    values.push(
      session ? formatDate(session.date) : NA,
      session ? `${session.startTime}\u00a0\u2013\u00a0${session.endTime}` : NA,
      formatDateTime(record.signIn),
      formatDateTime(record.signOut),
      record.signOutMethod || NA,
      record.status || NA,
      classAttendedLabel(record),
      record.isValid ? "Valid" : "Invalid",
    );

    if ("studentName" in options) {
      values.unshift(options.studentName == null ? NA : options.studentName);
    }

    const row = document.createElement("tr");

    values.forEach((value) => row.appendChild(makeCell(value)));

    // Hovering "Invalid" explains why
    if (!record.isValid && record.invalidationReason) {
      row.lastElementChild.title = record.invalidationReason;
    }

    return row;
  };

  // A full-width "nothing here" row for empty tables
  const emptyRow = (columns, message) => {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    row.className = "empty-row";
    cell.colSpan = columns;
    cell.textContent = message;
    row.appendChild(cell);

    return row;
  };

  // Shown while a table's data is loading, and if loading fails. Without these
  // a slow or failed request leaves the table looking empty or frozen.
  const loadingRow = (columns, message = "Loading...") => {
    const row = emptyRow(columns, message);

    row.classList.add("loading");
    row.setAttribute("role", "status");

    return row;
  };

  const errorRow = (columns, message) => {
    const row = emptyRow(columns, message);

    row.classList.add("error-row");

    return row;
  };

  // ---------- Password fields: show / hide ----------
  const EYE =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.4 0-10-7-10-7a18.5 18.5 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';

  const paintPasswordToggle = (input, button) => {
    const visible = input.type === "text";

    button.innerHTML = visible ? EYE_OFF : EYE;
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute(
      "aria-label",
      visible ? "Hide password" : "Show password",
    );
    button.title = visible ? "Hide password" : "Show password";
  };

  // Puts an eye button inside every password field on the page
  const addPasswordToggles = () => {
    document.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.closest(".password-field")) {
        return;
      }

      const wrapper = el("div", { className: "password-field" });
      const button = el("button", {
        type: "button",
        className: "password-toggle",
      });

      input.parentNode.insertBefore(wrapper, input);
      wrapper.append(input, button);
      paintPasswordToggle(input, button);

      button.addEventListener("click", () => {
        input.type = input.type === "password" ? "text" : "password";
        paintPasswordToggle(input, button);
        input.focus();
      });
    });
  };

  // A form that is reset (e.g. the change-password dialog closing) must go
  // back to hidden, so a password is never left showing for the next person
  document.addEventListener("reset", (event) => {
    event.target.querySelectorAll?.(".password-field").forEach((field) => {
      const input = field.querySelector("input");

      input.type = "password";
      paintPasswordToggle(input, field.querySelector(".password-toggle"));
    });
  });

  document.addEventListener("DOMContentLoaded", () => {
    addPasswordToggles();

  });

  // Screen readers announce which column a cell belongs to when headers are
  // marked as column headers
  document.addEventListener("DOMContentLoaded", () => {
    document
      .querySelectorAll("thead th")
      .forEach((th) => th.setAttribute("scope", "col"));
  });

  window.NIIT = {
    API_BASE,
    api,
    showToast,
    withBusy,
    el,
    createAutocomplete,
    getClasses,
    fillSelect,
    showPanel,
    makeCell,
    getUser,
    formatDate,
    formatDateTime,
    formatClock,
    buildAttendanceRow,
    emptyRow,
    loadingRow,
    errorRow,
  };
})();