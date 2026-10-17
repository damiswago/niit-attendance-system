import mongoose from "mongoose";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import Attendance from "../models/Attendance.js";
import SessionHistory from "../models/sessionHistory.js";
import User from "../models/User.js";
import { createSessionDateTime } from "../utils/timeUtils.js";
import { notifySessionChange } from "../services/notificationService.js";

// Tells the class (and instructor) about a change. Called only AFTER the change
// has been committed, and it can never fail the request: a notification
// problem must not undo or hide what the admin just did.
const announce = async (details) => {
  try {
    await notifySessionChange(details);
  } catch (error) {
    console.error("Could not send notifications:", error);
  }
};

const dayOf = (value) => new Date(value).toISOString().slice(0, 10);

export const postponeSession = async (req, res) => {
  let dbSession;

  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const {
      timetable,
      date,
      replacementDate,
      replacementStartTime,
      replacementEndTime,
      reason,
    } = req.body;

    const { sessionId } = req.params;

    let occurrenceDate;
    let session;
    let timetableRecord;

    if (sessionId) {
      // FIX: reuse a single lookup instead of fetching the same
      // Session document twice.
      session = await Session.findById(sessionId);

      if (!session) {
        return res.status(404).json({
          message: "Session not found",
        });
      }

      timetableRecord = await Timetable.findById(session.timetable);

      if (!timetableRecord) {
        return res.status(404).json({
          message: "Timetable not found",
        });
      }

      occurrenceDate = session.date;
    } else {
      timetableRecord = await Timetable.findById(timetable);

      if (!timetableRecord) {
        return res.status(404).json({
          message: "Timetable not found",
        });
      }

      if (!date) {
        return res.status(400).json({
          message: "Session date is required",
        });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          message: "Session date must be in YYYY-MM-DD format",
        });
      }

      occurrenceDate = new Date(`${date}T00:00:00.000Z`);

      if (isNaN(occurrenceDate.getTime())) {
        return res.status(400).json({
          message: "Invalid session date",
        });
      }

      session = await Session.findOne({
        timetable: timetableRecord._id,
        date: occurrenceDate,
        isReplacement: false,
      });
    }

    // FIX: compute these only once `session` has its final value on
    // both branches above, instead of before it's ever assigned on the
    // `!sessionId` path (previously always evaluated to null there).
    const previousReplacementDate = session?.isReplacement
      ? session.date
      : null;

    const previousReplacementStartTime = session?.isReplacement
      ? session.startTime
      : null;

    const previousReplacementEndTime = session?.isReplacement
      ? session.endTime
      : null;

    let originalSession = session;

    if (session?.isReplacement) {
      originalSession = await Session.findById(session.rescheduledFrom);

      if (!originalSession) {
        return res.status(404).json({
          message: "Original session not found",
        });
      }
    }

    const wasReplacement = Boolean(session?.isReplacement);

    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const today = new Date(`${localDate}T00:00:00.000Z`);

    if (occurrenceDate < today) {
      return res.status(400).json({
        message: "Past sessions cannot be postponed",
      });
    }

    const occurrenceDay = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Lagos",
      weekday: "long",
    })
      .format(occurrenceDate)
      .toLowerCase();

    if (!wasReplacement) {
      if (!timetableRecord.daysOfWeek.includes(occurrenceDay)) {
        return res.status(400).json({
          message: "Selected date is not a scheduled day for this timetable",
        });
      }
    }

    if (!wasReplacement && occurrenceDate < timetableRecord.effectiveFrom) {
      return res.status(400).json({
        message: "Selected date is before the timetable effective date",
      });
    }

    if (
      !wasReplacement &&
      timetableRecord.effectiveUntil &&
      occurrenceDate > timetableRecord.effectiveUntil
    ) {
      return res.status(400).json({
        message: "Selected date is after the timetable effective date range",
      });
    }

    const replacementDetailsProvided =
      replacementDate || replacementStartTime || replacementEndTime;

    // True when this call only ADDS a replacement to a class that was already
    // postponed earlier (its postponement details must then be left alone)
    const alreadyPostponed =
      Boolean(session) && !session.isReplacement && session.status === "postponed";

    if (
      session &&
      (session.status === "completed" || session.status === "cancelled")
    ) {
      return res.status(400).json({
        message: "This session cannot be postponed",
      });
    }

    if (
      session &&
      session.status === "postponed" &&
      !session.isReplacement &&
      !replacementDetailsProvided
    ) {
      return res.status(400).json({
        message: "A replacement session is required for a postponed session",
      });
    }

    if (
      replacementDetailsProvided &&
      (!replacementDate || !replacementStartTime || !replacementEndTime)
    ) {
      return res.status(400).json({
        message: "All replacement details are required",
      });
    }

    if (replacementDetailsProvided) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(replacementDate)) {
        return res.status(400).json({
          message: "Replacement date must be in YYYY-MM-DD format",
        });
      }

      const replacementDateObject = new Date(
        `${replacementDate}T00:00:00.000Z`,
      );

      if (isNaN(replacementDateObject.getTime())) {
        return res.status(400).json({
          message: "Invalid replacement date",
        });
      }

      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(replacementStartTime) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(replacementEndTime)
      ) {
        return res.status(400).json({
          message: "Replacement times must be in HH:mm format",
        });
      }

      const replacementStartMinutes =
        parseInt(replacementStartTime.split(":")[0]) * 60 +
        parseInt(replacementStartTime.split(":")[1]);

      const replacementEndMinutes =
        parseInt(replacementEndTime.split(":")[0]) * 60 +
        parseInt(replacementEndTime.split(":")[1]);

      if (replacementEndMinutes <= replacementStartMinutes) {
        return res.status(400).json({
          message:
            "Replacement end time must be after the replacement start time",
        });
      }

      const originalDate = originalSession
        ? originalSession.date
        : occurrenceDate;
      const originalStartTime = originalSession
        ? originalSession.startTime
        : timetableRecord.startTime;

      const originalDateTime = new Date(
        `${new Date(originalDate).toISOString().split("T")[0]}T${originalStartTime}:00+01:00`,
      );

      const replacementDateTime = new Date(
        `${replacementDate}T${replacementStartTime}:00+01:00`,
      );

      if (replacementDateTime <= originalDateTime) {
        return res.status(400).json({
          message:
            "Replacement session must be scheduled after the original session",
        });
      }

      if (replacementDateTime <= new Date()) {
        return res.status(400).json({
          message: "Replacement session must be scheduled for a future time",
        });
      }

      // A replacement must not overlap the original session's slot
      // (e.g. original 10:00-12:00, replacement 11:00-13:00 on the
      // same day is still a conflict) so originalSession is
      // deliberately NOT excluded here. The only record we exclude is
      // the existing replacement session itself when we're
      // rescheduling a reschedule, since it's about to be deleted and
      // replaced regardless of this check's outcome.
      const excludedIds = [];
      if (wasReplacement && session?._id) {
        excludedIds.push(session._id);
      }

      // The slot must be free for the instructor AND for the class, so
      // students are never in two sessions at once
      const conflictInstructor = originalSession
        ? originalSession.instructor
        : timetableRecord.instructor;

      const classTimetableIds = timetableRecord.class
        ? await Timetable.distinct("_id", { class: timetableRecord.class })
        : [];

      const replacementDay = new Date(`${replacementDate}T00:00:00.000Z`);

      const conflictingSession = await Session.findOne({
        $or: [
          { instructor: conflictInstructor },
          { timetable: { $in: classTimetableIds } },
        ],
        date: replacementDay,
        _id: { $nin: excludedIds },
        status: { $nin: ["cancelled", "postponed"] },
        startTime: { $lt: replacementEndTime },
        endTime: { $gt: replacementStartTime },
      });

      if (conflictingSession) {
        return res.status(409).json({
          message:
            "The instructor or the class already has a session during the replacement time",
        });
      }

      // Session records only exist for days that were touched (today, or an
      // earlier postpone / cancel). Every other class day is implied by a
      // timetable, so those count as busy too. A stored session for that day
      // takes precedence: if it was cancelled or postponed the slot is free.
      const replacementWeekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Lagos",
        weekday: "long",
      })
        .format(replacementDay)
        .toLowerCase();

      const owners = [{ instructor: conflictInstructor }];

      if (timetableRecord.class) {
        owners.push({ class: timetableRecord.class });
      }

      const impliedTimetables = await Timetable.find({
        isActive: true,
        daysOfWeek: replacementWeekday,
        startTime: { $lt: replacementEndTime },
        endTime: { $gt: replacementStartTime },
        effectiveFrom: { $lte: replacementDay },
        $and: [
          {
            $or: [
              { effectiveUntil: null },
              { effectiveUntil: { $gte: replacementDay } },
            ],
          },
          { $or: owners },
        ],
      }).select("_id");

      if (impliedTimetables.length) {
        const storedForThatDay = await Session.find({
          timetable: { $in: impliedTimetables.map((t) => t._id) },
          date: replacementDay,
          isReplacement: false,
        }).select("timetable");

        const stored = new Set(
          storedForThatDay.map((s) => String(s.timetable)),
        );

        if (impliedTimetables.some((t) => !stored.has(String(t._id)))) {
          return res.status(409).json({
            message:
              "The instructor or the class already has a scheduled class during the replacement time",
          });
        }
      }
    }

    // All validation (including the replacement conflict check above)
    // has passed at this point, so it's now safe to materialize a
    // brand-new original Session document if one didn't already exist.
    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    if (!originalSession) {
      originalSession = await Session.create(
        [
          {
            instructor: timetableRecord.instructor,
            course: timetableRecord.course,
            date: occurrenceDate,
            startTime: timetableRecord.startTime,
            endTime: timetableRecord.endTime,
            status: "scheduled",
            timetable: timetableRecord._id,
            isReplacement: false,
          },
        ],
        { session: dbSession },
      );

      originalSession = originalSession[0];
    }

    if (wasReplacement) {
      await Attendance.deleteMany(
        { session: session._id },
        { session: dbSession },
      );

      await Session.findByIdAndDelete(session._id, { session: dbSession });
      originalSession.rescheduledTo = null;
    }

    if (replacementDetailsProvided) {
      const replacementSession = await Session.create(
        [
          {
            instructor: originalSession.instructor,
            course: originalSession.course,
            date: new Date(`${replacementDate}T00:00:00.000Z`),
            startTime: replacementStartTime,
            endTime: replacementEndTime,
            status: "scheduled",
            timetable: originalSession.timetable,
            isReplacement: true,
            rescheduledFrom: originalSession._id,
          },
        ],
        { session: dbSession },
      );

      const createdReplacementSession = replacementSession[0];

      originalSession.rescheduledTo = createdReplacementSession._id;
    }

    // Skipped when a replacement is merely being added to an already-postponed
    // class: otherwise the original reason, who postponed it and when would be
    // overwritten (the reason with nothing, as this request carries none)
    if (!wasReplacement && !alreadyPostponed) {
      originalSession.postponedBy = req.user.userId;
      originalSession.postponedAt = new Date();
      originalSession.postponementReason = reason || null;

      originalSession.status = "postponed";
    }

    await Attendance.updateMany(
      { session: originalSession._id },
      {
        $set: {
          isValid: false,
          invalidatedAt: new Date(),
        },
      },
      { session: dbSession },
    );

    await originalSession.save({ session: dbSession });

    // FIX: "rescheduled" only applies when a replacement was actually
    // torn down AND a new one was created in its place. If a replacement
    // existed but no new replacement details were supplied, we removed
    // the replacement and left the original merely "postponed" — that's
    // a distinct action ("replacement_cancelled"), not a reschedule.
    const historyAction = wasReplacement ? "rescheduled" : "postponed";

    await SessionHistory.create(
      [
        {
          session: originalSession._id,
          action: historyAction,
          admin: req.user.userId,
          reason: reason || null,
          previousDate: wasReplacement
            ? previousReplacementDate
            : originalSession.date,
          previousStartTime: wasReplacement
            ? previousReplacementStartTime
            : originalSession.startTime,
          previousEndTime: wasReplacement
            ? previousReplacementEndTime
            : originalSession.endTime,
          newDate: replacementDetailsProvided
            ? new Date(`${replacementDate}T00:00:00.000Z`)
            : null,
          newStartTime: replacementDetailsProvided
            ? replacementStartTime
            : null,
          newEndTime: replacementDetailsProvided ? replacementEndTime : null,
        },
      ],
      { session: dbSession },
    );

    await dbSession.commitTransaction();
    dbSession.endSession();

    let event = "session_postponed";

    if (wasReplacement) {
      event = replacementDetailsProvided
        ? "replacement_rescheduled"
        : "replacement_cancelled";
    } else if (alreadyPostponed) {
      event = "replacement_scheduled";
    }

    await announce({
      event,
      session: originalSession,
      replacement: replacementDetailsProvided
        ? {
            date: replacementDate,
            startTime: replacementStartTime,
            endTime: replacementEndTime,
          }
        : null,
      previous: wasReplacement
        ? {
            date: dayOf(previousReplacementDate),
            startTime: previousReplacementStartTime,
            endTime: previousReplacementEndTime,
          }
        : null,
      reason: reason || originalSession.postponementReason,
    });

    return res.status(200).json({
      message: wasReplacement
        ? replacementDetailsProvided
          ? "Replacement session rescheduled successfully"
          : "Replacement session cancelled successfully"
        : "Session postponed successfully",
      session: originalSession,
    });
  } catch (error) {
    console.error("Error postponing session:", error);

    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }

    if (dbSession) {
      dbSession.endSession();
    }

    return res.status(500).json({
      message: "Failed to postpone session",
      error: error.message,
    });
  }
};

export const undoPostponement = async (req, res) => {
  let dbSession;

  try {
    const { sessionId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    if (session.isReplacement) {
      return res.status(400).json({
        message: "Only original sessions can have their postponement undone",
      });
    }

    if (session.status !== "postponed") {
      return res.status(400).json({
        message: "This session is not postponed",
      });
    }

    const sessionDate = session.date.toISOString().split("T")[0];

    const originalStart = new Date(
      `${sessionDate}T${session.startTime}:00+01:00`,
    );

    if (new Date() >= originalStart) {
      return res.status(400).json({
        message:
          "Postponement cannot be undone after the original session start time",
      });
    }

    let replacementSession = null;

    if (session.rescheduledTo) {
      replacementSession = await Session.findById(session.rescheduledTo);

      if (!replacementSession) {
        return res.status(404).json({
          message: "Replacement session not found",
        });
      }
    }

    if (replacementSession && replacementSession.status !== "scheduled") {
      return res.status(400).json({
        message:
          "Postponement cannot be undone after the replacement session has started",
      });
    }

    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    if (replacementSession) {
      await Attendance.deleteMany(
        { session: replacementSession._id },
        { session: dbSession },
      );

      await Session.findByIdAndDelete(replacementSession._id, {
        session: dbSession,
      });
    }

    session.rescheduledTo = null;

    session.status = "scheduled";
    session.postponedBy = null;
    session.postponedAt = null;
    session.postponementReason = null;

    await session.save({
      session: dbSession,
    });

    await Attendance.updateMany(
      { session: session._id },
      {
        $set: {
          isValid: true,
          invalidatedAt: null,
        },
      },
      { session: dbSession },
    );

    await SessionHistory.create(
      [
        {
          session: session._id,
          action: "postponement_undone",
          admin: req.user.userId,
          reason: null,
          previousDate: session.date,
          previousStartTime: session.startTime,
          previousEndTime: session.endTime,
        },
      ],
      { session: dbSession },
    );

    await dbSession.commitTransaction();
    dbSession.endSession();

    await announce({ event: "postponement_undone", session });

    return res.status(200).json({
      message: "Postponement undone successfully",
      session,
    });
  } catch (error) {
    console.error("Error undoing postponement:", error);

    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }

    if (dbSession) {
      dbSession.endSession();
    }

    return res.status(500).json({
      message: "Failed to undo postponement",
      error: error.message,
    });
  }
};

export const cancelSession = async (req, res) => {
  let dbSession;

  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const { sessionId } = req.params;
    const { timetable, date, reason } = req.body;

    let session;
    let timetableRecord;
    let occurrenceDate;
    let sessionAlreadyExists = false;

    if (sessionId) {
      session = await Session.findById(sessionId);

      if (!session) {
        return res.status(404).json({
          message: "Session not found",
        });
      }

      timetableRecord = await Timetable.findById(session.timetable);

      if (!timetableRecord) {
        return res.status(404).json({
          message: "Timetable not found",
        });
      }

      sessionAlreadyExists = true;
    } else {
      timetableRecord = await Timetable.findById(timetable);

      if (!timetableRecord) {
        return res.status(400).json({
          message: "Timetable not found",
        });
      }

      if (!date) {
        return res.status(400).json({
          message: "Session date is required",
        });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          message: "Session date must be in YYYY-MM-DD format",
        });
      }

      occurrenceDate = new Date(`${date}T00:00:00.000Z`);

      if (isNaN(occurrenceDate.getTime())) {
        return res.status(400).json({
          message: "Invalid session date",
        });
      }

      const occurrenceDay = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Lagos",
        weekday: "long",
      })
        .format(occurrenceDate)
        .toLowerCase();

      if (!timetableRecord.daysOfWeek.includes(occurrenceDay)) {
        return res.status(400).json({
          message: "Selected date is not a scheduled day for this timetable",
        });
      }

      if (occurrenceDate < timetableRecord.effectiveFrom) {
        return res.status(400).json({
          message: "Selected date is before the timetable effective date",
        });
      }

      if (
        timetableRecord.effectiveUntil &&
        occurrenceDate > timetableRecord.effectiveUntil
      ) {
        return res.status(400).json({
          message: "Selected date is after the timetable effective date range",
        });
      }

      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      const today = new Date(`${localDate}T00:00:00.000Z`);

      if (occurrenceDate < today) {
        return res.status(400).json({
          message: "Past sessions cannot be cancelled",
        });
      }

      session = await Session.findOne({
        timetable: timetableRecord._id,
        date: occurrenceDate,
        isReplacement: false,
      });

      if (session) {
        sessionAlreadyExists = true;
      }

      if (
        sessionAlreadyExists &&
        (session.status === "cancelled" || session.status === "completed")
      ) {
        return res.status(400).json({
          message: "This session cannot be cancelled",
        });
      }
    }

    if (!session) {
      session = new Session({
        instructor: timetableRecord.instructor,
        course: timetableRecord.course,
        date: occurrenceDate,
        startTime: timetableRecord.startTime,
        endTime: timetableRecord.endTime,
        status: "cancelled",
        timetable: timetableRecord._id,
        isReplacement: false,
        cancelledBy: req.user.userId,
        cancelledAt: new Date(),
        cancellationReason: reason || null,
      });
    }

    if (
      sessionAlreadyExists &&
      (session.status === "cancelled" || session.status === "completed")
    ) {
      return res.status(400).json({
        message: "This session cannot be cancelled",
      });
    }

    if (session.isReplacement) {
      return res.status(400).json({
        message:
          "Replacement sessions must be cancelled using the replacement cancellation operation",
      });
    }

    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    if (session.rescheduledTo) {
      const replacementSession = await Session.findById(
        session.rescheduledTo,
      ).session(dbSession);

      if (replacementSession) {
        await Attendance.deleteMany(
          { session: replacementSession._id },
          { session: dbSession },
        );

        await Session.findByIdAndDelete(replacementSession._id, {
          session: dbSession,
        });
      }

      session.rescheduledTo = null;
    }

    session.status = "cancelled";
    session.cancelledBy = req.user.userId;
    session.cancelledAt = new Date();
    session.cancellationReason = reason || null;

    await Attendance.updateMany(
      { session: session._id },
      {
        $set: {
          isValid: false,
          invalidatedAt: new Date(),
        },
      },
      { session: dbSession },
    );

    await session.save({ session: dbSession });

    await SessionHistory.create(
      [
        {
          session: session._id,
          action: "cancelled",
          admin: req.user.userId,
          reason: reason || null,
        },
      ],
      { session: dbSession },
    );

    await dbSession.commitTransaction();
    await dbSession.endSession();

    await announce({ event: "session_cancelled", session, reason });

    return res.status(200).json({
      message: "Session cancelled successfully",
      session,
    });
  } catch (error) {
    console.error("Error cancelling session:", error);

    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }

    if (dbSession) {
      dbSession.endSession();
    }

    return res.status(500).json({
      message: "Failed to cancel session",
      error: error.message,
    });
  }
};

export const cancelReplacementSession = async (req, res) => {
  let dbSession;

  try {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const { sessionId } = req.params;

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    if (!session.isReplacement) {
      return res.status(400).json({
        message: "This operation is only for replacement sessions",
      });
    }

    const originalSession = await Session.findById(session.rescheduledFrom);

    if (!originalSession) {
      return res.status(404).json({
        message: "Original session not found",
      });
    }

    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    await Attendance.deleteMany(
      { session: session._id },
      { session: dbSession },
    );

    await Session.findByIdAndDelete(session._id, { session: dbSession });

    originalSession.rescheduledTo = null;

    await originalSession.save({
      session: dbSession,
    });

    await SessionHistory.create(
      [
        {
          session: originalSession._id,
          action: "replacement_cancelled",
          admin: req.user.userId,
          reason: req.body.reason || null,
          previousDate: session.date,
          previousStartTime: session.startTime,
          previousEndTime: session.endTime,
        },
      ],
      { session: dbSession },
    );

    await dbSession.commitTransaction();
    dbSession.endSession();

    await announce({
      event: "replacement_cancelled",
      session: originalSession,
      previous: {
        date: dayOf(session.date),
        startTime: session.startTime,
        endTime: session.endTime,
      },
      reason: req.body.reason,
    });

    return res.status(200).json({
      message: "Replacement session cancelled successfully",
      session: originalSession,
    });
  } catch (error) {
    console.error("Error cancelling replacement session:", error);

    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }

    if (dbSession) {
      dbSession.endSession();
    }

    return res.status(500).json({
      message: "Failed to cancel replacement session",
      error: error.message,
    });
  }
};

export const undoCancellation = async (req, res) => {
  let dbSession;

  try {
    const { sessionId } = req.params;

    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const session = await Session.findById(sessionId);

    if (!session) {
      return res.status(404).json({
        message: "Session not found",
      });
    }

    if (session.isReplacement) {
      return res.status(400).json({
        message: "Only original sessions can have their cancellation undone",
      });
    }

    if (session.status !== "cancelled") {
      return res.status(400).json({
        message: "This session is not cancelled",
      });
    }

    const sessionDate = session.date.toISOString().split("T")[0];

    const originalStart = new Date(
      `${sessionDate}T${session.startTime}:00+01:00`,
    );

    if (new Date() >= originalStart) {
      return res.status(400).json({
        message:
          "Cancellation cannot be undone after the original session start time",
      });
    }

    dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    session.status = "scheduled";
    session.cancelledBy = null;
    session.cancelledAt = null;
    session.cancellationReason = null;

    await session.save({
      session: dbSession,
    });

    await Attendance.updateMany(
      { session: session._id },
      {
        $set: {
          isValid: true,
          invalidatedAt: null,
        },
      },
      { session: dbSession },
    );

    await SessionHistory.create(
      [
        {
          session: session._id,
          action: "cancellation_undone",
          admin: req.user.userId,
          reason: null,
          previousDate: session.date,
          previousStartTime: session.startTime,
          previousEndTime: session.endTime,
        },
      ],
      { session: dbSession },
    );

    await dbSession.commitTransaction();
    dbSession.endSession();

    await announce({ event: "cancellation_undone", session });

    return res.status(200).json({
      message: "Cancellation undone successfully",
      session,
    });
  } catch (error) {
    console.error("Error undoing cancellation:", error);

    if (dbSession && dbSession.inTransaction()) {
      await dbSession.abortTransaction();
    }

    if (dbSession) {
      dbSession.endSession();
    }

    return res.status(500).json({
      message: "Failed to undo cancellation",
      error: error.message,
    });
  }
};

// The session a student should be looking at right now, for THEIR class only.
// Sessions are created as "active" at the start of the day, so a class with
// several sessions today has several active ones: pick the one running now,
// otherwise the next one that starts.
export const getCurrentSession = async (req, res) => {
  try {
    const student = await User.findById(req.user.userId).select("class");

    if (!student || !student.class) {
      return res.status(403).json({
        message:
          "You have not been assigned to a class yet. Please contact your administrator.",
      });
    }

    const now = new Date();

    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const today = new Date(`${localDate}T00:00:00.000Z`);

    const timetableIds = await Timetable.distinct("_id", {
      class: student.class,
    });

    const sessions = await Session.find({
      date: today,
      status: "active",
      timetable: { $in: timetableIds },
    }).sort({ startTime: 1 });

    const session =
      sessions.find(
        (item) =>
          now >= createSessionDateTime(item.date, item.startTime) &&
          now <= createSessionDateTime(item.date, item.endTime),
      ) ||
      sessions.find(
        (item) => now < createSessionDateTime(item.date, item.startTime),
      );

    if (!session) {
      return res.status(404).json({
        message: "No active session",
      });
    }

    return res.status(200).json({
      session,
    });
  } catch (error) {
    console.error("Error retrieving current session:", error);

    return res.status(500).json({
      message: "Failed to retrieve current session",
      error: error.message,
    });
  }
};