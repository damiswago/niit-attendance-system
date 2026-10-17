import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { getMyStudents } from "../controllers/rosterController.js";
import {
  createUser,
  getUsers,
  updateUser,
} from "../controllers/userController.js";

const router = express.Router();

router.post("/", authenticateUser, authorizeRoles("admin"), createUser);
router.get("/", authenticateUser, authorizeRoles("admin"), getUsers);
// Students in the classes the signed-in instructor teaches
router.get(
  "/my-students",
  authenticateUser,
  authorizeRoles("instructor"),
  getMyStudents,
);
router.patch("/:id", authenticateUser, authorizeRoles("admin"), updateUser);

export default router;
