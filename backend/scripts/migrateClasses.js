// One-off: gives existing students and timetables a class.
//
//   node scripts/migrateClasses.js            -> uses a class called "General"
//   node scripts/migrateClasses.js "Cohort 1" -> uses/creates that class
//
// Safe to run more than once: it only touches records that have no class yet.
// Afterwards, move students and timetables to their real classes in the admin
// dashboard (Manage Users -> Class column, Manage Timetables -> Edit).
import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import Timetable from "../models/Timetable.js";
import Class from "../models/Class.js";

const noClass = { $or: [{ class: null }, { class: { $exists: false } }] };

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const name = (process.argv[2] || "General").trim();

    const targetClass =
      (await Class.findOne({ name })) || (await Class.create({ name }));

    const students = await User.updateMany(
      { role: "student", ...noClass },
      { $set: { class: targetClass._id } },
    );

    const timetables = await Timetable.updateMany(noClass, {
      $set: { class: targetClass._id },
    });

    console.log(`Class "${targetClass.name}" ready.`);
    console.log(`Students updated: ${students.modifiedCount}`);
    console.log(`Timetables updated: ${timetables.modifiedCount}`);
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

migrate();
