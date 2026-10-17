import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js"
import { loginUser, logoutUser, changePassword, forgotPassword, resetPassword } from "../controllers/authController.js";

const router = express.Router();

router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.patch("/change-password", authenticateUser, changePassword);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;