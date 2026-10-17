// Admin: user list (change a student's class, activate / deactivate) and
// user creation.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("usersContainer")) {
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
    getUser,
    getClasses,
    fillSelect,
  } = NIIT;
  const byId = (id) => document.getElementById(id);

  const me = getUser();

  // ---------- DOM ----------
  const manageButton = byId("manageUsersButton");
  const createButton = byId("createUserButton");
  const tableBody = byId("usersTableBody");
  const form = byId("createUserForm");
  const submitButton = form.querySelector('button[type="submit"]');
  const roleSelect = byId("userRole");
  const classGroup = byId("userClassGroup");
  const classSelect = byId("userClass");

  // ---------- State ----------
  const state = { users: [], classes: [] };

  const idOf = (ref) => (ref && ref._id) || ref || "";

  // ---------- Classes ----------
  const loadClasses = async (force = false) => {
    const { classes, error } = await getClasses(force);

    if (error) {
      showToast(error, "error");
    }

    state.classes = classes;
  };

  // Students pick a class when they are created; other roles never have one
  const syncClassField = () => {
    const isStudent = roleSelect.value === "student";

    classGroup.hidden = !isStudent;
    classSelect.required = isStudent;
  };

  const fillCreateClassSelect = () =>
    fillSelect(classSelect, state.classes, {
      placeholder: state.classes.length
        ? "Select class"
        : "No classes yet - add one first",
      selected: classSelect.value,
    });

  // ---------- Render ----------
  const makeButton = (
    label,
    onClick,
    { disabled = false, title = "" } = {},
  ) => {
    const button = el("button", {
      type: "button",
      text: label,
      disabled,
      title,
    });

    button.addEventListener("click", () => withBusy(button, onClick));

    return button;
  };

  // Students get a dropdown that saves as soon as it changes
  const classCell = (user) => {
    if (user.role !== "student") {
      return makeCell("-");
    }

    const select = el("select", {
      className: "inline-select",
      "aria-label": `Class for ${user.name}`,
    });

    const sync = () => select.classList.toggle("unassigned", !select.value);

    fillSelect(select, state.classes, {
      placeholder: "Unassigned",
      selected: idOf(user.class),
    });
    sync();

    select.addEventListener("change", () => {
      sync();
      changeClass(user, select);
    });

    return makeCell(select);
  };

  const renderUsers = () => {
    tableBody.replaceChildren();

    if (!state.users.length) {
      tableBody.appendChild(emptyRow(6, "No users found."));
      return;
    }

    state.users.forEach((user) => {
      const isSelf = Boolean(me) && me.id === user._id;
      const row = document.createElement("tr");
      const actionsCell = makeCell("");

      actionsCell.appendChild(
        makeButton(
          user.status === "active" ? "Deactivate" : "Activate",
          () => toggleStatus(user),
          {
            disabled: isSelf,
            title: isSelf ? "You can't deactivate your own account" : "",
          },
        ),
      );

      row.appendChild(makeCell(user.name));
      row.appendChild(makeCell(user.email));
      row.appendChild(makeCell(user.role));
      row.appendChild(classCell(user));
      row.appendChild(makeCell(user.status));
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  };

  // ---------- Data ----------
  const loadUsers = async () => {
    tableBody.replaceChildren(loadingRow(6));

    const [res] = await Promise.all([api("/users"), loadClasses()]);

    if (!res.ok) {
      const message = res.data.message || "Could not load users";

      showToast(message, "error");
      tableBody.replaceChildren(errorRow(6, message));
      return;
    }

    state.users = res.data.users || [];
    renderUsers();
  };

  // ---------- Actions ----------
  const changeClass = async (user, select) => {
    const previous = idOf(user.class);
    const res = await api(`/users/${user._id}`, {
      method: "PATCH",
      body: { class: select.value || null },
    });

    showToast(
      res.data.message || (res.ok ? "Class updated" : "Could not update class"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      user.class = res.data.user.class;
      return;
    }

    // Put the dropdown back so it never shows something that wasn't saved
    select.value = previous;
    select.classList.toggle("unassigned", !select.value);
  };

  const toggleStatus = async (user) => {
    const deactivating = user.status === "active";

    if (
      deactivating &&
      !window.confirm(
        `Deactivate ${user.name}? They will be signed out and won't be able to log in.`,
      )
    ) {
      return;
    }

    const res = await api(`/users/${user._id}`, {
      method: "PATCH",
      body: { status: deactivating ? "inactive" : "active" },
    });

    showToast(
      res.data.message || (res.ok ? "User updated" : "Could not update user"),
      res.ok ? "success" : "error",
    );

    if (res.ok) {
      user.status = res.data.user.status;
      renderUsers();
    }
  };

  const createUser = async (event) => {
    event.preventDefault();

    const role = roleSelect.value;

    const body = {
      name: byId("userName").value.trim(),
      email: byId("userEmail").value.trim(),
      password: byId("userPassword").value,
      role,
    };

    if (role === "student") {
      if (!classSelect.value) {
        showToast("Please choose a class for the student", "error");
        return;
      }

      body.class = classSelect.value;
    }

    await withBusy(submitButton, async () => {
      const res = await api("/users", { method: "POST", body });

      showToast(
        res.data.message || (res.ok ? "User created" : "Could not create user"),
        res.ok ? "success" : "error",
      );

      if (res.ok) {
        form.reset();
        syncClassField();
        fillCreateClassSelect();
      }
    });
  };

  // ---------- Wire up ----------
  manageButton.addEventListener("click", async () => {
    showPanel("usersContainer", manageButton);
    await loadUsers();
  });

  createButton.addEventListener("click", async () => {
    showPanel("createUserContainer", createButton);
    syncClassField();
    await loadClasses();
    fillCreateClassSelect();
  });

  roleSelect.addEventListener("change", syncClassField);
  form.addEventListener("submit", createUser);
});