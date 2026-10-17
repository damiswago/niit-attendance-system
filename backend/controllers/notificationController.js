import mongoose from "mongoose";
import Notification from "../models/Notification.js";

// The in-app inbox. Every query is limited to the signed-in user's own
// notices (recipient = req.user.userId), so there is no way to read or change
// anyone else's, whatever id is sent.

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const shape = (notification) => ({
  _id: notification._id,
  type: notification.type,
  title: notification.subject,
  message: notification.message,
  read: Boolean(notification.readAt),
  createdAt: notification.createdAt,
});

// ?page=1&limit=20 -> { page, limit } or { error }
const parsePaging = ({ page, limit }) => {
  for (const value of [page, limit]) {
    if (value !== undefined && typeof value !== "string") {
      return { error: "Invalid paging" };
    }
  }

  const pageNumber = page === undefined ? 1 : Number(page);
  const pageSize = limit === undefined ? DEFAULT_LIMIT : Number(limit);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1
  ) {
    return { error: "page and limit must be positive whole numbers" };
  }

  return { page: pageNumber, limit: Math.min(pageSize, MAX_LIMIT) };
};

// GET /notifications?page=&limit=&unread=true
export const listNotifications = async (req, res) => {
  try {
    const paging = parsePaging(req.query);

    if (paging.error) {
      return res.status(400).json({ message: paging.error });
    }

    const mine = { recipient: req.user.userId };
    const filter =
      req.query.unread === "true" ? { ...mine, readAt: null } : mine;

    const [total, unreadCount, notifications] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...mine, readAt: null }),
      Notification.find(filter)
        .select("type subject message readAt createdAt")
        .sort({ createdAt: -1, _id: -1 })
        .skip((paging.page - 1) * paging.limit)
        .limit(paging.limit),
    ]);

    return res.status(200).json({
      notifications: notifications.map(shape),
      unreadCount,
      pagination: {
        page: paging.page,
        limit: paging.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / paging.limit)),
      },
    });
  } catch (error) {
    console.error("Error listing notifications:", error);

    return res.status(500).json({ message: "Failed to load notifications" });
  }
};

// GET /notifications/unread-count (light enough to poll)
export const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.userId,
      readAt: null,
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error("Error counting notifications:", error);

    return res.status(500).json({ message: "Failed to load notifications" });
  }
};

// PATCH /notifications/:id/read
export const markRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    // Matching on recipient makes someone else's notice look like "not found"
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: req.user.userId },
      { $set: { readAt: new Date() } },
      { returnDocument: "after" },
    ).select("type subject message readAt createdAt");

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ notification: shape(notification) });
  } catch (error) {
    console.error("Error marking notification read:", error);

    return res.status(500).json({ message: "Failed to update notification" });
  }
};

// PATCH /notifications/read-all
export const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipient: req.user.userId, readAt: null },
      { $set: { readAt: new Date() } },
    );

    return res.status(200).json({ updated: result.modifiedCount });
  } catch (error) {
    console.error("Error marking notifications read:", error);

    return res.status(500).json({ message: "Failed to update notifications" });
  }
};
