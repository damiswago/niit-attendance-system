import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { sendPasswordResetEmail } from "../services/emailService.js";

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(401).json({
        message: "Email and Password required",
      });
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        message:
          "Your account has been deactivated. Please contact your administrator.",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Error occurred while logging in user:", error);

    res.status(500).json({
      message: "Login Failed",
      error: error.message,
    });
  }
};

export const logoutUser = (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
    });

    return res.status(200).json({
      message: "Logout Successful",
    });
  } catch (error) {
    console.error("Error occured while logging out user:", error);

    return res.status(500).json({
      message: "Logout failed",
      error: error.message,
    });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required",
      });
    }

    // Same minimum as when an administrator creates an account. bcrypt only
    // reads the first 72 bytes, so longer passwords would silently be cut off.
    if (
      typeof newPassword !== "string" ||
      newPassword.length < 8 ||
      Buffer.byteLength(newPassword) > 72
    ) {
      return res.status(400).json({
        message: "New password must be between 8 and 72 characters",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);

    return res.status(500).json({
      message: "Failed to change password",
      error: error.message,
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    // Same normalising as login: "Ada@NIIT.com " must find "ada@niit.com"
    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
    });

    if (!user) {
      return res.status(200).json({
        message:
          "If an account exists with this email, a password reset link has been sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const resetTokenExpires = new Date(Date.now() + 15 * 60 * 1000);

    user.resetPasswordToken = hashedResetToken;
    user.resetPasswordExpires = resetTokenExpires;

    await user.save();

    await sendPasswordResetEmail(user.email, resetToken);

    return res.status(200).json({
      message:
        "If an account exists with this email, a password reset link has been sent",
    });
  } catch (error) {
    console.error("Error processing password reset request:", error);

    return res.status(500).json({
      message: "Failed to process password reset request",
      error: error.message,
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        message: "Reset token and new password are required",
      });
    }

    const hashedResetToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedResetToken,
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset token",
      });
    }

    if (!user.resetPasswordExpires || user.resetPasswordExpires < new Date()) {
      return res.status(400).json({
        message: "Invalid or expired reset token",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    return res.status(200).json({
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Error resetting password:", error);

    return res.status(500).json({
      message: "Failed to reset password",
      error: error.message,
    });
  }
};
