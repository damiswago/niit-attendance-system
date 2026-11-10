// Creates the FIRST administrator. Run it once after deploying:
//
//   ADMIN_NAME="Your Name" ADMIN_EMAIL=you@school.com ADMIN_PASSWORD='a-long-password' node scripts/createAdmin.js
//
// (or put those three in .env). Safe to run again: it won't create a second
// account for the same email. Remove ADMIN_PASSWORD from .env afterwards.
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import {
    isAcceptablePassword,
    hashPassword,
    PASSWORD_RULE_MESSAGE
} from "../utils/passwords.js";

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const name = (process.env.ADMIN_NAME || "").trim();
        // Same normalising as login, so the account can actually be logged into
        const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            throw new Error("ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set");
        }

        if (!isAcceptablePassword(password)) {
            throw new Error(PASSWORD_RULE_MESSAGE);
        }

        const existingAdmin = await User.findOne({ email });

        if (existingAdmin) {
            console.log("A user with this email already exists");
            return;
        }

        await User.create({
            name,
            email,
            password: await hashPassword(password),
            role: "admin"
        });

        console.log(`Admin created: ${email}`);
    } catch (error) {
        console.error("Failed to create admin:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

createAdmin();