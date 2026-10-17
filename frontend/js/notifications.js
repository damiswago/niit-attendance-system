// Notification bell: an unread count in the top bar and a dropdown inbox for
// the signed-in user (any role). Notices are created by the server when an
// admin changes a class (postponed, cancelled, new date, undone...).
// Needs: common.js loaded first.
document.addEventListener("DOMContentLoaded", () => {
  const button = document.getElementById("notificationsButton");

  if (!button || !NIIT.getUser()) {
    return;
  }

  const { api, showToast, withBusy, el } = NIIT;
  const byId = (id) => document.getElementById(id);

  const countBadge = byId("notificationsCount");
  const panel = byId("notificationsPanel");
  const list = byId("notificationsList");
  const status = byId("notificationsStatus");
  const markAllButton = byId("notificationsMarkAll");
  const moreButton = byId("notificationsMore");

  const PAGE_SIZE = 10;
  const POLL_MS = 60000;

  const state = {
    open: false,
    unread: 0,
    page: 0,
    totalPages: 1,
    items: [],
  };

  // ---------- Helpers ----------
  const timeAgo = (value) => {
    const minutes = Math.floor(
      (Date.now() - new Date(value).getTime()) / 60000,
    );

    if (minutes < 1) {
      return "Just now";
    }

    if (minutes < 60) {
      return `${minutes} min ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
      return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
      return `${days} ${days === 1 ? "day" : "days"} ago`;
    }

    return new Date(value).toLocaleDateString("en-GB", {
      timeZone: "Africa/Lagos",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ---------- Count ----------
  const setCount = (count) => {
    state.unread = count;

    countBadge.hidden = count === 0;
    countBadge.textContent = count > 99 ? "99+" : String(count);

    // Screen readers hear the number, since the badge itself is decorative
    button.setAttribute(
      "aria-label",
      count ? `Notifications, ${count} unread` : "Notifications",
    );

    markAllButton.disabled = count === 0;
  };

  // ---------- List ----------
  const renderList = () => {
    list.replaceChildren(
      ...state.items.map((item) => {
        const open = el(
          "button",
          {
            type: "button",
            className: `notification-item${item.read ? "" : " unread"}`,
          },
          item.read
            ? null
            : el("span", { className: "sr-only", text: "Unread: " }),
          el("strong", { className: "notification-title", text: item.title }),
          el("span", { className: "notification-message", text: item.message }),
          el("span", {
            className: "notification-time",
            text: timeAgo(item.createdAt),
          }),
        );

        open.addEventListener("click", () => markRead(item));

        return el("li", {}, open);
      }),
    );

    moreButton.hidden = state.page >= state.totalPages;
    status.textContent = state.items.length ? "" : "You have no notifications.";
  };

  const load = async (page) => {
    if (page === 1) {
      status.textContent = "Loading...";
    }

    const res = await api(`/notifications?page=${page}&limit=${PAGE_SIZE}`);

    if (!res.ok) {
      status.textContent = res.data.message || "Could not load notifications.";
      return;
    }

    state.page = res.data.pagination.page;
    state.totalPages = res.data.pagination.totalPages;
    state.items =
      page === 1
        ? res.data.notifications
        : [...state.items, ...res.data.notifications];

    setCount(res.data.unreadCount);
    renderList();
  };

  // ---------- Actions ----------
  const markRead = async (item) => {
    if (item.read) {
      return;
    }

    const res = await api(`/notifications/${item._id}/read`, {
      method: "PATCH",
    });

    if (!res.ok) {
      showToast(
        res.data.message || "Could not update the notification",
        "error",
      );
      return;
    }

    item.read = true;
    setCount(Math.max(0, state.unread - 1));
    renderList();
  };

  const markAllRead = async () => {
    const res = await api("/notifications/read-all", { method: "PATCH" });

    if (!res.ok) {
      showToast(res.data.message || "Could not update notifications", "error");
      return;
    }

    state.items.forEach((item) => (item.read = true));
    setCount(0);
    renderList();
  };

  // ---------- Open / close ----------
  const setOpen = (open, { restoreFocus = false } = {}) => {
    state.open = open;
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));

    if (open) {
      load(1);
    } else if (restoreFocus) {
      button.focus();
    }
  };

  button.addEventListener("click", () => setOpen(!state.open));

  document.addEventListener("click", (event) => {
    if (
      state.open &&
      !panel.contains(event.target) &&
      !button.contains(event.target)
    ) {
      setOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.open) {
      setOpen(false, { restoreFocus: true });
    }
  });

  // Not withBusy: setCount() decides whether this button is enabled (it is
  // disabled when nothing is unread), and withBusy would switch it back on.
  markAllButton.addEventListener("click", async () => {
    markAllButton.disabled = true;
    await markAllRead();
    setCount(state.unread);
  });

  moreButton.addEventListener("click", () =>
    withBusy(moreButton, () => load(state.page + 1)),
  );

  // ---------- Polling ----------
  // A cheap count every minute (only while the tab is visible). If the inbox
  // is open and something new arrived, it refreshes itself.
  const poll = async () => {
    if (document.hidden) {
      return;
    }

    const res = await api("/notifications/unread-count");

    if (!res.ok) {
      return; // a missed poll isn't worth bothering anyone about
    }

    const changed = res.data.count !== state.unread;

    setCount(res.data.count);

    if (changed && state.open) {
      load(1);
    }
  };

  document.addEventListener("visibilitychange", poll);
  setInterval(poll, POLL_MS);

  setCount(0);
  poll();
});
