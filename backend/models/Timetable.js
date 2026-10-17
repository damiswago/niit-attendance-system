import mongoose from "mongoose";

const timetableSchema = new mongoose.Schema({
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        required: true
    },

    course: {
        type: String,
        required: true,
        trim: true
    },

    daysOfWeek: {
        type: [String],
        enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",     
        ],
        required: true,
        validate: {
            validator: function (days) {
                return (
                    days.length > 0 &&
                    new Set(days).size === days.length
                );
            },
            message: "At least one valid and unique day must be selected",
        },
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

    isActive: {
        type: Boolean,
        default: true
    },

    effectiveFrom: {
        type: Date,
        required: true
    },

    effectiveUntil: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

const Timetable = mongoose.model("Timetable", timetableSchema);
export default Timetable;