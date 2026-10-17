import mongoose from "mongoose";

const sessionHistorySchema = new mongoose.Schema({
    session: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
        required: true,
    },

    action: {
        type: String,
        enum: [
            "postponed",
            "rescheduled",
            "replacement_cancelled",
            "cancelled",
            "postponement_undone",
            "cancellation_undone",
        ],
        required: true,
    },

    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },

    reason: {
        type: String,
        trim: true,
        default: null,
    },

    previousDate: {
        type: Date,
        default: null,
    },

    previousStartTime: {
        type: String,
        default: null,
    },

    previousEndTime: {
        type: String,
        default: null,
    },

    newDate: {
        type: Date,
        default: null,
    },

    newStartTime: {
        type: String,
        default: null,
    },

    newEndTime: {
        type: String,
        default: null,
    }
}, {
    timestamps: true
});

sessionHistorySchema.index({ session: 1, createdAt: -1 });

const SessionHistory = mongoose.model("SessionHistory", sessionHistorySchema);

export default SessionHistory;
