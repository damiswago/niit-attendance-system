import mongoose from "mongoose";
import Class from "../models/Class.js";
import User from "../models/User.js";
import Timetable from "../models/Timetable.js";
import { sameTextIgnoringCase } from "../utils/search.js";

const MAX_NAME_LENGTH = 80;

// Returns the cleaned-up name, or { error } if it can't be used
const cleanName = (value) => {
  const name = typeof value === "string" ? value.trim() : "";

  if (!name) {
    return { error: "Class name is required" };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Class name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }

  return { name };
};

export const createClass = async (req, res) => {
  try {
    const cleaned = cleanName(req.body.name);

    if (cleaned.error) {
      return res.status(400).json({
        message: cleaned.error,
      });
    }

    const { name } = cleaned;

    // "cohort 1" and "Cohort 1" are the same class
    const existingClass = await Class.findOne({
      name: sameTextIgnoringCase(name),
    });

    if (existingClass) {
      return res.status(409).json({
        message: "A class with this name already exists",
      });
    }

    const newClass = await Class.create({
      name,
    });

    return res.status(201).json({
      message: "Class created successfully",
      class: newClass,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A class with this name already exists",
      });
    }

    console.error("Error creating class:", error);

    return res.status(500).json({
      message: "Failed to create class",
      error: error.message,
    });
  }
};

export const getClasses = async (req, res) => {
  try {
    const classes = await Class.find().sort({ name: 1 });

    return res.status(200).json({
      message: "Classes retrieved successfully",
      classes,
    });
  } catch (error) {
    console.error("Error retrieving classes:", error);

    return res.status(500).json({
      message: "Failed to retrieve classes",
      error: error.message,
    });
  }
};

// Admin: rename a class. Its students and timetables stay attached.
export const updateClass = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const cleaned = cleanName(req.body.name);

    if (cleaned.error) {
      return res.status(400).json({ message: cleaned.error });
    }

    const { name } = cleaned;

    const classRecord = await Class.findById(id);

    if (!classRecord) {
      return res.status(404).json({ message: "Class not found" });
    }

    // Another class with this name (ignoring case)? The class's OWN current
    // name doesn't count, so "cohort 1" can be fixed to "Cohort 1".
    const clash = await Class.findOne({
      name: sameTextIgnoringCase(name),
      _id: { $ne: classRecord._id },
    }).select("_id");

    if (clash) {
      return res.status(409).json({
        message: "A class with this name already exists",
      });
    }

    classRecord.name = name;

    await classRecord.save();

    return res.status(200).json({
      message: "Class renamed successfully",
      class: classRecord,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A class with this name already exists",
      });
    }

    console.error("Error renaming class:", error);

    return res.status(500).json({
      message: "Failed to rename class",
      error: error.message,
    });
  }
};

// Admin: delete a class, but only an EMPTY one. A class that still has
// students or timetables is refused (with the numbers), because deleting it
// would leave them pointing at nothing.
export const deleteClass = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const classRecord = await Class.findById(id);

    if (!classRecord) {
      return res.status(404).json({ message: "Class not found" });
    }

    const [students, timetables] = await Promise.all([
      User.countDocuments({ class: classRecord._id }),
      Timetable.countDocuments({ class: classRecord._id }),
    ]);

    if (students || timetables) {
      const parts = [];

      if (students) {
        parts.push(`${students} ${students === 1 ? "student" : "students"}`);
      }

      if (timetables) {
        parts.push(
          `${timetables} ${timetables === 1 ? "timetable" : "timetables"}`,
        );
      }

      return res.status(409).json({
        message: `This class still has ${parts.join(" and ")}. Move or remove them first.`,
      });
    }

    await classRecord.deleteOne();

    return res.status(200).json({
      message: "Class deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting class:", error);

    return res.status(500).json({
      message: "Failed to delete class",
      error: error.message,
    });
  }
};