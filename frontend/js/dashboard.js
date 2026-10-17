// Dashboard page: session check, header, role gating and logout.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  const welcomeMessage = document.getElementById("welcomeMessage");

  if (!welcomeMessage) {
    return;
  }

  const { api, withBusy, getUser } = NIIT;
  const byId = (id) => document.getElementById(id);

  const goToLogin = () => {
    localStorage.removeItem("user");
    window.location.href = "index.html";
  };

  const user = getUser();

  if (!user || !user.role) {
    goToLogin();
    return;
  }

  // ---------- Header ----------
  welcomeMessage.textContent = `Welcome, ${user.name}`;
  byId("roleBadge").textContent = user.role;

  // ---------- Role gating ----------
  // UI only. The API must enforce roles on the server.
  const dashboards = {
    admin: "adminDashboard",
    instructor: "instructorDashboard",
    student: "studentDashboard",
  };

  Object.values(dashboards).forEach((id) => {
    byId(id).style.display = "none";
  });

  if (dashboards[user.role]) {
    byId(dashboards[user.role]).style.display = "block";
  } else {
    const notice = byId("roleNotice");

    notice.textContent = `The ${user.role} dashboard is coming soon.`;
    notice.hidden = false;
  }

  // ---------- Change password ----------
  const { showToast } = NIIT;
  const passwordDialog = byId("passwordDialog");
  const passwordForm = byId("passwordForm");
  const passwordError = byId("passwordError");
  const passwordSubmit = byId("passwordSubmit");

  const openPasswordDialog = () => {
    passwordForm.reset();
    passwordError.textContent = "";

    if (typeof passwordDialog.showModal === "function") {
      passwordDialog.showModal();
    } else {
      passwordDialog.setAttribute("open", "");
    }

    byId("currentPassword").focus();
  };

  const closePasswordDialog = () => {
    if (typeof passwordDialog.close === "function") {
      passwordDialog.close();
    } else {
      passwordDialog.removeAttribute("open");
    }

    passwordForm.reset(); // never leave passwords sitting in the fields
  };

  // Returns an error message, or "" when the form is fine. The server checks
  // all of this again; this only saves a round trip.
  const checkPasswordForm = ({ current, next, confirm }) => {
    if (!current || !next || !confirm) {
      return "Please fill in every field.";
    }

    // bcrypt only reads the first 72 bytes
    if (next.length < 8 || new TextEncoder().encode(next).length > 72) {
      return "The new password must be between 8 and 72 characters.";
    }

    if (next !== confirm) {
      return "The new passwords don't match.";
    }

    return next === current
      ? "The new password must be different from the current one."
      : "";
  };

  byId("changePasswordButton").addEventListener("click", openPasswordDialog);
  byId("passwordCancel").addEventListener("click", closePasswordDialog);

  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = {
      current: byId("currentPassword").value,
      next: byId("newPassword").value,
      confirm: byId("confirmPassword").value,
    };

    const problem = checkPasswordForm(values);

    passwordError.textContent = problem;

    if (problem) {
      return;
    }

    await withBusy(passwordSubmit, async () => {
      const res = await api("/auth/change-password", {
        method: "PATCH",
        body: { currentPassword: values.current, newPassword: values.next },
      });

      if (!res.ok) {
        // A toast would sit behind the open dialog
        passwordError.textContent =
          res.data.message || "Could not change the password.";
        return;
      }

      closePasswordDialog();
      showToast(res.data.message || "Password changed successfully");
    });
  });

  // ---------- Logout ----------
  const logoutButton = byId("logoutButton");

  logoutButton.addEventListener("click", () =>
    withBusy(logoutButton, async () => {
      await api("/auth/logout", { method: "POST" }); // never throws
      goToLogin(); // always leave, even if the request failed
    }),
  );
});