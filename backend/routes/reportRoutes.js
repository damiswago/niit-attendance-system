import express from "express";

import {
  getMyAttendance,
  getMyAttendanceByCourse,
  getMyAttendanceByDate,
  getInstructorAttendance,
  getInstructorAttendanceByCourse,
  getInstructorAttendanceByDate,
  getAdminAttendance,
  getAdminAttendanceByStudent,
  getAdminAttendanceByCourse,
  getAdminAttendanceByInstructor,
  getAdminAttendanceByDate,
} from "../controllers/reportController.js";

import {
  getClassSummary,
  getStudentSessions,
  getMySummary,
} from "../controllers/summaryController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// A student's own attendance rate, including absences
router.get(
  "/student/summary",
  authenticateUser,
  authorizeRoles("student"),
  getMySummary,
);

// Every session for one student with its outcome (the drill-down from a summary row)
router.get(
  "/summary/sessions",
  authenticateUser,
  authorizeRoles("admin", "instructor"),
  getStudentSessions,
);

// Per-student attendance rates for one class, including absences
router.get(
  "/summary",
  authenticateUser,
  authorizeRoles("admin", "instructor"),
  getClassSummary,
);

router.get(
  "/student/attendance",
  authenticateUser,
  authorizeRoles("student"),
  getMyAttendance,
);

router.get(
  "/student/attendance/course/:course",
  authenticateUser,
  authorizeRoles("student"),
  getMyAttendanceByCourse,
);

router.get(
  "/student/attendance/date/:date",
  authenticateUser,
  authorizeRoles("student"),
  getMyAttendanceByDate,
);

router.get(
  "/instructor/attendance",
  authenticateUser,
  authorizeRoles("instructor"),
  getInstructorAttendance,
);

router.get(
  "/instructor/attendance/course/:course",
  authenticateUser,
  authorizeRoles("instructor"),
  getInstructorAttendanceByCourse,
);

router.get(
  "/instructor/attendance/date/:date",
  authenticateUser,
  authorizeRoles("instructor"),
  getInstructorAttendanceByDate,
);

router.get(
  "/admin/attendance",
  authenticateUser,
  authorizeRoles("admin"),
  getAdminAttendance,
);

router.get(
  "/admin/attendance/student/:studentId",
  authenticateUser,
  authorizeRoles("admin"),
  getAdminAttendanceByStudent,
);

router.get(
  "/admin/attendance/course/:course",
  authenticateUser,
  authorizeRoles("admin"),
  getAdminAttendanceByCourse,
);

router.get(
  "/admin/attendance/instructor/:instructorId",
  authenticateUser,
  authorizeRoles("admin"),
  getAdminAttendanceByInstructor,
);

router.get(
  "/admin/attendance/date/:date",
  authenticateUser,
  authorizeRoles("admin"),
  getAdminAttendanceByDate,
);

export default router;
