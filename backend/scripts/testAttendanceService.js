import mongoose from "mongoose";
import dotenv from "dotenv";

import Attendance from "../models/Attendance.js";
import Session from "../models/Session.js";

import {
  calculateClassMinutes,
  hasMetAttendanceRequirement
} from "../utils/attendanceUtils.js";

import {
  getOpenAttendances,
  getAttendanceCheckoutTime,
  shouldCheckoutAttendance,
  getSessionStartDateTime,
  getSessionEndDateTime,
  automaticallyCheckoutAttendances,
  validateSessionForCheckIn,
  isSessionWithinCheckInTime,
  getAttendanceStatus,
  validateCheckInTime,
  findExistingAttendance,
  findOverlappingAttendance,
  validateStudentCheckIn,
  checkInStudent,
  validateAttendanceMethod,
  checkOutStudent,
  validateCheckoutTime,
  invalidateSessionAttendances,
  restoreSessionAttendances,
  validateSessionForCheckOut
} from "../services/attendanceService.js";

dotenv.config();

try {
  await mongoose.connect(process.env.MONGO_URI);

  console.log("MongoDB connected");

  const testSession = await Session.create({
    instructor: new mongoose.Types.ObjectId(),
    course: "TEST-COURSE",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
    status: "completed",
    timetable: new mongoose.Types.ObjectId(),
    isReplacement: false,
  });

  const overlappingSession = {
    date: new Date("2026-09-15"),
    startTime: "12:00",
    endTime: "13:00",
  };

  console.log("Test session created:", testSession._id);

  const testAttendance = await Attendance.create({
    student: new mongoose.Types.ObjectId(),
    session: testSession._id,
    signIn: new Date("2026-09-15T09:30:00+01:00"),
    signOut: null,
    status: "present",
    method: "qr",
    markedBy: null,
    isValid: true,
    classAttended: null,
    checkoutMethod: null,
  });

  console.log("Test attendance created:", testAttendance._id);

  const activeTestSession = {
    _id: new mongoose.Types.ObjectId(),
    status: "active",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
  };

  const checkInResult = await validateStudentCheckIn(
    new mongoose.Types.ObjectId(),
    activeTestSession,
    new Date("2026-09-15T10:30:00+01:00"),
  );

  console.log("Active session check-in:", checkInResult);

  const overlappingAttendance = await findOverlappingAttendance(
    testAttendance.student,
    overlappingSession,
  );

  console.log("Overlapping attendance found:", overlappingAttendance !== null);

  const existingAttendance = await findExistingAttendance(
    testAttendance.student,
    testSession._id
  );

  console.log(
    "Existing attendance found:",
    existingAttendance !== null
  );

  const checkedOutAttendances = await automaticallyCheckoutAttendances(
    new Date("2026-09-15T18:01:00+01:00"),
  );

  console.log("Automatically checked out:", checkedOutAttendances.length);

  const updatedAttendance = await Attendance.findById(testAttendance._id);

  console.log({
    signIn: updatedAttendance.signIn,
    signOut: updatedAttendance.signOut,
    checkoutMethod: updatedAttendance.checkoutMethod,
    classAttended: updatedAttendance.classAttended,
  });

  const checkInTestSession = await Session.create({
    instructor: new mongoose.Types.ObjectId(),
    course: "CHECK-IN-TEST",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
    status: "active",
    timetable: new mongoose.Types.ObjectId(),
    isReplacement: false,
  });

  const checkInStudentId = new mongoose.Types.ObjectId();

  const newAttendance = await checkInStudent(
    checkInStudentId,
    checkInTestSession,
    "qr",
    new Date("2026-09-15T10:30:00+01:00"),
  );

  console.log("New attendance:", {
    student: newAttendance.student,
    session: newAttendance.session,
    signIn: newAttendance.signIn,
    status: newAttendance.status,
    method: newAttendance.method,
    markedBy: newAttendance.markedBy,
    classAttended: newAttendance.classAttended,
  });

  const manualStudentId = new mongoose.Types.ObjectId();
  const manualMarkerId = new mongoose.Types.ObjectId();

  const manualAttendance = await checkInStudent(
      manualStudentId,
      checkInTestSession,
      "manual",
      new Date("2026-09-15T10:30:00+01:00"),
      manualMarkerId
  );

  console.log("Manual attendance:", {
      method: manualAttendance.method,
      markedBy: manualAttendance.markedBy,
      status: manualAttendance.status
  });

  try {
    await checkInStudent(
        new mongoose.Types.ObjectId(),
        checkInTestSession,
        "manual",
        new Date("2026-09-15T10:30:00+01:00")
    );
  } catch (error) {
      console.log("Manual without marker:", error.message);
  }

  try {
    await checkInStudent(
        new mongoose.Types.ObjectId(),
        checkInTestSession,
        "invalid",
        new Date("2026-09-15T10:30:00+01:00")
    );
  } catch (error) {
      console.log("Invalid method:", error.message);
  }

  const checkoutTestSession = await Session.create({
    instructor: new mongoose.Types.ObjectId(),
    course: "CHECKOUT-TEST",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
    status: "active",
    timetable: new mongoose.Types.ObjectId(),
    isReplacement: false
  });

  const checkoutStudentId = new mongoose.Types.ObjectId();

  const checkoutAttendance = await checkInStudent(
      checkoutStudentId,
      checkoutTestSession,
      "qr",
      new Date("2026-09-15T10:30:00+01:00")
  );

  const checkedOutAttendance = await checkOutStudent(
      checkoutStudentId,
      checkoutTestSession,
      new Date("2026-09-15T11:40:00+01:00")
  );

  console.log("Manual checkout:", {
      signIn: checkedOutAttendance.signIn,
      signOut: checkedOutAttendance.signOut,
      checkoutMethod: checkedOutAttendance.checkoutMethod,
      classAttended: checkedOutAttendance.classAttended
  });

  console.log(
    "Checkout before session:",
    validateCheckoutTime(
        checkoutTestSession,
        new Date("2026-09-15T09:30:00+01:00")
    )
  );

  console.log(
      "Checkout at session start:",
      validateCheckoutTime(
          checkoutTestSession,
          new Date("2026-09-15T10:00:00+01:00")
      )
  );

  console.log(
      "Checkout during session:",
      validateCheckoutTime(
          checkoutTestSession,
          new Date("2026-09-15T11:00:00+01:00")
      )
  );

  console.log(
      "Checkout after session:",
      validateCheckoutTime(
          checkoutTestSession,
          new Date("2026-09-15T13:00:00+01:00")
      )
  );

  console.log(
      "Checkout after school end:",
      validateCheckoutTime(
          checkoutTestSession,
          new Date("2026-09-15T18:30:00+01:00")
      )
  );

  const earlyCheckoutSession = await Session.create({
      instructor: new mongoose.Types.ObjectId(),
      course: "EARLY-CHECKOUT-TEST",
      date: new Date("2026-09-15"),
      startTime: "10:00",
      endTime: "12:00",
      status: "active",
      timetable: new mongoose.Types.ObjectId(),
      isReplacement: false
  });

  const earlyCheckoutStudentId = new mongoose.Types.ObjectId();

  await checkInStudent(
      earlyCheckoutStudentId,
      earlyCheckoutSession,
      "qr",
      new Date("2026-09-15T10:00:00+01:00")
  );

  try {
      await checkOutStudent(
          earlyCheckoutStudentId,
          earlyCheckoutSession,
          new Date("2026-09-15T09:30:00+01:00")
      );
  } catch (error) {
      console.log("Checkout before session:", error.message);
  }

  const validCheckout = await checkOutStudent(
      earlyCheckoutStudentId,
      earlyCheckoutSession,
      new Date("2026-09-15T11:00:00+01:00")
  );

  console.log("Valid checkout:", {
      signOut: validCheckout.signOut,
      checkoutMethod: validCheckout.checkoutMethod,
      classAttended: validCheckout.classAttended
  });

  try {
    await checkOutStudent(
        earlyCheckoutStudentId,
        earlyCheckoutSession,
        new Date("2026-09-15T11:30:00+01:00")
    );
  } catch (error) {
    console.log("Second checkout:", error.message);
  }

  const boundarySession = {
      _id: new mongoose.Types.ObjectId(),
      date: new Date("2026-09-15"),
      startTime: "10:00",
      endTime: "12:00"
  };

  const boundarySessionStart = getSessionStartDateTime(
      boundarySession
  );

  const boundarySessionEnd = getSessionEndDateTime(
      boundarySession
  );

  console.log(
      "59 minutes:",
      hasMetAttendanceRequirement(
          59,
          boundarySessionStart,
          boundarySessionEnd
      )
  );

  console.log(
      "60 minutes:",
      hasMetAttendanceRequirement(
          60,
          boundarySessionStart,
          boundarySessionEnd
      )
  );

  console.log(
      "61 minutes:",
      hasMetAttendanceRequirement(
          61,
          boundarySessionStart,
          boundarySessionEnd
      )
  );

  const invalidationSession = await Session.create({
    instructor: new mongoose.Types.ObjectId(),
    course: "INVALIDATION-TEST",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
    status: "active",
    timetable: new mongoose.Types.ObjectId(),
    isReplacement: false,
  });

  const invalidationStudentId = new mongoose.Types.ObjectId();

  const invalidationAttendance = await checkInStudent(
    invalidationStudentId,
    invalidationSession,
    "qr",
    new Date("2026-09-15T10:30:00+01:00"),
  );

  const invalidationResult = await invalidateSessionAttendances(
    invalidationSession._id,
    "Session was cancelled",
  );

  const updatedInvalidationAttendance = await Attendance.findById(
    invalidationAttendance._id,
  );

  console.log("Invalidation result:", {
    matched: invalidationResult.matchedCount,
    modified: invalidationResult.modifiedCount,
  });

  console.log("Invalidated attendance:", {
    isValid: updatedInvalidationAttendance.isValid,
    invalidatedAt: updatedInvalidationAttendance.invalidatedAt,
    invalidationReason: updatedInvalidationAttendance.invalidationReason,
  });

  const restoreResult = await restoreSessionAttendances(
    invalidationSession._id,
  );

  const restoredAttendance = await Attendance.findById(
    invalidationAttendance._id,
  );

  console.log("Restore result:", {
    matched: restoreResult.matchedCount,
    modified: restoreResult.modifiedCount,
  });

  console.log("Restored attendance:", {
    isValid: restoredAttendance.isValid,
    invalidatedAt: restoredAttendance.invalidatedAt,
    invalidationReason: restoredAttendance.invalidationReason,
  });

  console.log(
    "Checkout scheduled:",
    validateSessionForCheckOut({
      status: "scheduled",
    }),
  );

  console.log(
    "Checkout active:",
    validateSessionForCheckOut({
      status: "active",
    }),
  );

  console.log(
    "Checkout completed:",
    validateSessionForCheckOut({
      status: "completed",
    }),
  );

  console.log(
    "Checkout cancelled:",
    validateSessionForCheckOut({
      status: "cancelled",
    }),
  );

  console.log(
    "Checkout postponed:",
    validateSessionForCheckOut({
      status: "postponed",
    }),
  );

  console.log("Checkout missing session:", validateSessionForCheckOut(null));

  const inactiveCheckoutSession = {
    _id: new mongoose.Types.ObjectId(),
    status: "completed",
    date: new Date("2026-09-15"),
    startTime: "10:00",
    endTime: "12:00",
  };

  try {
    await checkOutStudent(
      new mongoose.Types.ObjectId(),
      inactiveCheckoutSession,
      new Date("2026-09-15T11:00:00+01:00"),
    );
  } catch (error) {
    console.log("Checkout inactive session:", error.message);
  }

  const invalidAttendance = await Attendance.create({
    student: new mongoose.Types.ObjectId(),
    session: activeTestSession._id,
    signIn: new Date("2026-09-15T09:30:00+01:00"),
    status: "late",
    method: "qr",
    isValid: false,
    invalidatedAt: new Date(),
    invalidationReason: "Session was cancelled",
  });

  try {
    await checkOutStudent(
      invalidAttendance.student,
      activeTestSession,
      new Date("2026-09-15T10:30:00+01:00"),
    );
  } catch (error) {
    console.log("Checkout invalidated attendance:", error.message);
  }

  await Attendance.deleteMany({
    session: testSession._id,
  });

  await Session.findByIdAndDelete(testSession._id);

  const sessionStatuses = [
    "scheduled",
    "active",
    "completed",
    "cancelled",
    "postponed",
  ];

  sessionStatuses.forEach((status) => {
    const result = validateSessionForCheckIn({
      status,
    });

    console.log(status, result);
  });

  console.log("Missing session:", validateSessionForCheckIn(null));

  const timeTestSession = {
    date: new Date("2026-09-15T00:00:00+01:00"),
    startTime: "10:00",
    endTime: "12:00",
  };

  console.log(
    "Before session:",
    isSessionWithinCheckInTime(
      timeTestSession,
      new Date("2026-09-15T09:59:00+01:00"),
    ),
  );

  console.log(
    "At session start:",
    isSessionWithinCheckInTime(
      timeTestSession,
      new Date("2026-09-15T10:00:00+01:00"),
    ),
  );

  console.log(
    "During session:",
    isSessionWithinCheckInTime(
      timeTestSession,
      new Date("2026-09-15T11:00:00+01:00"),
    ),
  );

  console.log(
    "At session end:",
    isSessionWithinCheckInTime(
      timeTestSession,
      new Date("2026-09-15T12:00:00+01:00"),
    ),
  );

  console.log(
    "After session:",
    isSessionWithinCheckInTime(
      timeTestSession,
      new Date("2026-09-15T12:01:00+01:00"),
    ),
  );

  console.log(
    "Before session:",
    getAttendanceStatus(timeTestSession, new Date("2026-09-15T09:30:00+01:00")),
  );

  console.log(
    "At session start:",
    getAttendanceStatus(timeTestSession, new Date("2026-09-15T10:00:00+01:00")),
  );

  console.log(
    "After session start:",
    getAttendanceStatus(timeTestSession, new Date("2026-09-15T10:15:00+01:00")),
  );

  console.log(
    "Session start:",
    getSessionStartDateTime(timeTestSession).toISOString(),
  );

  console.log(
    "Test time:",
    new Date("2026-09-15T09:59:00+01:00").toISOString(),
  );

  console.log(
    "Before session:",
    validateCheckInTime(timeTestSession, new Date("2026-09-15T09:59:00+01:00")),
  );

  console.log(
    "During session:",
    validateCheckInTime(timeTestSession, new Date("2026-09-15T11:00:00+01:00")),
  );

  console.log(
    "After session:",
    validateCheckInTime(timeTestSession, new Date("2026-09-15T12:01:00+01:00")),
  );

  const checkInValidation = await validateStudentCheckIn(
    testAttendance.student,
    testSession,
  );

  console.log("Check-in validation:", checkInValidation);

  console.log("QR attendance:", validateAttendanceMethod("qr"));

  console.log(
    "Manual attendance:",
    validateAttendanceMethod("manual", new mongoose.Types.ObjectId()),
  );

  console.log("Manual without marker:", validateAttendanceMethod("manual"));

  console.log("Invalid method:", validateAttendanceMethod("something-else"));

} catch (error) {
  console.error("Test failed:", error.message);
} finally {

  await mongoose.disconnect();

}
