import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    course: {
        type: String,
        required: true,
        trim: true
    },
    
    date: {
        type: Date,
        required: true
    },

    startTime: {
        type: String,
        required: true,  
        match: /^([01]\d|2[0-3]):[0-5]\d$/
    },

    endTime: {
        type: String,
        required: true,
        match: /^([01]\d|2[0-3]):[0-5]\d$/
    },  

    status: {
        type: String,
        enum: ["scheduled", "active", "postponed", "cancelled", "completed"],
        default: "scheduled"
    },

    timetable: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Timetable",
        required: true
    },

    isReplacement: {
        type: Boolean,
        default: false
    },

    rescheduledFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
        default: null
    },

    rescheduledTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
        default: null
    },

    cancelledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    cancelledAt: {
        type: Date,
        default: null
    },

    cancellationReason: {
        type: String,
        trim: true,
        default: null
    },

    postponedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    postponedAt: {
        type: Date,
        default: null
    },

    postponementReason: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true
});

const Session = mongoose.model("Session", sessionSchema);
export default Session;