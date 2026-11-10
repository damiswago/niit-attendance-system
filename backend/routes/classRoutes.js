import express from "express";

import {
  createClass,
  getClasses,
  updateClass,
  deleteClass,
} from "../controllers/classController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/", authenticateUser, authorizeRoles("admin"), createClass);

router.get("/", authenticateUser, authorizeRoles("admin"), getClasses);

router.patch("/:id", authenticateUser, authorizeRoles("admin"), updateClass);

router.delete("/:id", authenticateUser, authorizeRoles("admin"), deleteClass);

export default router;