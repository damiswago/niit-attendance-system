import mongoose from "mongoose";
import Timetable from "../models/Timetable.js";
import User from "../models/User.js";
import Class from "../models/Class.js";
import { sameTextIgnoringCase } from "../utils/search.js";

// "web dev" typed for a course that already exists as "Web Dev" reuses the
// existing spelling, so one course can't turn into several in the filters and
// per-course breakdowns. excludeId lets a timetable be re-spelled when it is
// the only one using that course.
const canonicalCourse = async (course, excludeId = null) => {
  const typed = course.trim();

  const existing = await Timetable.findOne({
    course: sameTextIgnoringCase(typed),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select("course");

  return existing ? existing.course : typed;
};

const FAR_FUTURE = new Date("9999-12-31");
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Names instead of bare ids in every response
const POPULATE = [
  { path: "instructor", select: "name email" },
  { path: "class", select: "name" },
];

const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);

  return hours * 60 + minutes;
};

const idOf = (ref) => String((ref && ref._id) || ref);

// Finds an ACTIVE timetable that overlaps the given slot and belongs to the
// same instructor OR the same class. A teacher can't be in two places at once,
// and neither can a class.
const findConflict = ({
  instructor,
  classId,
  daysOfWeek,
  startTime,
  endTime,
  effectiveFrom,
  effectiveUntil,
  excludeId,
}) => {
  // Older timetables may have no class yet; never match on an undefined class
  const owners = [{ instructor }];

  if (classId) {
    owners.push({ class: classId });
  }

  const filter = {
    isActive: true,
    daysOfWeek: { $in: daysOfWeek },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
    effectiveFrom: { $lte: effectiveUntil || FAR_FUTURE },
    $and: [
      {
        $or: [
          { effectiveUntil: null },
          { effectiveUntil: { $gte: effectiveFrom } },
        ],
      },
      { $or: owners },
    ],
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return Timetable.findOne(filter);
};

const conflictMessage = (conflict, instructor) =>
  idOf(conflict.instructor) === idOf(instructor)
    ? "Instructor already has a timetable during this time"
    : "This class already has a timetable during this time";

const parseDay = (value) => new Date(`${value}T00:00:00.000Z`);

export const createTimetable = async (req, res) => {
  try {
    const {
      instructor,
      course,
      daysOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveUntil,
    } = req.body;
    const classId = req.body.class;

    if (
      !instructor ||
      !classId ||
      !course ||
      !Array.isArray(daysOfWeek) ||
      daysOfWeek.length === 0 ||
      !startTime ||
      !endTime ||
      !effectiveFrom
    ) {
      return res.status(400).json({
        message: "All required fields must be provided",
      });
    }

    if (
      !mongoose.isValidObjectId(instructor) ||
      !mongoose.isValidObjectId(classId)
    ) {
      return res.status(400).json({ message: "Invalid instructor or class" });
    }

    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return res.status(400).json({ message: "Times must be in HH:mm format" });
    }

    if (toMinutes(endTime) <= toMinutes(startTime)) {
      return res.status(400).json({
        message: "End time must be after the start time",
      });
    }

    const normalizedEffectiveFrom = parseDay(effectiveFrom);
    const normalizedEffectiveUntil = effectiveUntil
      ? parseDay(effectiveUntil)
      : null;

    if (
      normalizedEffectiveUntil &&
      normalizedEffectiveUntil <= normalizedEffectiveFrom
    ) {
      return res.status(400).json({
        message: "Effective until date must be after effective from date",
      });
    }

    const instructorUser = await User.findOne({
      _id: instructor,
      role: "instructor",
      status: "active",
    });

    if (!instructorUser) {
      return res.status(404).json({ message: "Instructor not found" });
    }

    const classRecord = await Class.findById(classId);

    if (!classRecord) {
      return res.status(404).json({ message: "Class not found" });
    }

    const conflict = await findConflict({
      instructor,
      classId,
      daysOfWeek,
      startTime,
      endTime,
      effectiveFrom: normalizedEffectiveFrom,
      effectiveUntil: normalizedEffectiveUntil,
    });

    if (conflict) {
      return res.status(409).json({
        message: conflictMessage(conflict, instructor),
      });
    }

    const timetable = await Timetable.create({
      instructor,
      class: classId,
      course: await canonicalCourse(course),
      daysOfWeek,
      startTime,
      endTime,
      effectiveFrom: normalizedEffectiveFrom,
      effectiveUntil: normalizedEffectiveUntil,
    });

    await timetable.populate(POPULATE);

    return res.status(201).json({
      message: "Timetable created successfully",
      timetable,
    });
  } catch (error) {
    console.error("Error occurred while creating timetable:", error);

    return res.status(500).json({
      message: "Failed to create timetable",
      error: error.message,
    });
  }
};

export const getTimetables = async (req, res) => {
  try {
    let filter;

    if (req.user.role === "admin") {
      filter = {};
    } else if (req.user.role === "instructor") {
      filter = { instructor: req.user.userId };
    } else if (req.user.role === "student") {
      // Students only see the active timetables of their own class
      const student = await User.findById(req.user.userId).select("class");

      filter =
        student && student.class
          ? { isActive: true, class: student.class }
          : { _id: null };
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const timetables = await Timetable.find(filter)
      .populate(POPULATE)
      .sort({ course: 1 });

    return res.status(200).json({
      message: "Timetables retrieved successfully",
      timetables,
    });
  } catch (error) {
    console.error("Error while fetching timetables:", error);

    return res.status(500).json({
      message: "Failed to retrieve timetables",
      error: error.message,
    });
  }
};

export const getTimetableById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid timetable ID" });
    }

    const timetable = await Timetable.findById(id);

    if (!timetable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    if (
      req.user.role === "instructor" &&
      timetable.instructor.toString() !== req.user.userId
    ) {
      return res.status(403).json({ message: "Access denied" });
    }

    if (req.user.role === "student") {
      const student = await User.findById(req.user.userId).select("class");
      const sameClass =
        student &&
        student.class &&
        timetable.class &&
        student.class.toString() === timetable.class.toString();

      if (!timetable.isActive || !sameClass) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    await timetable.populate(POPULATE);

    return res.status(200).json({
      message: "Timetable retrieved successfully",
      timetable,
    });
  } catch (error) {
    console.error("Error fetching timetable:", error);

    return res.status(500).json({
      message: "Failed to retrieve timetable",
      error: error.message,
    });
  }
};

export const updateTimetable = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid timetable ID" });
    }

    const {
      instructor,
      course,
      daysOfWeek,
      startTime,
      endTime,
      effectiveFrom,
      effectiveUntil,
    } = req.body;
    const classId = req.body.class;

    const timetable = await Timetable.findById(id);

    if (!timetable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    if (
      daysOfWeek !== undefined &&
      (!Array.isArray(daysOfWeek) ||
        daysOfWeek.length === 0 ||
        new Set(daysOfWeek).size !== daysOfWeek.length)
    ) {
      return res.status(400).json({
        message: "At least one valid and unique day must be selected",
      });
    }

    if (instructor) {
      if (!mongoose.isValidObjectId(instructor)) {
        return res.status(400).json({ message: "Invalid instructor" });
      }

      const instructorUser = await User.findOne({
        _id: instructor,
        role: "instructor",
      });

      if (!instructorUser) {
        return res.status(404).json({ message: "Instructor not found" });
      }
    }

    if (classId) {
      if (!mongoose.isValidObjectId(classId)) {
        return res.status(400).json({ message: "Invalid class" });
      }

      const classRecord = await Class.findById(classId);

      if (!classRecord) {
        return res.status(404).json({ message: "Class not found" });
      }
    }

    const updatedInstructor = instructor || timetable.instructor;
    const updatedClass = classId || timetable.class;
    const updatedDaysOfWeek = daysOfWeek || timetable.daysOfWeek;
    const updatedStartTime = startTime || timetable.startTime;
    const updatedEndTime = endTime || timetable.endTime;

    if (
      !TIME_PATTERN.test(updatedStartTime) ||
      !TIME_PATTERN.test(updatedEndTime)
    ) {
      return res.status(400).json({ message: "Times must be in HH:mm format" });
    }

    if (toMinutes(updatedEndTime) <= toMinutes(updatedStartTime)) {
      return res.status(400).json({
        message: "End time must be after the start time",
      });
    }

    const normalizedEffectiveFrom = effectiveFrom
      ? parseDay(effectiveFrom)
      : timetable.effectiveFrom;

    const normalizedEffectiveUntil =
      effectiveUntil !== undefined
        ? effectiveUntil
          ? parseDay(effectiveUntil)
          : null
        : timetable.effectiveUntil;

    if (
      normalizedEffectiveUntil &&
      normalizedEffectiveUntil <= normalizedEffectiveFrom
    ) {
      return res.status(400).json({
        message: "Effective until date must be after effective from date",
      });
    }

    // An inactive timetable can't clash with anything until it is reactivated
    if (timetable.isActive) {
      const conflict = await findConflict({
        instructor: updatedInstructor,
        classId: updatedClass,
        daysOfWeek: updatedDaysOfWeek,
        startTime: updatedStartTime,
        endTime: updatedEndTime,
        effectiveFrom: normalizedEffectiveFrom,
        effectiveUntil: normalizedEffectiveUntil,
        excludeId: id,
      });

      if (conflict) {
        return res.status(409).json({
          message: conflictMessage(conflict, updatedInstructor),
        });
      }
    }

    timetable.instructor = updatedInstructor;
    timetable.class = updatedClass;
    timetable.course = course
      ? await canonicalCourse(course, id)
      : timetable.course;
    timetable.daysOfWeek = updatedDaysOfWeek;
    timetable.startTime = updatedStartTime;
    timetable.endTime = updatedEndTime;
    timetable.effectiveFrom = normalizedEffectiveFrom;
    timetable.effectiveUntil = normalizedEffectiveUntil;

    await timetable.save();
    await timetable.populate(POPULATE);

    return res.status(200).json({
      message: "Timetable updated successfully",
      timetable,
    });
  } catch (error) {
    console.error("Error updating timetable:", error);

    return res.status(500).json({
      message: "Failed to update timetable",
      error: error.message,
    });
  }
};

export const deactivateTimetable = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid timetable ID" });
    }

    const timetable = await Timetable.findById(id);

    if (!timetable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    if (!timetable.isActive) {
      return res.status(400).json({ message: "Timetable is already inactive" });
    }

    timetable.isActive = false;

    // validateModifiedOnly: older timetables created before classes existed
    // have no class yet; they can still be switched on and off
    await timetable.save({ validateModifiedOnly: true });
    await timetable.populate(POPULATE);

    return res.status(200).json({
      message: "Timetable deactivated successfully",
      timetable,
    });
  } catch (error) {
    console.error("Error deactivating timetable:", error);

    return res.status(500).json({
      message: "Failed to deactivate timetable",
      error: error.message,
    });
  }
};

export const activateTimetable = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid timetable ID" });
    }

    const timetable = await Timetable.findById(id);

    if (!timetable) {
      return res.status(404).json({ message: "Timetable not found" });
    }

    if (timetable.isActive) {
      return res.status(400).json({ message: "Timetable is already active" });
    }

    const conflict = await findConflict({
      instructor: timetable.instructor,
      classId: timetable.class,
      daysOfWeek: timetable.daysOfWeek,
      startTime: timetable.startTime,
      endTime: timetable.endTime,
      effectiveFrom: timetable.effectiveFrom,
      effectiveUntil: timetable.effectiveUntil,
      excludeId: id,
    });

    if (conflict) {
      return res.status(409).json({
        message: `${conflictMessage(conflict, timetable.instructor)}, so it can't be activated`,
      });
    }

    timetable.isActive = true;

    await timetable.save({ validateModifiedOnly: true });
    await timetable.populate(POPULATE);

    return res.status(200).json({
      message: "Timetable activated successfully",
      timetable,
    });
  } catch (error) {
    console.error("Error activating timetable:", error);

    return res.status(500).json({
      message: "Failed to activate timetable",
      error: error.message,
    });
  }
};
