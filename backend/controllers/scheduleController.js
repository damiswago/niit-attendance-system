import mongoose from "mongoose";
import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";

// Admin schedule view.
//
// Session documents only exist for today and for days an admin has already
// changed (postponed / cancelled). Every other upcoming class day is implied
// by a timetable, so this endpoint merges both into one list. Each row says
// which admin actions are valid, so the rules live here and not in the UI.

const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 14;
const MAX_RANGE_DAYS = 62;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "YYYY-MM-DD" for the current calendar day in Lagos
const lagosToday = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now);

// Strict YYYY-MM-DD -> Date at UTC midnight (how session dates are stored),
// or null. 2026-02-30 is rejected instead of rolling over to March.
const parseDay = (value) => {
  if (!DATE_PATTERN.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !isNaN(date) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

// Class times are Lagos time (UTC+1, no daylight saving)
const momentOf = (key, time) => new Date(`${key}T${time}:00+01:00`);

// What an admin may do with one row, given where it is in its life.
// Mirrors the rules enforced by sessionController so the UI never offers a
// button that is certain to fail.
export const getActions = (entry, now = new Date()) => {
  const start = momentOf(entry.date, entry.startTime);
  const end = momentOf(entry.date, entry.endTime);

  if (entry.isReplacement) {
    return entry.status === "scheduled" && now < start
      ? ["reschedule", "cancel_replacement"]
      : [];
  }

  if (entry.status === "scheduled" || entry.status === "active") {
    return now < end ? ["postpone", "cancel"] : [];
  }

  if (entry.status === "postponed") {
    const actions = [];

    if (!entry.hasReplacement && entry.date >= lagosToday(now)) {
      actions.push("add_replacement");
    }

    const replacementUntouched =
      !entry.hasReplacement || entry.replacementStatus === "scheduled";

    if (now < start && replacementUntouched) {
      actions.push("undo_postponement");
    }

    return actions;
  }

  if (entry.status === "cancelled") {
    return now < start ? ["undo_cancellation"] : [];
  }

  return []; // completed
};

const asQueryString = (value) =>
  value === undefined ? "" : typeof value === "string" ? value.trim() : null;

const refOf = (ref) => (ref ? { _id: ref._id, name: ref.name } : null);

export const getSchedule = async (req, res) => {
  try {
    const now = new Date();
    const todayKey = lagosToday(now);

    const fromParam = asQueryString(req.query.from);
    const toParam = asQueryString(req.query.to);
    const classParam = asQueryString(req.query.class);

    if (fromParam === null || toParam === null || classParam === null) {
      return res.status(400).json({ message: "Invalid filter" });
    }

    const from = parseDay(fromParam || todayKey);

    if (!from) {
      return res
        .status(400)
        .json({ message: "Start date must be in YYYY-MM-DD format" });
    }

    const to = toParam
      ? parseDay(toParam)
      : new Date(from.getTime() + (DEFAULT_RANGE_DAYS - 1) * DAY_MS);

    if (!to) {
      return res
        .status(400)
        .json({ message: "End date must be in YYYY-MM-DD format" });
    }

    if (to < from) {
      return res
        .status(400)
        .json({ message: "End date can't be before the start date" });
    }

    if ((to - from) / DAY_MS + 1 > MAX_RANGE_DAYS) {
      return res.status(400).json({
        message: `Please choose a range of at most ${MAX_RANGE_DAYS} days`,
      });
    }

    if (classParam && !mongoose.isValidObjectId(classParam)) {
      return res.status(400).json({ message: "Invalid class" });
    }

    // Instructors only ever see their own classes, and can't change them
    const isInstructor = req.user.role === "instructor";
    const ownOnly = isInstructor ? { instructor: req.user.userId } : {};

    // Real sessions in the range (originals and replacements)
    const sessions = await Session.find({
      date: { $gte: from, $lte: to },
      ...ownOnly,
    })
      .populate({ path: "instructor", select: "name" })
      .sort({ date: 1, startTime: 1 });

    // The other end of any postponement link, which may fall outside the range
    const linkIds = sessions
      .flatMap((session) => [session.rescheduledFrom, session.rescheduledTo])
      .filter(Boolean);

    const linked = linkIds.length
      ? await Session.find({ _id: { $in: linkIds } }).select(
          "date startTime endTime status",
        )
      : [];

    const linkedById = new Map(linked.map((s) => [String(s._id), s]));

    // Timetables that generate class days in the range, plus the ones the
    // sessions above came from (they may have been deactivated since)
    const timetables = await Timetable.find({
      ...ownOnly,
      $or: [
        { _id: { $in: sessions.map((session) => session.timetable) } },
        {
          isActive: true,
          effectiveFrom: { $lte: to },
          $or: [{ effectiveUntil: null }, { effectiveUntil: { $gte: from } }],
        },
      ],
    }).populate([
      { path: "instructor", select: "name" },
      { path: "class", select: "name" },
    ]);

    const timetableById = new Map(timetables.map((t) => [String(t._id), t]));

    const makeEntry = (session, timetable, key) => {
      const source = session || timetable;
      const replacement = session?.rescheduledTo
        ? linkedById.get(String(session.rescheduledTo))
        : null;
      const original = session?.rescheduledFrom
        ? linkedById.get(String(session.rescheduledFrom))
        : null;

      const entry = {
        id: session ? session._id : null,
        timetable: timetable ? timetable._id : session.timetable,
        course: source.course,
        class: timetable ? refOf(timetable.class) : null,
        instructor: refOf(session ? session.instructor : timetable.instructor),
        date: key,
        startTime: source.startTime,
        endTime: source.endTime,
        status: session ? session.status : "scheduled",
        isReplacement: Boolean(session?.isReplacement),
        virtual: !session,
        reason: !session
          ? null
          : session.status === "cancelled"
            ? session.cancellationReason
            : session.status === "postponed"
              ? session.postponementReason
              : null,
        replacement: replacement
          ? {
              id: replacement._id,
              date: dayKey(replacement.date),
              startTime: replacement.startTime,
              endTime: replacement.endTime,
              status: replacement.status,
            }
          : null,
        original: original
          ? {
              id: original._id,
              date: dayKey(original.date),
              startTime: original.startTime,
              endTime: original.endTime,
            }
          : null,
      };

      entry.actions = isInstructor
        ? []
        : getActions(
            {
              ...entry,
              hasReplacement: Boolean(replacement),
              replacementStatus: replacement ? replacement.status : null,
            },
            now,
          );

      return entry;
    };

    const originals = new Map();

    sessions
      .filter((session) => !session.isReplacement)
      .forEach((session) =>
        originals.set(`${session.timetable}|${dayKey(session.date)}`, session),
      );

    const used = new Set();
    const entries = [];

    for (let time = from.getTime(); time <= to.getTime(); time += DAY_MS) {
      const day = new Date(time);
      const key = dayKey(day);
      const weekday = DAYS[day.getUTCDay()];

      for (const timetable of timetables) {
        const runsThatDay =
          timetable.isActive &&
          timetable.daysOfWeek.includes(weekday) &&
          timetable.effectiveFrom <= day &&
          (!timetable.effectiveUntil || timetable.effectiveUntil >= day);

        if (!runsThatDay) {
          continue;
        }

        const existing = originals.get(`${timetable._id}|${key}`);

        if (existing) {
          used.add(String(existing._id));
          entries.push(makeEntry(existing, timetable, key));
        } else if (key >= todayKey) {
          // Nothing is stored for past days that never got a session, so only
          // upcoming days are filled in from the timetable
          entries.push(makeEntry(null, timetable, key));
        }
      }
    }

    // Replacements, and sessions whose timetable no longer generates that day
    sessions
      .filter((session) => !used.has(String(session._id)))
      .forEach((session) =>
        entries.push(
          makeEntry(
            session,
            timetableById.get(String(session.timetable)),
            dayKey(session.date),
          ),
        ),
      );

    const visible = classParam
      ? entries.filter(
          (entry) => entry.class && String(entry.class._id) === classParam,
        )
      : entries;

    visible.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.course.localeCompare(b.course),
    );

    return res.status(200).json({
      from: dayKey(from),
      to: dayKey(to),
      today: todayKey,
      sessions: visible,
    });
  } catch (error) {
    console.error("Error retrieving schedule:", error);

    return res.status(500).json({
      message: "Failed to retrieve schedule",
      error: error.message,
    });
  }
};
