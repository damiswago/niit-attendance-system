import { MIN_ATTENDANCE_PERCENTAGE } from "../config/attendanceConfig.js";
import { SCHOOL_END_TIME } from "../config/schoolConfig.js";
import { createLagosDateTime } from "./timeUtils.js";

export const calculateClassMinutes = (
  signIn,
  signOut,
  sessionStart,
  sessionEnd,
) => {
  const attendanceStart = Math.max(
    new Date(signIn).getTime(),
    new Date(sessionStart).getTime(),
  );

  const attendanceEnd = Math.min(
    new Date(signOut).getTime(),
    new Date(sessionEnd).getTime(),
  );

  if (attendanceEnd <= attendanceStart) {
    return 0;
  }

  return Math.floor((attendanceEnd - attendanceStart) / (1000 * 60));
};

export const hasMetAttendanceRequirement = (
  classMinutes,
  sessionStart,
  sessionEnd,
) => {
  const sessionDuration =
    (new Date(sessionEnd).getTime() - new Date(sessionStart).getTime()) /
    (1000 * 60);

  const minimumRequiredMinutes =
    sessionDuration * (MIN_ATTENDANCE_PERCENTAGE / 100);

  return classMinutes >= minimumRequiredMinutes;
};

export const getSchoolEndDateTime = (date) => {
  return createLagosDateTime(
    date,
    SCHOOL_END_TIME
  );
};

