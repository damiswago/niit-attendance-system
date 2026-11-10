// Admin: list classes (with student / timetable counts), add new ones, rename
// them, and delete empty ones.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("classesContainer")) {
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
    getClasses,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  const COLUMNS = 4;

  // ---------- DOM ----------
  const manageButton = byId("manageClassesButton");
  const tableBody = byId("classesTableBody");
  const form = byId("createClassForm");
  const nameInput = byId("className");
  const submitButton = form.querySelector('button[type="submit"]');

  const editDialog = byId("classEditDialog");
  const editForm = byId("classEditForm");
  const editName = byId("classEditName");
  const editError = byId("classEditError");
  const editSave = byId("classEditSave");

  let editing = null;

  const idOf = (ref) => (ref && ref._id) || ref || "";

  // ---------- Render ----------
  const countBy = (items, classId) =>
    items.filter((item) => idOf(item.class) === classId).length;

  const actionButton = (label, onClick) => {
    const button = el("button", { type: "button", text: label });

    button.addEventListener("click", () => withBusy(button, onClick));

    return button;
  };

  const render = ({ classes, students, timetables }) => {
    tableBody.replaceChildren();

    classes.forEach((item) => {
      const row = document.createElement("tr");
      const actions = makeCell("");

      actions.append(
        actionButton("Rename", async () => openRename(item)),
        actionButton("Delete", () => removeClass(item)),
      );

      row.append(
        makeCell(item.name),
        makeCell(String(countBy(students, item._id))),
        makeCell(String(countBy(timetables, item._id))),
        actions,
      );
      tableBody.appendChild(row);
    });

    // Records with no class need attention, so they get their own row
    const unassignedStudents = students.filter((s) => !idOf(s.class)).length;
    const unassignedTimetables = timetables.filter(
      (t) => !idOf(t.class),
    ).length;

    if (unassignedStudents || unassignedTimetables) {
      const row = document.createElement("tr");

      row.append(
        makeCell("No class assigned"),
        makeCell(String(unassignedStudents)),
        makeCell(String(unassignedTimetables)),
        makeCell("-"),
      );
      tableBody.appendChild(row);
    }

    if (!tableBody.children.length) {
      tableBody.appendChild(
        emptyRow(COLUMNS, "No classes yet. Add your first class above."),
      );
    }
  };

  // ---------- Data ----------
  const load = async (force = false) => {
    tableBody.replaceChildren(loadingRow(COLUMNS));

    const [classResult, usersRes, timetablesRes] = await Promise.all([
      getClasses(force),
      api("/users"),
      api("/timetable"),
    ]);

    if (classResult.error) {
      showToast(classResult.error, "error");
    } else if (!usersRes.ok || !timetablesRes.ok) {
      showToast("Some counts could not be loaded", "error");
    }

    render({
      classes: classResult.classes,
      students: (usersRes.data.users || []).filter((u) => u.role === "student"),
      timetables: (timetablesRes.data.timetables || []).filter(
        (t) => t.isActive,
      ),
    });
  };

  const createClass = async (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();

    if (!name) {
      showToast("Enter a class name", "error");
      return;
    }

    await withBusy(submitButton, async () => {
      const res = await api("/classes", { method: "POST", body: { name } });

      showToast(
        res.data.message ||
          (res.ok ? "Class created" : "Could not create class"),
        res.ok ? "success" : "error",
      );

      if (res.ok) {
        form.reset();
        await load(true);
      }
    });
  };

  // ---------- Rename ----------
  const showDialog = () =>
    typeof editDialog.showModal === "function"
      ? editDialog.showModal()
      : editDialog.setAttribute("open", "");

  const closeDialog = () =>
    typeof editDialog.close === "function"
      ? editDialog.close()
      : editDialog.removeAttribute("open");

  const openRename = (item) => {
    editing = item;
    editName.value = item.name;
    editError.textContent = "";
    showDialog();
    editName.focus();
    editName.select();
  };

  const saveRename = async (event) => {
    event.preventDefault();

    const name = editName.value.trim();

    if (!name) {
      editError.textContent = "Enter a class name.";
      return;
    }

    if (name === editing.name) {
      closeDialog();
      return;
    }

    await withBusy(editSave, async () => {
      const res = await api(`/classes/${editing._id}`, {
        method: "PATCH",
        body: { name },
      });

      if (!res.ok) {
        // A toast would sit behind the open dialog, so the error goes inside it
        editError.textContent = res.data.message || "Could not rename the class.";
        return;
      }

      closeDialog();
      showToast(res.data.message || "Class renamed");
      await load(true);
    });
  };

  // ---------- Delete ----------
  const removeClass = async (item) => {
    if (
      !window.confirm(`Delete the class "${item.name}"? This can't be undone.`)
    ) {
      return;
    }

    const res = await api(`/classes/${item._id}`, { method: "DELETE" });

    // A class that still has students or timetables is refused, and the
    // message says how many
    showToast(
      res.data.message ||
        (res.ok ? "Class deleted" : "Could not delete the class"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      await load(true);
    }
  };

  // ---------- Wire up ----------
  manageButton.addEventListener("click", async () => {
    showPanel("classesContainer", manageButton);
    await load(true);
  });

  form.addEventListener("submit", createClass);
  editForm.addEventListener("submit", saveRename);
  byId("classEditCancel").addEventListener("click", closeDialog);
});