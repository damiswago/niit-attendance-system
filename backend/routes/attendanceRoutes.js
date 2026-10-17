import express from "express";

import {
    checkIn,
    checkOut
} from "../controllers/attendanceController.js"

import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js"

const router = express.Router();

router.post(
    "/check-in",
    authenticateUser,
    authorizeRoles("student"),
    checkIn
);

router.post(
    "/check-out",
    authenticateUser,
    authorizeRoles("student"),
    checkOut
);

export default router;
