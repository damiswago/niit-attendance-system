import jwt from "jsonwebtoken";
import User from "../models/User.js";

// Verifies the cookie token, then checks the account against the database so
// that deactivating a user (or changing their role or password) takes effect
// immediately instead of waiting for their token to expire.
export const authenticateUser = async (req, res, next) => {
  try {
      const token = req.cookies.token;

      if (!token) {
          return res.status(401).json({
              message: "Authentication required"
          });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.userId).select(
          "role status passwordChangedAt"
      );

      if (!user) {
          return res.status(401).json({
              message: "This account no longer exists"
          });
      }

      if (user.status === "inactive") {
          return res.status(401).json({
              message: "Your account has been deactivated"
          });
      }

      // A login from BEFORE the password was last changed or reset is no
      // longer valid (decoded.iat is in whole seconds)
      if (
          user.passwordChangedAt &&
          decoded.iat * 1000 < user.passwordChangedAt.getTime()
      ) {
          return res.status(401).json({
              message: "Your password was changed. Please log in again."
          });
      }

      req.user = {
          userId: String(user._id),
          role: user.role
      };

      next();
  } catch (error) {
      return res.status(401).json({
          message: "Invalid or expired token"
      });
  }
};