import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  postponeSession,
  undoPostponement,
  getCurrentSession,
} from "../controllers/sessionController.js";
import {
  cancelSession,
  cancelReplacementSession,
  undoCancellation,
} from "../controllers/sessionController.js";

import { getSchedule } from "../controllers/scheduleController.js";
import { getSessionRoster } from "../controllers/rosterController.js";

const router = express.Router();

router.get(
  "/current",
  authenticateUser,
  authorizeRoles("student"),
  getCurrentSession,
);

// Admins see every class; instructors see (read-only) their own
router.get(
  "/schedule",
  authenticateUser,
  authorizeRoles("admin", "instructor"),
  getSchedule,
);

// Who is in a session and what each student's attendance is
router.get(
  "/:sessionId/roster",
  authenticateUser,
  authorizeRoles("admin", "instructor"),
  getSessionRoster,
);

router.patch(
  "/postpone-occurrence",
  authenticateUser,
  authorizeRoles("admin"),
  postponeSession,
);
router.patch(
  "/:sessionId/postpone",
  authenticateUser,
  authorizeRoles("admin"),
  postponeSession,
);
router.patch(
  "/:sessionId/undo-postponement",
  authenticateUser,
  authorizeRoles("admin"),
  undoPostponement,
);

router.patch(
  "/cancel-occurrence",
  authenticateUser,
  authorizeRoles("admin"),
  cancelSession,
);
router.patch(
  "/:sessionId/cancel",
  authenticateUser,
  authorizeRoles("admin"),
  cancelSession,
);

router.patch(
  "/:sessionId/cancel-replacement",
  authenticateUser,
  authorizeRoles("admin"),
  cancelReplacementSession,
);

router.patch(
  "/:sessionId/undo-cancellation",
  authenticateUser,
  authorizeRoles("admin"),
  undoCancellation,
);

export default router;