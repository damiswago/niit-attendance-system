import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },

    password: {
        type: String,
        required: true
    },

    resetPasswordToken: {
        type: String,
        default: null
    },

    resetPasswordExpires: {
        type: Date,
        default: null
    },

    role: {
        type: String,
        enum: ["student", "instructor", "admin"],
        required: true
    },

    class: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
        default: null
    },

    status: {
        type: String,
        enum: ["active", "inactive"],
        default: "active"
    }

}, {
    timestamps: true
});

const User = mongoose.model("User", userSchema);
export default User;    