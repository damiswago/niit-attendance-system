import cron from "node-cron";
import Timetable from "../models/Timetable.js";
import Session from "../models/Session.js";

const sessionJob = () => {
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();

      const localDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Lagos",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now);

      const localDateStart = new Date(`${localDate}T00:00:00.000Z`);

      const timetables = await Timetable.find({
        isActive: true,
        effectiveFrom: { $lte: localDateStart },
        $or: [
          { effectiveUntil: null },
          { effectiveUntil: { $gte: localDateStart } },
        ],
      });
      const today = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Lagos",
        weekday: "long",
      })
        .format(now)
        .toLowerCase();

      const todaysTimetables = timetables.filter((timetable) =>
        timetable.daysOfWeek.includes(today),
      );

      for (const timetable of todaysTimetables) {
        if (timetable.startTime >= timetable.endTime) {
          console.log(
            `Invalid timetable time: ${timetable.course} - Start time must be before end time.`,
          );
          continue;
        }

        if (!timetable.instructor) {
          console.log(`Invalid timetable instructor: ${timetable.course}`);
          continue;
        }

        const sessionDate = new Date(`${localDate}T00:00:00.000Z`);

        const existingSession = await Session.findOne({
          instructor: timetable.instructor,
          date: sessionDate,
          startTime: { $lt: timetable.endTime },
          endTime: { $gt: timetable.startTime },
        });

        if (existingSession) {
          console.log(
            `Overlapping session already exists: ${timetable.course}`,
          );
          continue;
        }

        const session = await Session.create({
          instructor: timetable.instructor,
          course: timetable.course,
          date: sessionDate,
          startTime: timetable.startTime,
          endTime: timetable.endTime,
          status: "active",
          timetable: timetable._id,
        });

        console.log(
          `Session created: ${session.course} (${session.startTime} - ${session.endTime})`,
        );
      }

      // Anything still "scheduled" whose day has come becomes active:
      // replacement sessions, and original sessions that an admin
      // postponed or cancelled and then undid. (Before, only
      // replacements were activated, so an undone original stayed
      // "scheduled" and students could never check in.)
      const scheduledReplacementSessions = await Session.find({
        status: "scheduled",
        date: {
          $lte: new Date(`${localDate}T00:00:00.000Z`),
        },
      });

      for (const session of scheduledReplacementSessions) {
        session.status = "active";
        await session.save();

        console.log(
          `Scheduled session activated: ${session.course} (${session.startTime} - ${session.endTime})`,
        );
      }

      const activeSessions = await Session.find({
        status: "active",
        date: {
          $lte: new Date(`${localDate}T00:00:00.000Z`),
        },
      });

      for (const session of activeSessions) {
        const sessionDate = session.date.toISOString().split("T")[0];

        const sessionEnd = new Date(
          `${sessionDate}T${session.endTime}:00+01:00`,
        );

        if (now >= sessionEnd) {
          session.status = "completed";
          await session.save();

          console.log(`Session completed: ${session.course}`);
        }
      }
    } catch (error) {
      console.error("Session job error:", error);
    }
  });
};

export default sessionJob;
