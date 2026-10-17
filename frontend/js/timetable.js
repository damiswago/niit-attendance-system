// Admin: timetable list, activate/deactivate, create and edit.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("timetableContainer")) {
    return;
  }

  const {
    api,
    showToast,
    withBusy,
    createAutocomplete,
    showPanel,
    makeCell,
    emptyRow,
    loadingRow,
    errorRow,
    getClasses,
    fillSelect,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const manageButton = byId("manageTimetableButton");
  const tableBody = byId("timetableTableBody");
  const toggleButton = byId("createTimetableButton");
  const formPanel = byId("createTimetableContainer");
  const formTitle = byId("timetableFormTitle");
  const form = byId("createTimetableForm");
  const submitButton = byId("submitTimetableButton");
  const courseInput = byId("timetableCourse");
  const instructorInput = byId("timetableInstructor");
  const startInput = byId("timetableStartTime");
  const endInput = byId("timetableEndTime");
  const fromInput = byId("effectiveFrom");
  const untilInput = byId("effectiveUntil");
  const classSelect = byId("timetableClass");
  const dayButtons = document.querySelectorAll("#dayButtons button");

  // ---------- State ----------
  const state = {
    timetables: [],
    instructors: [],
    classes: [],
    selectedDays: [],
    editingId: null,
  };

  // ---------- Autocomplete ----------
  const courseSearch = createAutocomplete({
    input: courseInput,
    list: byId("courseSuggestions"),
    getItems: () => [...new Set(state.timetables.map((t) => t.course))],
  });

  const instructorSearch = createAutocomplete({
    input: instructorInput,
    list: byId("instructorSuggestions"),
    getItems: () => state.instructors,
    getLabel: (instructor) => instructor.name,
    // typing invalidates the previously chosen instructor
    onType: () => {
      instructorInput.dataset.instructorId = "";
    },
    onSelect: (instructor) => {
      instructorInput.dataset.instructorId = instructor._id;
    },
  });

  // ---------- Helpers ----------
  const idOf = (ref) => (ref && ref._id) || ref;

  const toDateInput = (value) => {
    const date = new Date(value);

    return value && !isNaN(date) ? date.toISOString().slice(0, 10) : "";
  };

  const syncDayButtons = () => {
    dayButtons.forEach((button) => {
      button.classList.toggle(
        "selected",
        state.selectedDays.includes(button.dataset.day),
      );
    });
  };

  const setFormOpen = (open) => {
    formPanel.style.display = open ? "block" : "none";
    toggleButton.setAttribute("aria-expanded", String(open));

    // Open, the button is just an x (its label is hidden), so give it a name
    // that says what it does. Closed, its visible text already names it.
    if (open) {
      toggleButton.setAttribute("aria-label", "Close form");
      toggleButton.title = "Close";
    } else {
      toggleButton.removeAttribute("aria-label");
      toggleButton.removeAttribute("title");
    }
  };

  const resetForm = () => {
    state.editingId = null;
    state.selectedDays = [];

    form.reset();
    instructorInput.dataset.instructorId = "";
    courseSearch.close();
    instructorSearch.close();

    formTitle.textContent = "Create Timetable";
    submitButton.textContent = "Create Timetable";

    syncDayButtons();
  };

  const readForm = () => {
    const data = {
      course: courseInput.value.trim(),
      class: classSelect.value,
      instructor: instructorInput.dataset.instructorId || "",
      daysOfWeek: [...state.selectedDays],
      startTime: startInput.value,
      endTime: endInput.value,
      effectiveFrom: fromInput.value,
      effectiveUntil: untilInput.value || null,
    };

    if (
      !data.course ||
      !data.class ||
      !data.daysOfWeek.length ||
      !data.startTime ||
      !data.endTime ||
      !data.effectiveFrom
    ) {
      return { error: "Please complete all required fields" };
    }

    if (!data.instructor) {
      return { error: "Please choose an instructor from the suggestions" };
    }

    if (data.endTime <= data.startTime) {
      return { error: "End time must be after the start time" };
    }

    if (data.effectiveUntil && data.effectiveUntil < data.effectiveFrom) {
      return { error: "Effective Until can't be before Effective From" };
    }

    return { data };
  };

  const makeButton = (label, onClick) => {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => withBusy(button, onClick));

    return button;
  };

  // ---------- Data ----------
  const loadTimetables = async () => {
    tableBody.replaceChildren(loadingRow(8));

    const res = await api("/timetable");

    if (!res.ok) {
      const message = res.data.message || "Could not load timetables";

      showToast(message, "error");
      tableBody.replaceChildren(errorRow(8, message));
      return;
    }

    state.timetables = res.data.timetables || [];
    renderTimetables();
  };

  const loadInstructors = async () => {
    const res = await api("/users");

    if (!res.ok) {
      showToast(res.data.message || "Could not load instructors", "error");
      return;
    }

    state.instructors = (res.data.users || []).filter(
      (user) => user.role === "instructor" && user.status === "active",
    );
  };

  const loadClasses = async () => {
    const { classes, error } = await getClasses();

    if (error) {
      showToast(error, "error");
    }

    state.classes = classes;

    fillSelect(classSelect, state.classes, {
      placeholder: state.classes.length
        ? "Select class"
        : "No classes yet - add one first",
      selected: classSelect.value,
    });
  };

  // ---------- Render ----------
  const renderTimetables = () => {
    tableBody.innerHTML = "";

    if (!state.timetables.length) {
      tableBody.appendChild(emptyRow(8, "No timetables yet."));
      return;
    }

    state.timetables.forEach((timetable) => {
      const row = document.createElement("tr");
      const actionsCell = makeCell("");

      actionsCell.appendChild(
        makeButton(timetable.isActive ? "Deactivate" : "Activate", () =>
          toggleActive(timetable),
        ),
      );
      actionsCell.appendChild(makeButton("Edit", () => startEdit(timetable)));

      row.appendChild(makeCell(timetable.course));
      row.appendChild(
        makeCell((timetable.class && timetable.class.name) || "Unassigned"),
      );
      row.appendChild(
        makeCell((timetable.instructor && timetable.instructor.name) || "N/A"),
      );
      row.appendChild(makeCell(timetable.daysOfWeek.join(", ")));
      row.appendChild(makeCell(timetable.startTime));
      row.appendChild(makeCell(timetable.endTime));
      row.appendChild(makeCell(timetable.isActive ? "Active" : "Inactive"));
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  // ---------- Actions ----------
  const toggleActive = async (timetable) => {
    const action = timetable.isActive ? "deactivate" : "activate";

    const res = await api(`/timetable/${timetable._id}/${action}`, {
      method: "PATCH",
    });

    showToast(
      res.data.message || (res.ok ? "Timetable updated" : "Update failed"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      await loadTimetables();
    }
  };

  const startEdit = async (timetable) => {
    await Promise.all([loadInstructors(), loadClasses()]);
    resetForm();

    const instructorId = idOf(timetable.instructor);
    const instructor = state.instructors.find((i) => i._id === instructorId);
    const instructorName =
      (instructor && instructor.name) ||
      (timetable.instructor && timetable.instructor.name) ||
      "";

    state.editingId = timetable._id;
    state.selectedDays = [...timetable.daysOfWeek];

    courseInput.value = timetable.course;
    classSelect.value = idOf(timetable.class) || "";
    instructorInput.value = instructorName;
    instructorInput.dataset.instructorId = instructorName ? instructorId : "";
    startInput.value = timetable.startTime;
    endInput.value = timetable.endTime;
    fromInput.value = toDateInput(timetable.effectiveFrom);
    untilInput.value = toDateInput(timetable.effectiveUntil);

    formTitle.textContent = "Edit Timetable";
    submitButton.textContent = "Update Timetable";

    syncDayButtons();
    setFormOpen(true);
    formPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const toggleForm = async () => {
    if (formPanel.style.display === "block") {
      setFormOpen(false);
      resetForm();
      return;
    }

    resetForm();
    setFormOpen(true);
    await Promise.all([loadInstructors(), loadClasses()]);
  };

  const submitForm = async (event) => {
    event.preventDefault();

    const { data, error } = readForm();

    if (error) {
      showToast(error, "error");
      return;
    }

    await withBusy(submitButton, async () => {
      const editing = Boolean(state.editingId);

      const res = await api(
        editing ? `/timetable/${state.editingId}` : "/timetable",
        { method: editing ? "PATCH" : "POST", body: data },
      );

      showToast(
        res.data.message ||
          (res.ok ? "Timetable saved" : "Could not save timetable"),
        res.ok ? "success" : "error",
      );

      if (!res.ok) {
        return;
      }

      resetForm();
      setFormOpen(false);
      await loadTimetables();
    });
  };

  // ---------- Wire up ----------
  manageButton.addEventListener("click", async () => {
    showPanel("timetableContainer", manageButton);
    await loadTimetables();
  });

  toggleButton.addEventListener("click", toggleForm);
  form.addEventListener("submit", submitForm);

  // Click a day to select it; click its x to remove it
  dayButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const day = button.dataset.day;

      if (event.target.closest(".remove-day")) {
        state.selectedDays = state.selectedDays.filter((d) => d !== day);
      } else if (!state.selectedDays.includes(day)) {
        state.selectedDays.push(day);
      }

      syncDayButtons();
    });
  });
});
