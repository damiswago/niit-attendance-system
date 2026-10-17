import mongoose from "mongoose";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import Attendance from "../models/Attendance.js";
import User from "../models/User.js";
import { createSessionDateTime } from "../utils/timeUtils.js";

// Who was (or should be) in a session, and what each student's attendance is.
// Instructors can open the roster of their own sessions; admins any session.
//
// Students with no attendance record are returned with attendance: null. The
// client decides whether that means "not checked in yet" or "absent" from the
// started / ended flags, so a roster opened mid-class doesn't call everyone
// absent.
export const getSessionRoster = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.isValidObjectId(sessionId)) {
      return res.status(400).json({ message: "Invalid session ID" });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (
      req.user.role === "instructor" &&
      String(session.instructor) !== req.user.userId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    const timetable = await Timetable.findById(session.timetable)
      .select("class")
      .populate({ path: "class", select: "name" });

    const classRecord = timetable ? timetable.class : null;

    const attendance = await Attendance.find({ session: session._id }).select(
      "student signIn signOut signOutMethod status classAttended isValid invalidationReason",
    );

    const byStudent = new Map(
      attendance.map((record) => [String(record.student), record]),
    );

    // Everyone currently in the class, plus anyone who has a record for this
    // session even if they've since moved to another class
    const memberFilters = [{ _id: { $in: [...byStudent.keys()] } }];

    if (classRecord) {
      memberFilters.push({
        role: "student",
        status: "active",
        class: classRecord._id,
      });
    }

    const students = await User.find({ $or: memberFilters })
      .select("name email")
      .sort({ name: 1 });

    const now = new Date();
    const start = createSessionDateTime(session.date, session.startTime);
    const end = createSessionDateTime(session.date, session.endTime);

    return res.status(200).json({
      session: {
        _id: session._id,
        course: session.course,
        date: session.date.toISOString().slice(0, 10),
        startTime: session.startTime,
        endTime: session.endTime,
        status: session.status,
        class: classRecord
          ? { _id: classRecord._id, name: classRecord.name }
          : null,
      },
      started: now >= start,
      ended: now > end,
      roster: students.map((student) => {
        const record = byStudent.get(String(student._id));

        return {
          student: {
            _id: student._id,
            name: student.name,
            email: student.email,
          },
          attendance: record
            ? {
                signIn: record.signIn,
                signOut: record.signOut,
                signOutMethod: record.signOutMethod,
                status: record.status,
                classAttended: record.classAttended,
                isValid: record.isValid,
                invalidationReason: record.invalidationReason,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("Error retrieving session roster:", error);

    return res.status(500).json({
      message: "Failed to retrieve the session roster",
    });
  }
};

// The students in the classes an instructor teaches (for the report's
// student filter; /users is admin-only)
export const getMyStudents = async (req, res) => {
  try {
    const classIds = await Timetable.distinct("class", {
      instructor: req.user.userId,
      class: { $ne: null },
    });

    const students = classIds.length
      ? await User.find({ role: "student", class: { $in: classIds } })
          .select("name email class")
          .populate({ path: "class", select: "name" })
          .sort({ name: 1 })
      : [];

    return res.status(200).json({
      message: "Students retrieved successfully",
      students,
    });
  } catch (error) {
    console.error("Error retrieving students:", error);

    return res.status(500).json({
      message: "Failed to retrieve students",
    });
  }
};
 