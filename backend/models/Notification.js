import mongoose from "mongoose";

// One row per person per notice. It is both the in-app inbox entry (read /
// unread) and the record of whether the email copy went out.
export const NOTIFICATION_TYPES = [
  "attendance_warning",
  "attendance_report",
  "session_postponed",
  "replacement_scheduled",
  "replacement_rescheduled",
  "replacement_cancelled",
  "session_cancelled",
  "postponement_undone",
  "cancellation_undone",
];

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    // The session the notice is about. It may no longer exist (replacement
    // sessions are deleted when they are cancelled), so it is only a pointer.
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },

    // Delivery of the EMAIL copy. The in-app copy exists regardless.
    // "skipped" = email is switched off, or the person has no address.
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "skipped"],
      default: "pending",
    },

    sentAt: {
      type: Date,
      default: null,
    },

    // When the person opened it in the app (null = unread)
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// The inbox: a person's notices, newest first, unread counted quickly
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

// Old notices clean themselves up after 90 days
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 90 },
);

const Notification = mongoose.model("Notification", notificationSchema);

export default Notification;
