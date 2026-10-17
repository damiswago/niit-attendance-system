import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/User.js";
import Class from "../models/Class.js";

const ROLES = ["student", "instructor", "admin"];
const STATUSES = ["active", "inactive"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// What the API returns for a user: never the password or reset token
const PUBLIC_FIELDS = "-password -resetPasswordToken -resetPasswordExpires";

const isBlank = (value) => typeof value !== "string" || !value.trim();

// Returns { classId } for a valid class, { classId: null } for "no class",
// or { error } when the id is malformed (400) or the class doesn't exist (404)
const resolveClass = async (value) => {
  if (value === null || value === undefined || value === "") {
    return { classId: null };
  }

  if (!mongoose.isValidObjectId(value)) {
    return { error: { status: 400, message: "Invalid class" } };
  }

  const found = await Class.findById(value).select("_id");

  if (!found) {
    return { error: { status: 404, message: "Class not found" } };
  }

  return { classId: found._id };
};

export const createUser = async (req, res) => {
  try {
    const { password, role } = req.body;
    const name = isBlank(req.body.name) ? "" : req.body.name.trim();
    const email = isBlank(req.body.email)
      ? ""
      : req.body.email.trim().toLowerCase();

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        message: "All required fields must be provided",
      });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    // Students must belong to a class; other roles never have one
    let classId = null;

    if (role === "student") {
      if (!req.body.class) {
        return res.status(400).json({
          message: "Please choose a class for the student",
        });
      }

      const resolved = await resolveClass(req.body.class);

      if (resolved.error) {
        return res
          .status(resolved.error.status)
          .json({ message: resolved.error.message });
      }

      classId = resolved.classId;
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      class: classId,
    });

    await user.populate({ path: "class", select: "name" });

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        class: user.class,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create user",
      error: error.message,
    });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select(PUBLIC_FIELDS)
      .populate({ path: "class", select: "name" })
      .sort({ name: 1 });

    res.status(200).json({
      message: "Users retrieved successfully",
      users,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve users",
      error: error.message,
    });
  }
};

// Admin: change a user's name, status or class. Send only the fields to change.
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, status } = req.body;
    const hasClass = Object.prototype.hasOwnProperty.call(req.body, "class");

    if (name === undefined && status === undefined && !hasClass) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (name !== undefined) {
      if (isBlank(name)) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      user.name = name.trim();
    }

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      // An admin who locks themselves out can't undo it
      if (status === "inactive" && String(user._id) === req.user.userId) {
        return res.status(400).json({
          message: "You cannot deactivate your own account",
        });
      }

      user.status = status;
    }

    if (hasClass) {
      const resolved = await resolveClass(req.body.class);

      if (resolved.error) {
        return res
          .status(resolved.error.status)
          .json({ message: resolved.error.message });
      }

      if (resolved.classId && user.role !== "student") {
        return res.status(400).json({
          message: "Only students can be assigned to a class",
        });
      }

      user.class = resolved.classId;
    }

    await user.save({ validateModifiedOnly: true });
    await user.populate({ path: "class", select: "name" });

    const safeUser = user.toObject();

    delete safeUser.password;
    delete safeUser.resetPasswordToken;
    delete safeUser.resetPasswordExpires;

    return res.status(200).json({
      message: "User updated successfully",
      user: safeUser,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update user",
      error: error.message,
    });
  }
};
