import express from "express";
import { authenticateUser } from "../middleware/authMiddleware.js"
import { authorizeRoles } from "../middleware/roleMiddleware.js"
import { 
    createTimetable,
    getTimetables,
    getTimetableById,
    updateTimetable,
    deactivateTimetable,
    activateTimetable
} from "../controllers/timetableController.js";

const router = express.Router();

router.post("/", authenticateUser, authorizeRoles("admin"), createTimetable);
router.get("/", authenticateUser, getTimetables);
router.get("/:id", authenticateUser, getTimetableById);
router.patch("/:id", authenticateUser, authorizeRoles("admin"), updateTimetable);
router.patch("/:id/deactivate", authenticateUser, authorizeRoles("admin"), deactivateTimetable);
router.patch("/:id/activate", authenticateUser, authorizeRoles("admin"), activateTimetable);

export default router;
