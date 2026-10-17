// Admin: list classes (with student / timetable counts) and add new ones.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("classesContainer")) {
    return;
  }

  const {
    api,
    showToast,
    withBusy,
    showPanel,
    makeCell,
    emptyRow,
    loadingRow,
    getClasses,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  // ---------- DOM ----------
  const manageButton = byId("manageClassesButton");
  const tableBody = byId("classesTableBody");
  const form = byId("createClassForm");
  const nameInput = byId("className");
  const submitButton = form.querySelector('button[type="submit"]');

  const idOf = (ref) => (ref && ref._id) || ref || "";

  // ---------- Render ----------
  const countBy = (items, classId) =>
    items.filter((item) => idOf(item.class) === classId).length;

  const render = ({ classes, students, timetables }) => {
    tableBody.replaceChildren();

    classes.forEach((item) => {
      const row = document.createElement("tr");

      row.appendChild(makeCell(item.name));
      row.appendChild(makeCell(String(countBy(students, item._id))));
      row.appendChild(makeCell(String(countBy(timetables, item._id))));
      tableBody.appendChild(row);
    });

    // Records with no class need attention, so they get their own row
    const unassignedStudents = students.filter((s) => !idOf(s.class)).length;
    const unassignedTimetables = timetables.filter(
      (t) => !idOf(t.class),
    ).length;

    if (unassignedStudents || unassignedTimetables) {
      const row = document.createElement("tr");

      row.appendChild(makeCell("No class assigned"));
      row.appendChild(makeCell(String(unassignedStudents)));
      row.appendChild(makeCell(String(unassignedTimetables)));
      tableBody.appendChild(row);
    }

    if (!tableBody.children.length) {
      tableBody.appendChild(
        emptyRow(3, "No classes yet. Add your first class above."),
      );
    }
  };

  // ---------- Data ----------
  const load = async (force = false) => {
    tableBody.replaceChildren(loadingRow(3));

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

  // ---------- Wire up ----------
  manageButton.addEventListener("click", async () => {
    showPanel("classesContainer", manageButton);
    await load(true);
  });

  form.addEventListener("submit", createClass);
});
