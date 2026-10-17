import { getAttendanceStatus } from "../services/attendanceService.js";

const session = {
  date: new Date("2026-09-21"),
  startTime: "10:00",
  endTime: "12:00",
};

console.log(
  "10:00:",
  getAttendanceStatus(session, new Date("2026-09-21T10:00:00+01:00")),
);

console.log(
  "10:10:",
  getAttendanceStatus(session, new Date("2026-09-21T10:10:00+01:00")),
);

console.log(
  "10:10:01:",
  getAttendanceStatus(session, new Date("2026-09-21T10:10:01+01:00")),
);
