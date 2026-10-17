import dotenv from "dotenv";
import mongoose from "mongoose";
import "../models/Session.js    "

import { getOpenAttendances } from "../services/attendanceService.js";

dotenv.config();

const checkOpenAttendances = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const attendances = await getOpenAttendances();

    console.log("Open attendances:");

    attendances.forEach((attendance) => {
      console.log({
        attendanceId: attendance._id,
        signIn: attendance.signIn,
        sessionId: attendance.session?._id,
        sessionDate: attendance.session?.date,
        sessionStart: attendance.session?.startTime,
        sessionEnd: attendance.session?.endTime,
        signOut: attendance.signOut,
        isValid: attendance.isValid,
      });
    });

    console.log(`Total: ${attendances.length}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    await mongoose.disconnect();
  }
};

checkOpenAttendances();
