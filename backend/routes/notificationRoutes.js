import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} from "../controllers/notificationController.js";

const router = express.Router();

// Every signed-in user (any role) has their own inbox. There is no role check
// because the controller only ever touches the caller's own notices.
router.get("/", authenticateUser, listNotifications);
router.get("/unread-count", authenticateUser, getUnreadCount);
router.patch("/read-all", authenticateUser, markAllRead);
router.patch("/:id/read", authenticateUser, markRead);

export default router;
