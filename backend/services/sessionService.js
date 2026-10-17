import Session from "../models/Session.js";
import Timetable from "../models/Timetable.js";
import { getDayOfWeek } from "../utils/timeUtils.js";

export const validateSessionDate = (
  timetable,
  sessionDate,
  isReplacement = false,
) => {
  if (!timetable) {
    return {
      valid: false,
      message: "Timetable not found",
    };
  }

  if (isReplacement) {
    return {
      valid: true,
      message: null,
    };
  }

  const sessionDay = getDayOfWeek(sessionDate);

  if (!timetable.daysOfWeek.includes(sessionDay)) {
    return {
      valid: false,
      message: `Session date does not match the timetable day. Expected one of: ${timetable.daysOfWeek.join(", ")}`,
    };
  }

  return {
    valid: true,
    message: null,
  };
};