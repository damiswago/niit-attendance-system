import Attendance from "../models/Attendance.js";
import { createSessionDateTime } from "../utils/timeUtils.js";

import {
  calculateClassMinutes,
  hasMetAttendanceRequirement,
  getSchoolEndDateTime,
} from "../utils/attendanceUtils.js";

import { LATE_THRESHOLD_MINUTES } from "../config/attendanceConfig.js";

export const getOpenAttendances = async () => {
  return await Attendance.find({
    signOut: null,
    isValid: true,
  }).populate("session");
};

export const getAttendanceCheckoutTime = (attendance) => {
  if (!attendance.session) {
    return null;
  }

  return getSchoolEndDateTime(attendance.session.date);
};

export const shouldCheckoutAttendance = (
  attendance,
  currentTime = new Date(),
) => {
  if (
    !attendance.session ||
    attendance.signOut !== null ||
    !attendance.isValid
  ) {
    return false;
  }

  const checkoutTime = getAttendanceCheckoutTime(attendance);

  return currentTime >= checkoutTime;
};

export const getSessionStartDateTime = (session) => {
  return createSessionDateTime(session.date, session.startTime);
};

export const getSessionEndDateTime = (session) => {
  return createSessionDateTime(session.date, session.endTime);
};

export const automaticallyCheckoutAttendances = async (
  currentTime = new Date(),
) => {
  const attendances = await getOpenAttendances();

  const checkedOut = [];

  for (const attendance of attendances) {
    if (!shouldCheckoutAttendance(attendance, currentTime)) {
      continue;
    }

    const checkoutTime = getAttendanceCheckoutTime(attendance);

    const sessionStart = getSessionStartDateTime(attendance.session);
    const sessionEnd = getSessionEndDateTime(attendance.session);

    const classMinutes = calculateClassMinutes(
      attendance.signIn,
      checkoutTime,
      sessionStart,
      sessionEnd,
    );

    attendance.signOut = checkoutTime;
    attendance.signOutMethod = "automatic";

    attendance.classAttended = hasMetAttendanceRequirement(
      classMinutes,
      sessionStart,
      sessionEnd,
    );

    await attendance.save();

    checkedOut.push(attendance);
  }

  return checkedOut;
};

export const validateSessionForCheckIn = (session) => {
  if (!session) {
    return {
      valid: false,
      message: "Session not found",
    };
  }

  if (session.status !== "active") {
    return {
      valid: false,
      message: "Session is not active",
    };
  }

  return {
    valid: true,
    message: null,
  };
};

export const isSessionWithinCheckInTime = (
  session,
  currentTime = new Date(),
) => {
  if (!session) {
    return false;
  }

  const sessionStart = getSessionStartDateTime(session);
  const sessionEnd = getSessionEndDateTime(session);

  return currentTime >= sessionStart && currentTime <= sessionEnd;
};

export const getAttendanceStatus = (session, signInTime) => {
  const sessionStart = getSessionStartDateTime(session);

  const lateThreshold = new Date(
    sessionStart.getTime() + LATE_THRESHOLD_MINUTES * 60 * 1000,
  );

  return signInTime > lateThreshold ? "late" : "present";
};

export const validateCheckInTime = (session, currentTime = new Date()) => {
  if (!session) {
    return {
      valid: false,
      message: "Session not found",
    };
  }

  const sessionStart = getSessionStartDateTime(session);
  const sessionEnd = getSessionEndDateTime(session);

  if (currentTime < sessionStart) {
    return {
      valid: false,
      message: "Session has not started",
    };
  }

  if (currentTime > sessionEnd) {
    return {
      valid: false,
      message: "Session has ended",
    };
  }

  return {
    valid: true,
    message: null,
  };
};

export const findExistingAttendance = async (studentId, sessionId) => {
  return await Attendance.findOne({
    student: studentId,
    session: sessionId,
  });
};

export const findOverlappingAttendance = async (studentId, session) => {
    const attendances = await Attendance.find({
        student: studentId,
        isValid: true,
    }).populate("session");

    const newSessionStart = getSessionStartDateTime(session);
    const newSessionEnd = getSessionEndDateTime(session);

    return attendances.find((attendance) => {
        if (!attendance.session) {
            return false;
        }

        const existingSessionStart = getSessionStartDateTime(attendance.session);

        const existingSessionEnd = getSessionEndDateTime(attendance.session);

        return (
            existingSessionStart < newSessionEnd &&
            existingSessionEnd > newSessionStart
        );
    }) || null;
};

export const validateStudentCheckIn = async (
    studentId,
    session,
    currentTime = new Date()
) => {
    const sessionValidation = validateSessionForCheckIn(session);

    if (!sessionValidation.valid) {
        return sessionValidation;
    }

    const timeValidation = validateCheckInTime(session, currentTime);

    if (!timeValidation.valid) {
        return timeValidation
    }

    const existingAttendance = await findExistingAttendance(
        studentId,
        session._id
    );

    if (existingAttendance) {
        return {
            valid: false,
            message: "Attendance already exists for this session"
        };
    }

    const overlappingAttendance = await findOverlappingAttendance(
        studentId,
        session
    );

    if (overlappingAttendance) {
        return {
            valid: false,
            message: "Student has an attendance conflict with another session"
        };
    }

    return {
        valid: true,
        message: null
    };
};


export const checkInStudent = async (
  studentId,
  session,
  currentTime = new Date(),
) => {
  const validation = await validateStudentCheckIn(
    studentId,
    session,
    currentTime,
  );

  if (!validation.valid) {
    throw new Error(validation.message);
  }

  const attendance = await Attendance.create({
    student: studentId,
    session: session._id,
    signIn: currentTime,
    status: getAttendanceStatus(session, currentTime),
  });

  return attendance;
};

export const validateCheckoutTime = (
  session,
  currentTime = new Date()
) => {
  if (!session) {
    return {
      valid: false,
      message: "Session not found"
    };
  }

  const sessionStart = getSessionStartDateTime(session);

  if (currentTime < sessionStart) {
    return {
      valid: false,
      message: "Session has not started"
    };
  }

  return {
    valid: true,
    message: null
  };
};

export const checkOutStudent = async (
  studentId,
  session,
  currentTime = new Date()
) => {
  const sessionValidation = validateSessionForCheckOut(session);

  if (!sessionValidation.valid) {
    throw new Error(sessionValidation.message);
  }

  const timeValidation = validateCheckoutTime(
    session,
    currentTime
  );

  if (!timeValidation.valid) {
    throw new Error(timeValidation.message);
  }

  const attendance = await Attendance.findOne({
    student: studentId,
    session: session._id,
    isValid: true
  });

  if (!attendance) {
    throw new Error("Attendance not found");
  }

  if (attendance.signOut !== null) {
    throw new Error("Attendance has already been checked out")
  }

  const sessionStart = getSessionStartDateTime(session);
  const sessionEnd = getSessionEndDateTime(session);

  const classMinutes = calculateClassMinutes(
    attendance.signIn,
    currentTime,
    sessionStart,
    sessionEnd
  );

  attendance.signOut = currentTime;
  attendance.signOutMethod = "manual";

  attendance.classAttended = hasMetAttendanceRequirement(
    classMinutes,
    sessionStart,
    sessionEnd
  );

  await attendance.save();

  return attendance;
};

export const invalidateSessionAttendances = async (
  sessionId,
  reason
) => {
  return await Attendance.updateMany(
    {
      session: sessionId,
      isValid: true
    },
    {
      $set: {
        isValid: false,
        invalidatedAt: new Date(),
        invalidationReason: reason
      }
    }
  );
};

export const restoreSessionAttendances = async (sessionId) => {
  return await Attendance.updateMany(
    {
      session: sessionId,
      isValid: false
    },
    {
      $set: {
        isValid: true,
        invalidatedAt: null,
        invalidationReason: null
      }
    }
  );
};

export const validateSessionForCheckOut = (session) => {
  if (!session) {
    return {
      valid: false,
      message: "Session not found"
    };
  }

  if (!["active", "completed"].includes(session.status)) {
    return {
      valid: false,
      message: "Session is not available for checkout"
    };
  }

  return {
    valid: true,
    message: null
  };
};

