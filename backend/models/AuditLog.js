import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    action: {
        type: String,
        required: true,
        trim: true
    },

    target: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
    },
    
    targetType: {
        type: String,
        enum: [
            "User",
            "Session",
            "Attendance",
            "Timetable",
            "Notification"
        ],
        default: null
    },

    details: {
        type: String,
        default: null,
        trim: true
    },
}, {
    timestamps: true
});

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;

