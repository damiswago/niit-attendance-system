// Admin: manage users (search, filter and page through them; edit a name or
// email; set someone's password; change a student's class; activate or
// deactivate) and create users.
// A user's ROLE cannot be changed: create a new account instead.
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
  const PAGE_SIZE = 15;
  const SEARCH_DELAY_MS = 300;

  // ---------- DOM ----------
  const manageButton = byId("manageUsersButton");
  const createButton = byId("createUserButton");
  const tableBody = byId("usersTableBody");

  const searchInput = byId("userSearch");
  const roleFilter = byId("userRoleFilter");
  const statusFilter = byId("userStatusFilter");
  const classFilter = byId("userClassFilter");
  const clearFilters = byId("userFiltersClear");
  const countLine = byId("usersCount");
  const pager = byId("usersPager");
  const prevButton = byId("usersPrev");
  const nextButton = byId("usersNext");
  const pageInfo = byId("usersPageInfo");

  const form = byId("createUserForm");
  const submitButton = form.querySelector('button[type="submit"]');
  const roleSelect = byId("userRole");
  const classGroup = byId("userClassGroup");
  const classSelect = byId("userClass");

  const editDialog = byId("userEditDialog");
  const editForm = byId("userEditForm");
  const editName = byId("userEditName");
  const editEmail = byId("userEditEmail");
  const editRole = byId("userEditRole");
  const editError = byId("userEditError");
  const editSave = byId("userEditSave");

  const passwordDialog = byId("userPasswordDialog");
  const passwordForm = byId("userPasswordForm");
  const passwordWho = byId("userPasswordWho");
  const passwordInput = byId("userNewPassword");
  const passwordError = byId("userPasswordError");
  const passwordSave = byId("userPasswordSave");
  const generateButton = byId("userGeneratePassword");

  // ---------- State ----------
  const state = {
    users: [],
    classes: [],
    pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 },
    requestId: 0, // so a slow older search can't overwrite a newer one
    editing: null,
    settingPassword: null,
  };

  const idOf = (ref) => (ref && ref._id) || ref || "";
  const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  const openDialog = (dialog) =>
    typeof dialog.showModal === "function"
      ? dialog.showModal()
      : dialog.setAttribute("open", "");

  const closeDialog = (dialog) =>
    typeof dialog.close === "function"
      ? dialog.close()
      : dialog.removeAttribute("open");

  // ---------- Classes ----------
  const loadClasses = async (force = false) => {
    const { classes, error } = await getClasses(force);

    if (error) {
      showToast(error, "error");
    }

    state.classes = classes;
  };

  // The class filter: every class, plus "students with no class"
  const fillClassFilter = () => {
    const previous = classFilter.value;

    fillSelect(classFilter, state.classes, {
      placeholder: "All classes",
      selected: previous,
    });
    classFilter.insertBefore(
      el("option", { value: "none", text: "No class (students)" }),
      classFilter.options[1] || null,
    );
    classFilter.value = previous;
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
  const makeButton = (label, onClick, { disabled = false, title = "" } = {}) => {
    const button = el("button", { type: "button", text: label, disabled, title });

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
      tableBody.appendChild(emptyRow(6, "No users match."));
      return;
    }

    state.users.forEach((user) => {
      const isSelf = Boolean(me) && me.id === user._id;
      const row = document.createElement("tr");
      const actionsCell = makeCell("");

      actionsCell.append(
        makeButton("Edit", async () => openEdit(user)),
        makeButton("Set password", async () => openPassword(user), {
          disabled: isSelf,
          title: isSelf ? "Use Change password in the top bar for your own account" : "",
        }),
        makeButton(
          user.status === "active" ? "Deactivate" : "Activate",
          () => toggleStatus(user),
          {
            disabled: isSelf,
            title: isSelf ? "You can't deactivate your own account" : "",
          },
        ),
      );

      row.append(
        makeCell(user.name),
        makeCell(user.email),
        makeCell(user.role),
        classCell(user),
        makeCell(user.status),
        actionsCell,
      );

      tableBody.appendChild(row);
    });
  };

  const renderPager = () => {
    const { page, limit, total, totalPages } = state.pagination;

    countLine.textContent = total
      ? `Showing ${(page - 1) * limit + 1}\u2013${Math.min(page * limit, total)} of ${total} ${total === 1 ? "user" : "users"}`
      : "No users match";

    pager.hidden = totalPages <= 1;
    pageInfo.textContent = `Page ${page} of ${totalPages}`;
    prevButton.disabled = page <= 1;
    nextButton.disabled = page >= totalPages;
  };

  // ---------- Data ----------
  const loadUsers = async (page = 1) => {
    const requestId = ++state.requestId;
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });

    const search = searchInput.value.trim();

    if (search) {
      params.set("search", search);
    }

    [
      ["role", roleFilter.value],
      ["status", statusFilter.value],
      ["class", classFilter.value],
    ].forEach(([name, value]) => value && params.set(name, value));

    tableBody.replaceChildren(loadingRow(6));
    prevButton.disabled = true;
    nextButton.disabled = true;

    const [res] = await Promise.all([api(`/users?${params}`), loadClasses()]);

    if (requestId !== state.requestId) {
      return; // a newer search is already on its way
    }

    if (!res.ok) {
      const message = res.data.message || "Could not load users";

      showToast(message, "error");
      tableBody.replaceChildren(errorRow(6, message));
      return;
    }

    state.users = res.data.users || [];
    state.pagination = res.data.pagination;

    // e.g. the last person on the last page was just filtered out
    if (!state.users.length && state.pagination.total > 0 && page > 1) {
      return loadUsers(state.pagination.totalPages);
    }

    fillClassFilter();
    renderUsers();
    renderPager();
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

  // ----- edit name / email -----
  const openEdit = (user) => {
    state.editing = user;
    editName.value = user.name;
    editEmail.value = user.email;
    editRole.textContent = `Role: ${capitalise(user.role)}. A user's role can't be changed.`;
    editError.textContent = "";
    openDialog(editDialog);
    editName.focus();
  };

  const saveEdit = async (event) => {
    event.preventDefault();

    const user = state.editing;
    const name = editName.value.trim();
    const email = editEmail.value.trim();

    if (!name || !email) {
      editError.textContent = "Name and email can't be empty.";
      return;
    }

    const body = {};

    if (name !== user.name) {
      body.name = name;
    }

    if (email.toLowerCase() !== user.email) {
      body.email = email;
    }

    if (!Object.keys(body).length) {
      closeDialog(editDialog);
      return;
    }

    await withBusy(editSave, async () => {
      const res = await api(`/users/${user._id}`, { method: "PATCH", body });

      if (!res.ok) {
        // A toast would sit behind the open dialog, so the error goes inside it
        editError.textContent = res.data.message || "Could not save the changes.";
        return;
      }

      user.name = res.data.user.name;
      user.email = res.data.user.email;

      closeDialog(editDialog);
      showToast(res.data.message || "User updated");
      renderUsers();
    });
  };

  // ----- set a password for someone else -----
  // No look-alike characters (0/O, 1/l/I), so it can be read out or typed
  const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  const generatePassword = (length = 14) => {
    const numbers = new Uint32Array(length);

    crypto.getRandomValues(numbers);

    return Array.from(
      numbers,
      (number) => PASSWORD_ALPHABET[number % PASSWORD_ALPHABET.length],
    ).join("");
  };

  const openPassword = (user) => {
    state.settingPassword = user;
    passwordWho.textContent = `${user.name} (${user.email})`;
    passwordForm.reset();
    passwordError.textContent = "";
    generateButton.textContent = "Generate a strong password";
    openDialog(passwordDialog);
    passwordInput.focus();
  };

  const makePassword = async () => {
    const password = generatePassword();

    passwordInput.value = password;

    // Show it, so the administrator can read it out or copy it
    if (passwordInput.type === "password") {
      passwordInput.parentElement.querySelector(".password-toggle").click();
    }

    let copied = false;

    try {
      await navigator.clipboard.writeText(password);
      copied = true;
    } catch {
      // Clipboard not available: they can still copy it from the field
    }

    generateButton.textContent = copied
      ? "Generated and copied. Give it to them securely."
      : "Generated. Copy it before you save.";
  };

  const savePassword = async (event) => {
    event.preventDefault();

    const user = state.settingPassword;
    const password = passwordInput.value;
    const bytes = new TextEncoder().encode(password).length;

    if (password.length < 8 || bytes > 72) {
      passwordError.textContent = "The password must be between 8 and 72 characters.";
      return;
    }

    await withBusy(passwordSave, async () => {
      const res = await api(`/users/${user._id}/password`, {
        method: "PATCH",
        body: { newPassword: password },
      });

      if (!res.ok) {
        passwordError.textContent =
          res.data.message || "Could not set the password.";
        return;
      }

      passwordForm.reset(); // never leave it sitting in the field
      closeDialog(passwordDialog);
      showToast(res.data.message || "Password updated");
    });
  };

  // ----- create a user -----
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
    await loadUsers(1);
  });

  createButton.addEventListener("click", async () => {
    showPanel("createUserContainer", createButton);
    syncClassField();
    await loadClasses();
    fillCreateClassSelect();
  });

  let searchTimer;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(1), SEARCH_DELAY_MS);
  });

  [roleFilter, statusFilter, classFilter].forEach((select) =>
    select.addEventListener("change", () => loadUsers(1)),
  );

  clearFilters.addEventListener("click", () => {
    searchInput.value = "";
    roleFilter.value = "";
    statusFilter.value = "";
    classFilter.value = "";
    loadUsers(1);
  });

  prevButton.addEventListener("click", () =>
    loadUsers(state.pagination.page - 1),
  );
  nextButton.addEventListener("click", () =>
    loadUsers(state.pagination.page + 1),
  );

  editForm.addEventListener("submit", saveEdit);
  byId("userEditCancel").addEventListener("click", () => closeDialog(editDialog));
  passwordForm.addEventListener("submit", savePassword);
  byId("userPasswordCancel").addEventListener("click", () =>
    closeDialog(passwordDialog),
  );
  generateButton.addEventListener("click", makePassword);
  passwordDialog.addEventListener("close", () => passwordForm.reset());

  roleSelect.addEventListener("change", syncClassField);
  form.addEventListener("submit", createUser);
});