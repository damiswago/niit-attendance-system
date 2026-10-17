import { createSessionDateTime } from "../utils/timeUtils.js";

const sessionStart = createSessionDateTime(new Date("2026-09-14"), "10:00");

const sessionEnd = createSessionDateTime(new Date("2026-09-14"), "11:00");

console.log("Session start:", sessionStart.toISOString());
console.log("Session end:", sessionEnd.toISOString()); 