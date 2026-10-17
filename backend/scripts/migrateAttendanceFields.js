import dotenv from "dotenv";
import mongoose from "mongoose";
import Attendance from "../models/Attendance.js";

dotenv.config();

const migrateAttendanceFields = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const attendances = await Attendance.find({
      $or: [
        { method: { $exists: true } },
        { checkoutMethod: { $exists: true } },
      ],
    }).lean();

    let modifiedCount = 0;

    for (const attendance of attendances) {
      const update = {};

      if (attendance.method !== undefined) {
        update.signInMethod = attendance.method;
      }

      if (attendance.checkoutMethod !== undefined) {
        update.signOutMethod = attendance.checkoutMethod;
      }

      if (Object.keys(update).length > 0) {
        await Attendance.updateOne(
          { _id: attendance._id },
          {
            $set: update,
            $unset: {
              method: "",
              checkoutMethod: "",
            },
          },
        );

        modifiedCount++;
      }
    }

    console.log("Attendance field migration completed.");
    console.log(`Found: ${attendances.length}`);
    console.log(`Modified: ${modifiedCount}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("Attendance field migration failed:", error);
    await mongoose.disconnect();
  }
};

migrateAttendanceFields();
