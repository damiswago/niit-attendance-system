import Notification from "../models/Notification.js";
import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
import { sendEmailBatch, EMAIL_BATCH_SIZE } from "./emailService.js";
import {
  buildSessionNotice,
  buildEmailHtml,
  buildEmailText,
} from "../utils/notificationMessages.js";

// Email is attempted only when Resend is configured, and can be switched off
// with NOTIFICATION_EMAILS=off. The in-app notice is always created.
const emailsEnabled = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL) &&
  process.env.NOTIFICATION_EMAILS !== "off";

// Resend allows about 2 requests a second by default; a pause between batches
// keeps a very large class under that
const BATCH_PAUSE_MS = 600;

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dayOf = (value) => new Date(value).toISOString().slice(0, 10);

// Sends the email copies in batches and records which went out.
// A failed batch is marked "failed" and the rest carry on.
const deliverEmails = async ({
  created,
  people,
  notice,
  className,
  mailer,
}) => {
  const html = buildEmailHtml({
    subject: notice.subject,
    message: notice.message,
    className,
    appUrl: process.env.APP_URL,
  });
  const text = buildEmailText({
    subject: notice.subject,
    message: notice.message,
    className,
  });

  const targets = created
    .map((doc, index) => ({ doc, person: people[index] }))
    .filter(({ doc }) => doc.status === "pending");

  for (let start = 0; start < targets.length; start += EMAIL_BATCH_SIZE) {
    if (start > 0) {
      await pause(BATCH_PAUSE_MS);
    }

    const batch = targets.slice(start, start + EMAIL_BATCH_SIZE);
    let sent = false;

    try {
      await mailer(
        batch.map(({ person }) => ({
          to: person.email,
          subject: notice.subject,
          html,
          text,
        })),
      );
      sent = true;
    } catch (error) {
      console.error("Notification email batch failed:", error.message);
    }

    await Notification.updateMany(
      { _id: { $in: batch.map(({ doc }) => doc._id) } },
      {
        $set: sent
          ? { status: "sent", sentAt: new Date() }
          : { status: "failed" },
      },
    );
  }
};

// Tells a class (and its instructor) that a session changed.
//
//   event:       one of SESSION_EVENTS (see utils/notificationMessages.js)
//   session:     the regular (original) session the change is about
//   replacement: { date, startTime, endTime } of its new slot, if it has one
//   previous:    { date, startTime, endTime } of a replacement slot that was
//                moved away from or cancelled
//   reason:      what the admin typed, if anything
//
// Resolves once the in-app notices are saved. Emails are sent after that, in
// the background: the returned `emailsDone` promise settles when they finish
// (the app doesn't wait for it). The in-app notice and the email are separate
// so a mail outage never loses the notice.
export const notifySessionChange = async (
  { event, session, replacement = null, previous = null, reason = null },
  { mailer = sendEmailBatch } = {},
) => {
  const timetable = await Timetable.findById(session.timetable)
    .select("class")
    .populate({ path: "class", select: "name" });

  const classRecord = timetable ? timetable.class : null;

  // Everyone in the class, plus the instructor teaching it
  const audience = [{ _id: session.instructor, status: "active" }];

  if (classRecord) {
    audience.push({
      role: "student",
      status: "active",
      class: classRecord._id,
    });
  }

  const people = await User.find({ $or: audience }).select("name email");

  if (!people.length) {
    return { notified: 0, emailsDone: Promise.resolve() };
  }

  const notice = buildSessionNotice(event, {
    course: session.course,
    className: classRecord ? classRecord.name : null,
    original: {
      date: dayOf(session.date),
      startTime: session.startTime,
      endTime: session.endTime,
    },
    replacement,
    previous,
    reason,
  });

  const sendEmails = emailsEnabled();

  const created = await Notification.insertMany(
    people.map((person) => ({
      recipient: person._id,
      type: notice.type,
      subject: notice.subject,
      message: notice.message,
      session: session._id,
      status: sendEmails && person.email ? "pending" : "skipped",
    })),
  );

  const emailsDone = sendEmails
    ? deliverEmails({
        created,
        people,
        notice,
        className: classRecord ? classRecord.name : null,
        mailer,
      }).catch((error) =>
        console.error("Could not record notification emails:", error.message),
      )
    : Promise.resolve();

  return { notified: created.length, emailsDone };
};
