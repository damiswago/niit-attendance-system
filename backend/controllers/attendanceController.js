import Attendance from "../models/Attendance.js";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
import { checkInStudent } from "../services/attendanceService.js";
import { checkOutStudent } from "../services/attendanceService.js";

// A student may only attend sessions that belong to their own class.
// Returns an error message, or null when it is fine.
const classMismatch = async (studentId, session) => {
  const [student, timetable] = await Promise.all([
    User.findById(studentId).select("class"),
    Timetable.findById(session.timetable).select("class"),
  ]);

  if (!student || !student.class) {
    return "You have not been assigned to a class yet";
  }

  if (
    !timetable ||
    !timetable.class ||
    timetable.class.toString() !== student.class.toString()
  ) {
    return "This session is not for your class";
  }

  return null;
};

export const checkIn = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "SessionId is required",
      });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    const mismatch = await classMismatch(req.user.userId, session);

    if (mismatch) {
      return res.status(403).json({
        message: mismatch,
      });
    }

    const attendance = await checkInStudent(req.user.userId, session);

    return res.status(201).json({
      message: "Attendance checked in successfully",
      attendance,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};

export const checkOut = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message: "sessionId is required",
      });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    const attendance = await checkOutStudent(req.user.userId, session);

    return res.status(200).json({
      message: "Attendance checked out successfully",
      attendance,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message,
    });
  }
};
