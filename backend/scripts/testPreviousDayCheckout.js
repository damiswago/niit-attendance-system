import dotenv from "dotenv";
import mongoose from "mongoose";

import Attendance from "../models/Attendance.js";
import Session from "../models/Session.js";
import { automaticallyCheckoutAttendances } from "../services/attendanceService.js";

dotenv.config();

const testPreviousDayCheckout = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const session = await Session.findById("6ab1034c64adc8ad03355d2a");

    if (!session) {
        throw new Error("Test session not found");
    }

    console.log("Using test session:", session._id);

    const attendance = await Attendance.create({
        student: "6a8af5a382960655f13d2406",
        session: session._id,
        signIn: new Date("2026-09-18T10:30:00+01:00"),
        signInMethod: "qr",
        status: "late",
    });

    console.log("Test attendance created:", attendance._id);

    const simulatedCurrentTime = new Date("2026-09-21T08:30:00+01:00");

    const checkedOut =
      await automaticallyCheckoutAttendances(simulatedCurrentTime);

    console.log("\nAutomatically checked out:");
    console.log(checkedOut);

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    await mongoose.disconnect();
  }
};

testPreviousDayCheckout();
