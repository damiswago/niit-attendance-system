import mongoose from "mongoose";
import User from "../models/User.js";
import Class from "../models/Class.js";
import { containsIgnoringCase } from "../utils/search.js";
import {
  isAcceptablePassword,
  hashPassword,
  passwordChangeStamp,
  PASSWORD_RULE_MESSAGE,
} from "../utils/passwords.js";

const ROLES = ["student", "instructor", "admin"];
const STATUSES = ["active", "inactive"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    if (!isAcceptablePassword(password)) {
      return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
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

    const hashedPassword = await hashPassword(password);

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

const DEFAULT_USERS_PAGE_SIZE = 20;
const MAX_USERS_PAGE_SIZE = 100;

// GET /users
//   no paging asked for  -> everyone, as before (other screens need the full list)
//   ?page=1&limit=20     -> one page plus pagination info
// Both accept filters: ?search=&role=&status=&class=<id>|none
// "search" matches name or email anywhere in the text, ignoring case.
export const getUsers = async (req, res) => {
  try {
    const { search, role, status, page, limit } = req.query;
    const classFilter = req.query.class;

    // Plain strings only; anything else (arrays, objects) is rejected
    for (const value of [search, role, status, classFilter, page, limit]) {
      if (value !== undefined && typeof value !== "string") {
        return res.status(400).json({ message: "Invalid filter" });
      }
    }

    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (
      classFilter &&
      classFilter !== "none" &&
      !mongoose.isValidObjectId(classFilter)
    ) {
      return res.status(400).json({ message: "Invalid class" });
    }

    if (search && search.length > 100) {
      return res.status(400).json({ message: "Search text is too long" });
    }

    const filter = {};

    if (role) {
      filter.role = role;
    }

    if (status) {
      filter.status = status;
    }

    if (classFilter === "none") {
      // "No class" means students who haven't been given one
      filter.class = null;

      if (role && role !== "student") {
        filter._id = null; // nobody can match
      } else {
        filter.role = "student";
      }
    } else if (classFilter) {
      filter.class = classFilter;
    }

    if (search && search.trim()) {
      const matcher = containsIgnoringCase(search);

      filter.$or = [{ name: matcher }, { email: matcher }];
    }

    const query = User.find(filter)
      .select(PUBLIC_FIELDS)
      .populate({ path: "class", select: "name" })
      .sort({ name: 1, _id: 1 });

    if (page === undefined) {
      const users = await query;

      return res.status(200).json({
        message: "Users retrieved successfully",
        users,
      });
    }

    const pageNumber = Number(page);
    const pageSize =
      limit === undefined ? DEFAULT_USERS_PAGE_SIZE : Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1
    ) {
      return res.status(400).json({
        message: "page and limit must be positive whole numbers",
      });
    }

    const size = Math.min(pageSize, MAX_USERS_PAGE_SIZE);

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      query.skip((pageNumber - 1) * size).limit(size),
    ]);

    return res.status(200).json({
      message: "Users retrieved successfully",
      users,
      pagination: {
        page: pageNumber,
        limit: size,
        total,
        totalPages: Math.max(1, Math.ceil(total / size)),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to retrieve users",
      error: error.message,
    });
  }
};

// Admin: change a user's name, email, status or class. Send only the fields to
// change. A user's ROLE can't be changed here (or anywhere): create a new account
// instead.
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

    if (Object.prototype.hasOwnProperty.call(req.body, "role")) {
      return res.status(400).json({
        message: "A user's role can't be changed",
      });
    }

    const { name, status, email } = req.body;
    const hasClass = Object.prototype.hasOwnProperty.call(req.body, "class");

    if (
      name === undefined &&
      status === undefined &&
      email === undefined &&
      !hasClass
    ) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    if (email !== undefined) {
      const newEmail = isBlank(email) ? "" : email.trim().toLowerCase();

      if (!EMAIL_PATTERN.test(newEmail)) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }

      if (newEmail !== user.email) {
        const taken = await User.findOne({
          email: newEmail,
          _id: { $ne: user._id },
        }).select("_id");

        if (taken) {
          return res.status(409).json({
            message: "A user with this email already exists",
          });
        }

        user.email = newEmail;
      }
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
    // Someone else took this email a moment ago (the unique index refused it)
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A user with this email already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to update user",
      error: error.message,
    });
  }
};

// Admin: set a new password for someone else (e.g. they are locked out and
// email isn't working). Their existing logins stop working, so they are signed
// out everywhere and must log in again with the new password. The password is
// never sent back or stored anywhere readable.
export const setUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (String(id) === req.user.userId) {
      return res.status(400).json({
        message: "To change your own password, use Change password",
      });
    }

    if (!isAcceptablePassword(newPassword)) {
      return res.status(400).json({ message: PASSWORD_RULE_MESSAGE });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = await hashPassword(newPassword);
    user.passwordChangedAt = passwordChangeStamp();
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save({ validateModifiedOnly: true });

    console.log(
      `Password for ${user.email} was set by administrator ${req.user.userId}`,
    );

    return res.status(200).json({
      message:
        "Password updated. They have been signed out everywhere and must log in with the new password.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to set the password",
      error: error.message,
    });
  }
};