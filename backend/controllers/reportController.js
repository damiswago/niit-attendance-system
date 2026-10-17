import Attendance from "../models/Attendance.js";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import { sameTextIgnoringCase } from "../utils/search.js";

// ---------- Query building blocks ----------

// The session's timetable carries its class, so each record can show which
// class the session was for
const attendancePopulate = {
  path: "session",
  select: "course date startTime endTime instructor timetable",
  populate: {
    path: "timetable",
    select: "class",
    populate: { path: "class", select: "name" },
  },
};

const attendanceSelect =
  "session student signIn signOut signOutMethod status classAttended isValid invalidatedAt invalidationReason";

// Students never see the `student` field of their own records
const studentAttendanceSelect =
  "session signIn signOut signOutMethod status classAttended isValid invalidatedAt invalidationReason";

// Session dates are stored for Nigeria (WAT): UTC+1, no daylight saving
const TIMEZONE_OFFSET = "+01:00";

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

// Admin and instructor reports include who the student is. Students never get
// the `student` field (see studentAttendanceSelect), so nothing is populated.
const studentPopulate = {
  path: "student",
  select: "name email class",
  populate: { path: "class", select: "name" },
};

const queryAttendance = (filter, select = attendanceSelect) => {
  const query = Attendance.find(filter)
    .populate(attendancePopulate)
    .select(select)
    .sort({ createdAt: -1, _id: -1 }); // _id keeps page order stable

  return select.split(" ").includes("student")
    ? query.populate(studentPopulate)
    : query;
};

const sessionIdsFor = async (filter) => {
  // Course names are matched ignoring case, so typing "web development" finds
  // "Web Development" (this covers every by-course route and the combined filter)
  const query =
    typeof filter.course === "string"
      ? { ...filter, course: sameTextIgnoringCase(filter.course) }
      : filter;

  const sessions = await Session.find(query).select("_id");

  return sessions.map((session) => session._id);
};

const inSessions = (sessionIds) => ({ session: { $in: sessionIds } });

// ---------- Helpers ----------

const sendError = (res, status, message) =>
  res.status(status).json({ message });

const sendAttendance = (res, message, attendance) =>
  res.status(200).json({ message, attendance });

// Wraps a handler so any thrown error becomes a 500. The real error is logged
// on the server and never sent to the client.
const handle = (handler) => async (req, res) => {
  try {
    return await handler(req, res);
  } catch (error) {
    console.error(error);

    return sendError(res, 500, "Something went wrong. Please try again.");
  }
};

// Turns a YYYY-MM-DD string into the start and end of that day.
// Returns { startOfDay, endOfDay } or { error }.
const parseDateRange = (date) => {
  if (!date) {
    return { error: "Date is required" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Date must be in YYYY-MM-DD format" };
  }

  // Date() silently rolls impossible dates over (2026-02-30 becomes 2 March),
  // so check that the day survives a round trip before trusting it
  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return { error: "Invalid date" };
  }

  const startOfDay = new Date(`${date}T00:00:00${TIMEZONE_OFFSET}`);
  const endOfDay = new Date(`${date}T23:59:59.999${TIMEZONE_OFFSET}`);

  return { startOfDay, endOfDay };
};

const dateFilter = ({ startOfDay, endOfDay }) => ({
  date: { $gte: startOfDay, $lte: endOfDay },
});

// ---------- Student ----------

export const getMyAttendance = handle(async (req, res) => {
  const attendance = await queryAttendance(
    { student: req.user.userId },
    studentAttendanceSelect,
  );

  return sendAttendance(
    res,
    "Attendance records retrieved successfully",
    attendance,
  );
});

export const getMyAttendanceByCourse = handle(async (req, res) => {
  const { course } = req.params;

  if (!course) {
    return sendError(res, 400, "Course is required");
  }

  const sessionIds = await sessionIdsFor({ course });

  const attendance = await queryAttendance(
    { student: req.user.userId, ...inSessions(sessionIds) },
    studentAttendanceSelect,
  );

  return sendAttendance(
    res,
    "Course attendance records retrieved successfully",
    attendance,
  );
});

export const getMyAttendanceByDate = handle(async (req, res) => {
  const range = parseDateRange(req.params.date);

  if (range.error) {
    return sendError(res, 400, range.error);
  }

  const sessionIds = await sessionIdsFor(dateFilter(range));

  const attendance = await queryAttendance(
    { student: req.user.userId, ...inSessions(sessionIds) },
    studentAttendanceSelect,
  );

  return sendAttendance(
    res,
    "Date attendance records retrieved successfully",
    attendance,
  );
});

// ---------- Instructor ----------

export const getInstructorAttendanceByCourse = handle(async (req, res) => {
  const { course } = req.params;

  if (!course) {
    return sendError(res, 400, "Course is required");
  }

  const sessionIds = await sessionIdsFor({
    instructor: req.user.userId,
    course,
  });

  const attendance = await queryAttendance(inSessions(sessionIds));

  return sendAttendance(
    res,
    "Instructor course attendance records retrieved successfully",
    attendance,
  );
});

export const getInstructorAttendanceByDate = handle(async (req, res) => {
  const range = parseDateRange(req.params.date);

  if (range.error) {
    return sendError(res, 400, range.error);
  }

  const sessionIds = await sessionIdsFor({
    instructor: req.user.userId,
    ...dateFilter(range),
  });

  const attendance = await queryAttendance(inSessions(sessionIds));

  return sendAttendance(
    res,
    "Instructor date attendance records retrieved successfully",
    attendance,
  );
});

// ---------- Admin ----------

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// ?page=1&limit=50  ->  { page, limit } (limit is capped), or { error }
const parsePaging = ({ page, limit }) => {
  const pageNumber = page === undefined ? 1 : Number(page);
  const pageSize = limit === undefined ? DEFAULT_PAGE_SIZE : Number(limit);

  if (
    !Number.isInteger(pageNumber) ||
    pageNumber < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1
  ) {
    return { error: "page and limit must be positive whole numbers" };
  }

  return { page: pageNumber, limit: Math.min(pageSize, MAX_PAGE_SIZE) };
};

// Shared by the admin and instructor reports. Filters can be combined:
//   ?course=&class=&student=&date=YYYY-MM-DD   (admins may also add &instructor=)
// and paging: ?page=1&limit=50 (limit is capped at 200).
// Responds with { attendance, pagination: { page, limit, total, totalPages } }.
// Pass instructorId to lock the report to that instructor's own sessions.
const combinedReport = async (req, res, { instructorId = null, message }) => {
  const { course, student, date, page, limit } = req.query;
  const instructor = instructorId || req.query.instructor;
  const classId = req.query.class;

  // Query values arrive as strings only if the client sent plain ?key=value;
  // anything else (arrays, objects) is rejected rather than passed to MongoDB
  const given = {
    course,
    student,
    instructor: req.query.instructor,
    date,
    class: classId,
    page,
    limit,
  };

  for (const value of Object.values(given)) {
    if (value !== undefined && typeof value !== "string") {
      return sendError(res, 400, "Invalid filter");
    }
  }

  for (const [name, value] of [
    ["student", student],
    ["instructor", instructor],
    ["class", classId],
  ]) {
    if (value && !OBJECT_ID_PATTERN.test(value)) {
      return sendError(res, 400, `Invalid ${name} ID`);
    }
  }

  const filter = {};
  const sessionFilter = {};

  if (student) {
    filter.student = student;
  }

  if (course && course.trim()) {
    sessionFilter.course = course.trim();
  }

  if (instructor) {
    sessionFilter.instructor = instructor;
  }

  if (classId) {
    sessionFilter.timetable = {
      $in: await Timetable.distinct("_id", { class: classId }),
    };
  }

  if (date) {
    const range = parseDateRange(date);

    if (range.error) {
      return sendError(res, 400, range.error);
    }

    Object.assign(sessionFilter, dateFilter(range));
  }

  if (Object.keys(sessionFilter).length) {
    filter.session = { $in: await sessionIdsFor(sessionFilter) };
  }

  const paging = parsePaging({ page, limit });

  if (paging.error) {
    return sendError(res, 400, paging.error);
  }

  const [total, attendance] = await Promise.all([
    Attendance.countDocuments(filter),
    queryAttendance(filter)
      .skip((paging.page - 1) * paging.limit)
      .limit(paging.limit),
  ]);

  return res.status(200).json({
    message,
    attendance,
    pagination: {
      page: paging.page,
      limit: paging.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / paging.limit)),
    },
  });
};

export const getAdminAttendance = handle((req, res) =>
  combinedReport(req, res, {
    message: "Admin attendance records retrieved successfully",
  }),
);

// An instructor only ever sees attendance for their own sessions, whatever
// filters they send (an ?instructor= value is ignored)
export const getInstructorAttendance = handle((req, res) =>
  combinedReport(req, res, {
    instructorId: req.user.userId,
    message: "Instructor attendance records retrieved successfully",
  }),
);

export const getAdminAttendanceByStudent = handle(async (req, res) => {
  const { studentId } = req.params;

  if (!studentId) {
    return sendError(res, 400, "Student ID is required");
  }

  if (!OBJECT_ID_PATTERN.test(studentId)) {
    return sendError(res, 400, "Invalid student ID");
  }

  const attendance = await queryAttendance({ student: studentId });

  return sendAttendance(
    res,
    "Student attendance records retrieved successfully",
    attendance,
  );
});

export const getAdminAttendanceByCourse = handle(async (req, res) => {
  const { course } = req.params;

  if (!course) {
    return sendError(res, 400, "Course is required");
  }

  const sessionIds = await sessionIdsFor({ course });

  const attendance = await queryAttendance(inSessions(sessionIds));

  return sendAttendance(
    res,
    "Course attendance records retrieved successfully",
    attendance,
  );
});

export const getAdminAttendanceByInstructor = handle(async (req, res) => {
  const { instructorId } = req.params;

  if (!instructorId) {
    return sendError(res, 400, "Instructor ID is required");
  }

  if (!OBJECT_ID_PATTERN.test(instructorId)) {
    return sendError(res, 400, "Invalid instructor ID");
  }

  const sessionIds = await sessionIdsFor({ instructor: instructorId });

  const attendance = await queryAttendance(inSessions(sessionIds));

  return sendAttendance(
    res,
    "Instructor attendance records retrieved successfully",
    attendance,
  );
});

export const getAdminAttendanceByDate = handle(async (req, res) => {
  const range = parseDateRange(req.params.date);

  if (range.error) {
    return sendError(res, 400, range.error);
  }

  const sessionIds = await sessionIdsFor(dateFilter(range));

  const attendance = await queryAttendance(inSessions(sessionIds));

  return sendAttendance(
    res,
    "Date attendance records retrieved successfully",
    attendance,
  );
});
