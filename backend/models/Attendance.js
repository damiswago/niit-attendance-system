import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      required: true,
    },

    signIn: {
      type: Date,
      required: true,
    },

    signOut: {
      type: Date,
      default: null,
    },

    signOutMethod: {
      type: String,
      enum: ["manual", "automatic"],
      default: null,
    },

    status: {
      type: String,
      enum: ["present", "late"],
      required: true,
    },

    classAttended: {
      type: Boolean,
      default: null,
    },

    isValid: {
      type: Boolean,
      default: true,
    },

    invalidatedAt: {
      type: Date,
      default: null,
    },

    invalidationReason: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

attendanceSchema.index({ student: 1, session: 1 }, { unique: true });

// Admin report: filter by session(s), newest first, paged
attendanceSchema.index({ session: 1, createdAt: -1 });
attendanceSchema.index({ createdAt: -1, _id: -1 });

const Attendance = mongoose.model("Attendance", attendanceSchema);

export default Attendance;
