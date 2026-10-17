import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Verifies the cookie token, then checks the account against the database so
// that deactivating a user (or changing their role) takes effect immediately
// instead of waiting for their token to expire.
export const authenticateUser = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId).select("role status");

    if (!user) {
      return res.status(401).json({
        message: "This account no longer exists",
      });
    }

    if (user.status === "inactive") {
      return res.status(401).json({
        message: "Your account has been deactivated",
      });
    }

    req.user = {
      userId: String(user._id),
      role: user.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};
