// Wording for the notices sent when an admin changes a class. Pure functions
// (no database, no email), so the text is easy to test and to change.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2026-10-12" (or a Date at UTC midnight) -> "Mon 12 Oct 2026"
export const formatDay = (value) => {
  const date = new Date(value);

  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

const slot = ({ date, startTime, endTime }) =>
  `${formatDay(date)}, ${startTime}\u2013${endTime}`;

const reasonSentence = (reason) =>
  reason && reason.trim() ? ` Reason: ${reason.trim()}.` : "";

// event is one of the keys below.
// details: {
//   course, className,
//   original:    { date, startTime, endTime }  the regular class
//   replacement: { date, startTime, endTime }  its new slot (if any)
//   previous:    { date, startTime, endTime }  a replacement slot that was
//                                              moved away from / removed
//   reason
// }
// Returns { type, subject, message }.
const BUILDERS = {
  session_postponed: ({ course, original, replacement, reason }) => ({
    subject: `Class postponed: ${course}`,
    message: replacement
      ? `${course} on ${slot(original)} has been postponed. It will now take place on ${slot(replacement)}.${reasonSentence(reason)}`
      : `${course} on ${slot(original)} has been postponed.${reasonSentence(reason)} A new date has not been set yet; you will be told as soon as it is.`,
  }),

  replacement_scheduled: ({ course, original, replacement, reason }) => ({
    subject: `New date set: ${course}`,
    message: `The postponed ${course} class of ${slot(original)} will now take place on ${slot(replacement)}.${reasonSentence(reason)}`,
  }),

  replacement_rescheduled: ({
    course,
    original,
    replacement,
    previous,
    reason,
  }) => ({
    subject: `Class moved again: ${course}`,
    message: `The replacement for ${course} (originally ${slot(original)}) has moved from ${slot(previous)} to ${slot(replacement)}.${reasonSentence(reason)}`,
  }),

  replacement_cancelled: ({ course, original, previous, reason }) => ({
    subject: `Replacement cancelled: ${course}`,
    message: `The replacement for ${course} on ${slot(previous)} has been cancelled. The original class (${slot(original)}) is still postponed, and a new date will be announced.${reasonSentence(reason)}`,
  }),

  session_cancelled: ({ course, original, reason }) => ({
    subject: `Class cancelled: ${course}`,
    message: `${course} on ${slot(original)} has been cancelled.${reasonSentence(reason)}`,
  }),

  postponement_undone: ({ course, original }) => ({
    subject: `Class back on: ${course}`,
    message: `The postponement of ${course} has been reversed. The class will take place as originally scheduled, on ${slot(original)}. Any replacement session has been removed.`,
  }),

  cancellation_undone: ({ course, original }) => ({
    subject: `Class back on: ${course}`,
    message: `The cancellation of ${course} has been reversed. The class will take place as scheduled, on ${slot(original)}.`,
  }),
};

export const SESSION_EVENTS = Object.keys(BUILDERS);

export const buildSessionNotice = (event, details) => {
  const build = BUILDERS[event];

  if (!build) {
    throw new Error(`Unknown notification event: ${event}`);
  }

  const { subject, message } = build(details);

  return { type: event, subject, message };
};

const escapeHtml = (text) =>
  String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// The email body. Everything that came from a person (course, reason, class
// name) is escaped, because it ends up inside HTML.
export const buildEmailHtml = ({ subject, message, className, appUrl }) => `
  <h2>${escapeHtml(subject)}</h2>
  ${className ? `<p><strong>Class:</strong> ${escapeHtml(className)}</p>` : ""}
  <p>${escapeHtml(message)}</p>
  ${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open the attendance system</a></p>` : ""}
  <p style="color:#5a6784;font-size:12px">This is an automated message from the NIIT Attendance Management System.</p>
`;

export const buildEmailText = ({ subject, message, className }) =>
  `${subject}\n\n${className ? `Class: ${className}\n` : ""}${message}\n`;
