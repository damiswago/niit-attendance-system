import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const name = process.env.ADMIN_NAME;
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password) {
            throw new Error("Admin credentials are missing from .env");
        }

        const existingAdmin = await User.findOne({
            email
        });

        if (existingAdmin) {
            console.log("Admin already exists");
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await User.create({
            name,
            email,
            password: hashedPassword,
            role: "admin"
        });

        console.log("Admin created successfully");
    } catch (error) {
        console.error("Failed to create admin:", error.message);
    } finally {
        await mongoose.disconnect();
    }
};

createAdmin();