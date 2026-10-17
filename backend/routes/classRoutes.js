import express from "express";

import { createClass, getClasses } from "../controllers/classController.js";

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/", authenticateUser, authorizeRoles("admin"), createClass);

router.get("/", authenticateUser, authorizeRoles("admin"), getClasses);

export default router;
