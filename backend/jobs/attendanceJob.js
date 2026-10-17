import cron from "node-cron";

import { automaticallyCheckoutAttendances } from "../services/attendanceService.js";

cron.schedule(
  "0 18 * * *",
  async () => {
    try {
      const checkedOut = await automaticallyCheckoutAttendances();

      console.log(
        `Automatic checkout completed. ${checkedOut.length} attendance(s) checked out.`,
      );
    } catch (error) {
      console.error("Automatic attendance checkout failed", error.message);
    }
  },
  {
    timezone: "Africa/Lagos",
  },
);
