import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser"
import sessionJob from "./jobs/sessionJob.js";
import "./jobs/attendanceJob.js";
import mongoose from "mongoose";

import connectDB from "./config/db.js";

import authRoutes from "./routes/authRoutes.js"
import userRoutes from "./routes/userRoutes.js";
import timetableRoutes from "./routes/timetableRoutes.js";
import sessionRoutes from "./routes/sessionRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import classRoutes from "./routes/classRoutes.js";

const app = express();
sessionJob(); // Start the session job when the server starts
app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: "http://127.0.0.1:5500",
    credentials: true,
  }),
);

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/timetable", timetableRoutes);
app.use("/api/sessions", sessionRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/classes", classRoutes);

const PORT = process.env.PORT || 5000;

connectDB();

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});