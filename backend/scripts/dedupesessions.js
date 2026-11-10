// Finds (and, if you ask, removes) duplicate regular sessions: two or more
// sessions for the same timetable on the same day.
//
// Run this BEFORE deploying the version that adds the unique index
// "one_regular_session_per_timetable_day". MongoDB cannot build a unique index
// while duplicates exist, and without the index the protection isn't active.
//
//   node scripts/dedupeSessions.js           look only, change nothing
//   node scripts/dedupeSessions.js --apply   remove the unneeded copies
//
// For each group of duplicates it keeps the copy that has attendance records.
// A copy with NO attendance is removed. If more than one copy has attendance,
// it does not guess: it lists them for you to sort out by hand.
import "dotenv/config";
import mongoose from "mongoose";
import Session from "../models/Session.js";
import Attendance from "../models/Attendance.js";

const apply = process.argv.includes("--apply");

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const groups = await Session.aggregate([
            { $match: { isReplacement: { $ne: true } } },
            {
                $group: {
                    _id: { timetable: "$timetable", date: "$date" },
                    ids: { $push: "$_id" },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gt: 1 } } }
        ]);

        if (!groups.length) {
            console.log("No duplicate sessions found. Nothing to do.");
            return;
        }

        console.log(`Found ${groups.length} day(s) with duplicate sessions.\n`);

        let removed = 0;
        let manual = 0;

        for (const group of groups) {
            const day = group._id.date.toISOString().slice(0, 10);
            const withCounts = [];

            for (const id of group.ids) {
                withCounts.push({
                    id,
                    attendance: await Attendance.countDocuments({ session: id })
                });
            }

            const used = withCounts.filter((item) => item.attendance > 0);

            console.log(`${day}  timetable ${group._id.timetable}`);
            withCounts.forEach((item) =>
                console.log(`   session ${item.id}  attendance records: ${item.attendance}`)
            );

            if (used.length > 1) {
                manual += 1;
                console.log("   -> MORE THAN ONE copy has attendance: sort this one out by hand\n");
                continue;
            }

            // Keep the one with attendance, or (if none has any) the first
            const keep = used[0] ? used[0].id : withCounts[0].id;
            const drop = withCounts.filter((item) => String(item.id) !== String(keep));

            console.log(`   -> keep ${keep}, ${apply ? "removing" : "would remove"} ${drop.length}\n`);

            if (apply) {
                await Session.deleteMany({ _id: { $in: drop.map((item) => item.id) } });
                removed += drop.length;
            }
        }

        console.log(
            apply
                ? `Removed ${removed} duplicate session(s). ${manual} day(s) need manual attention.`
                : `Dry run only: nothing was changed. Run with --apply to remove them. ${manual} day(s) need manual attention.`
        );
    } catch (error) {
        console.error("Failed:", error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
};

run();