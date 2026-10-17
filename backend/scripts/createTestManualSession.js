import dotenv from "dotenv";
import mongoose from "mongoose";

import Session from "../models/Session.js";

dotenv.config();

const createTestManualSession = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const session = await Session.create({
      instructor: "6a8b4e05544ac82692534519",
      course: "MANUAL TEST COURSE 2",
      date: new Date("2026-09-21"),
      startTime: "08:00",
      endTime: "10:00",
      status: "active",
      timetable: "6a9a6bf5fe0dc80020e32d24",
      isReplacement: false,
    });

    console.log("New test manual attendance session created:");
    console.log(session);

    await mongoose.disconnect();
  } catch (error) {
    console.error(error);
    await mongoose.disconnect();
  }
};

createTestManualSession();
