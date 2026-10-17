import mongoose from "mongoose";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import Class from "../models/Class.js";
import { sameTextIgnoringCase } from "../utils/search.js";

// Attendance summaries, including absences.
//
// Attendance records only exist for students who checked in, so an absence is
// "a session that took place (status: completed) with no record for that
// student". The reports list check-ins; this is where absences show up.

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const lagosDay = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(date),
  );

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

// Strict YYYY-MM-DD -> Date at UTC midnight (how session dates are stored)
const parseDay = (value) => {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !isNaN(date) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

const blank = () => ({
  held: 0, // sessions that took place and count for this student
  present: 0, // signed in on time
  late: 0, // signed in late
  absent: 0, // no record at all
  invalid: 0, // a record that was invalidated
  counted: 0, // attended for long enough to count
  pending: 0, // signed in, but the check-out hasn't settled yet
});

// Share of settled sessions that counted as attended (one decimal), or null
// when nothing has settled yet. "Pending" sessions (signed in, not yet checked
// out - the automatic check-out runs at 18:00) are left out until they settle,
// so today's classes don't drag a rate down.
const rateOf = (tally) => {
  const settled = tally.held - tally.pending;

  return settled > 0 ? Math.round((tally.counted / settled) * 1000) / 10 : null;
};

const joinedDay = (student) => lagosDay(student.createdAt);

// Whether a session counts for a student at all. A session from before the
// student's account existed isn't held against them, unless they attended it
// anyway. The summary table AND the "missed sessions" list both use this, so
// their numbers can never disagree.
const countsFor = (session, record, joined) =>
  Boolean(record) || dayKey(session.date) >= joined;

const addSession = (tally, record) => {
  tally.held += 1;

  if (!record) {
    tally.absent += 1;
  } else if (!record.isValid) {
    tally.invalid += 1;
  } else {
    if (record.status === "late") {
      tally.late += 1;
    } else {
      tally.present += 1;
    }

    if (record.classAttended === true) {
      tally.counted += 1;
    } else if (
      record.classAttended === null ||
      record.classAttended === undefined
    ) {
      tally.pending += 1;
    }
  }
};

// Pure function (no database): one row per student.
//   sessions: [{ _id, date, course }]   completed sessions to measure against
//   students: [{ _id, name, email, createdAt }]
//   records:  [{ student, session, status, classAttended, isValid }]
// A session from before a student's account existed isn't held against them,
// unless they attended it anyway.
export const tallyAttendance = ({
  sessions,
  students,
  records,
  withCourses = false,
}) => {
  const byKey = new Map(
    records.map((record) => [`${record.student}|${record.session}`, record]),
  );

  return students.map((student) => {
    const joined = joinedDay(student);
    const total = blank();
    const courses = new Map();

    for (const session of sessions) {
      const record = byKey.get(`${student._id}|${session._id}`);

      if (!countsFor(session, record, joined)) {
        continue;
      }

      addSession(total, record);

      if (withCourses) {
        if (!courses.has(session.course)) {
          courses.set(session.course, blank());
        }

        addSession(courses.get(session.course), record);
      }
    }

    const row = {
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
      },
      ...total,
      rate: rateOf(total),
    };

    if (withCourses) {
      row.byCourse = [...courses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([course, tally]) => ({ course, ...tally, rate: rateOf(tally) }));
    }

    return row;
  });
};

// Pure function: EVERY session that counts for one student, newest first, each
// with what happened. outcome is:
//   attended   - signed in and stayed long enough to count
//   left_early - signed in but didn't stay long enough to count
//   invalid    - a record that was invalidated
//   absent     - no record at all
//   pending    - signed in, check-out not settled yet (decided at 18:00)
// late is true when the student signed in late (for attended / left_early /
// pending). Same eligibility rule as the summary table, and every outcome maps
// onto one of the table's columns, so the two always agree.
export const sessionBreakdown = ({ sessions, student, records }) => {
  const byKey = new Map(
    records.map((record) => [`${record.student}|${record.session}`, record]),
  );
  const joined = joinedDay(student);
  const entries = [];

  for (const session of sessions) {
    const record = byKey.get(`${student._id}|${session._id}`);

    if (!countsFor(session, record, joined)) {
      continue;
    }

    let outcome = "absent";

    if (record) {
      if (!record.isValid) {
        outcome = "invalid";
      } else if (record.classAttended === true) {
        outcome = "attended";
      } else if (record.classAttended === false) {
        outcome = "left_early";
      } else {
        outcome = "pending";
      }
    }

    entries.push({
      _id: session._id,
      course: session.course,
      date: dayKey(session.date),
      startTime: session.startTime,
      endTime: session.endTime,
      outcome,
      late: Boolean(record && record.isValid && record.status === "late"),
      signIn: record ? record.signIn : null,
      signOut: record ? record.signOut : null,
      invalidationReason: record ? record.invalidationReason : null,
    });
  }

  return entries.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      (b.startTime || "").localeCompare(a.startTime || ""),
  );
};

// ?from=&to= (both optional). Returns { from, to } as Dates or null, or { error }
const parseRange = (query) => {
  const { from, to } = query;

  for (const value of [from, to]) {
    if (value !== undefined && typeof value !== "string") {
      return { error: "Invalid date filter" };
    }
  }

  const start = from ? parseDay(from) : null;
  const end = to ? parseDay(to) : null;

  if ((from && !start) || (to && !end)) {
    return { error: "Dates must be in YYYY-MM-DD format" };
  }

  if (start && end) {
    if (end < start) {
      return { error: "The end date can't be before the start date" };
    }

    if ((end - start) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      return {
        error: `Please choose a range of at most ${MAX_RANGE_DAYS} days`,
      };
    }
  }

  return { from: start, to: end };
};

const sessionQuery = ({ timetableIds, range, course }) => {
  const filter = { timetable: { $in: timetableIds }, status: "completed" };

  if (range.from || range.to) {
    filter.date = {};

    if (range.from) {
      filter.date.$gte = range.from;
    }

    if (range.to) {
      filter.date.$lte = range.to;
    }
  }

  if (course) {
    filter.course = sameTextIgnoringCase(course);
  }

  return filter;
};

const SUMMARY_FIELDS = "student session status classAttended isValid";

const loadRecords = (sessions, studentIds, fields = SUMMARY_FIELDS) =>
  sessions.length
    ? Attendance.find({
        session: { $in: sessions.map((session) => session._id) },
        student: { $in: studentIds },
      }).select(fields)
    : [];

// Validates ?class= [&course=][&from=][&to=] and works out which timetables the
// caller may look at. Admins can use any class; instructors only classes they
// teach, and only the sessions they taught. On a problem it sends the error
// response itself and returns null.
const loadClassContext = async (req, res) => {
  const classId = req.query.class;
  const course = req.query.course;

  if (typeof classId !== "string" || !mongoose.isValidObjectId(classId)) {
    res.status(400).json({ message: "Please choose a class" });
    return null;
  }

  if (course !== undefined && typeof course !== "string") {
    res.status(400).json({ message: "Invalid course" });
    return null;
  }

  const range = parseRange(req.query);

  if (range.error) {
    res.status(400).json({ message: range.error });
    return null;
  }

  const classRecord = await Class.findById(classId).select("name");

  if (!classRecord) {
    res.status(404).json({ message: "Class not found" });
    return null;
  }

  const timetableFilter = { class: classId };

  if (req.user.role === "instructor") {
    timetableFilter.instructor = req.user.userId;
  }

  const timetableIds = await Timetable.distinct("_id", timetableFilter);

  if (!timetableIds.length && req.user.role === "instructor") {
    res.status(403).json({ message: "You don't teach this class" });
    return null;
  }

  return {
    classId,
    classRecord: { _id: classRecord._id, name: classRecord.name },
    timetableIds,
    range,
    course: course && course.trim(),
  };
};

// GET /reports/summary?class=<id>[&course=][&from=][&to=]
export const getClassSummary = async (req, res) => {
  try {
    const context = await loadClassContext(req, res);

    if (!context) {
      return;
    }

    if (!context.timetableIds.length) {
      return res.status(200).json({
        class: context.classRecord,
        sessionsHeld: 0,
        students: [],
      });
    }

    const sessions = await Session.find(sessionQuery(context)).select(
      "date course",
    );

    const students = await User.find({
      role: "student",
      class: context.classId,
      status: "active",
    })
      .select("name email createdAt")
      .sort({ name: 1 });

    const records = await loadRecords(
      sessions,
      students.map((student) => student._id),
    );

    return res.status(200).json({
      class: context.classRecord,
      sessionsHeld: sessions.length,
      students: tallyAttendance({ sessions, students, records }),
    });
  } catch (error) {
    console.error("Error building class summary:", error);

    return res.status(500).json({ message: "Failed to build the summary" });
  }
};

// GET /reports/summary/sessions?class=<id>&student=<id>[&course=][&from=][&to=]
// Every session for one student with its outcome (see sessionBreakdown), for
// the same class and filters as the summary row that was clicked.
export const getStudentSessions = async (req, res) => {
  try {
    const studentId = req.query.student;

    if (typeof studentId !== "string" || !mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ message: "Invalid student" });
    }

    const context = await loadClassContext(req, res);

    if (!context) {
      return;
    }

    const student = await User.findOne({
      _id: studentId,
      role: "student",
      class: context.classId,
    }).select("name email createdAt");

    if (!student) {
      return res
        .status(404)
        .json({ message: "Student not found in this class" });
    }

    const sessions = context.timetableIds.length
      ? await Session.find(sessionQuery(context)).select(
          "date course startTime endTime",
        )
      : [];

    const records = await loadRecords(
      sessions,
      [student._id],
      `${SUMMARY_FIELDS} signIn signOut invalidationReason`,
    );

    const entries = sessionBreakdown({ sessions, student, records });
    const count = (outcome) =>
      entries.filter((entry) => entry.outcome === outcome).length;

    return res.status(200).json({
      student: { _id: student._id, name: student.name, email: student.email },
      class: context.classRecord,
      held: entries.length,
      totals: {
        attended: count("attended"),
        leftEarly: count("left_early"),
        invalid: count("invalid"),
        absent: count("absent"),
        pending: count("pending"),
        lateArrivals: entries.filter((entry) => entry.late).length,
      },
      sessions: entries,
    });
  } catch (error) {
    console.error("Error listing a student's sessions:", error);

    return res
      .status(500)
      .json({ message: "Failed to list the student's sessions" });
  }
};

// GET /reports/student/summary[?from=&to=]  (a student's own attendance)
export const getMySummary = async (req, res) => {
  try {
    const range = parseRange(req.query);

    if (range.error) {
      return res.status(400).json({ message: range.error });
    }

    const student = await User.findById(req.user.userId).select(
      "name email class createdAt",
    );

    if (!student || !student.class) {
      return res.status(200).json({ summary: null });
    }

    const timetableIds = await Timetable.distinct("_id", {
      class: student.class,
    });

    const sessions = timetableIds.length
      ? await Session.find(sessionQuery({ timetableIds, range })).select(
          "date course",
        )
      : [];

    const records = await loadRecords(sessions, [student._id]);

    const [summary] = tallyAttendance({
      sessions,
      students: [student],
      records,
      withCourses: true,
    });

    return res.status(200).json({ summary });
  } catch (error) {
    console.error("Error building student summary:", error);

    return res.status(500).json({ message: "Failed to build your summary" });
  }
};
