// Login, forgot-password and reset-password pages.
// Needs: common.js (NIIT helpers) loaded first.
document.addEventListener("DOMContentLoaded", () => {
  const { api, withBusy } = NIIT;
  const byId = (id) => document.getElementById(id);

  // Shows an inline message; "error" / "success" pick the style
  const setMessage = (element, text, type = "") => {
    element.textContent = text;
    element.className = type;
  };

  // ---------- Login ----------
  const loginForm = byId("loginForm");

  if (loginForm) {
    const emailInput = byId("email");
    const passwordInput = byId("password");
    const loginButton = byId("loginButton");
    const forgotButton = byId("forgotPasswordButton");
    const message = byId("loginMessage");

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(message, "");

      await withBusy(loginButton, async () => {
        const label = loginButton.textContent;

        loginButton.textContent = "Signing in...";

        const res = await api("/auth/login", {
          method: "POST",
          body: {
            email: emailInput.value.trim(),
            password: passwordInput.value,
          },
        });

        if (!res.ok || !res.data.user) {
          loginButton.textContent = label;
          setMessage(
            message,
            res.data.message || "Login failed. Please try again.",
            "error",
          );
          return;
        }

        localStorage.setItem("user", JSON.stringify(res.data.user));
        window.location.href = "dashboard.html";
      });
    });

    // Uses the email already typed in the form instead of a prompt() box
    forgotButton.addEventListener("click", () =>
      withBusy(forgotButton, async () => {
        const email = emailInput.value.trim();

        if (!email) {
          setMessage(
            message,
            "Enter your email address above, then click Forgot Password.",
            "error",
          );
          emailInput.focus();
          return;
        }

        const res = await api("/auth/forgot-password", {
          method: "POST",
          body: { email },
        });

        setMessage(
          message,
          res.data.message ||
            (res.ok
              ? "Request sent. Please check your email."
              : "Could not send the reset link."),
          res.ok ? "success" : "error",
        );
      }),
    );
  }

  // ---------- Reset password ----------
  const resetForm = byId("resetPasswordForm");

  if (resetForm) {
    const token = new URLSearchParams(window.location.search).get("token");
    const message = byId("resetPasswordMessage");
    const submitButton = resetForm.querySelector('button[type="submit"]');

    if (!token) {
      setMessage(
        message,
        "This reset link is invalid or incomplete. Please request a new one.",
        "error",
      );
      submitButton.disabled = true;
    }

    resetForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const newPassword = byId("newPassword").value;

      if (!token) {
        return;
      }

      if (newPassword !== byId("confirmPassword").value) {
        setMessage(message, "Passwords do not match", "error");
        return;
      }

      await withBusy(submitButton, async () => {
        const res = await api("/auth/reset-password", {
          method: "POST",
          body: { token, newPassword },
        });

        setMessage(
          message,
          res.data.message ||
            (res.ok ? "Password updated." : "Could not reset password."),
          res.ok ? "success" : "error",
        );

        if (res.ok) {
          resetForm.reset();
          setTimeout(() => (window.location.href = "index.html"), 2000);
        }
      });
    });
  }
});
