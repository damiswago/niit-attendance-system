// Confirms your MongoDB connection supports transactions, which postponing,
// cancelling and undoing sessions rely on. MongoDB Atlas does; a standalone
// local mongod does not.
//
//   node scripts/checkTransactions.js
//
// It writes one throwaway document inside a transaction, then rolls it back,
// so nothing is left in your database.
import "dotenv/config";
import mongoose from "mongoose";

const check = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const probe = mongoose.connection.collection("__transaction_probe");
    const session = await mongoose.startSession();

    session.startTransaction();
    await probe.insertOne({ probe: true }, { session });

    const inside = await probe.countDocuments({}, { session });

    await session.abortTransaction();
    await session.endSession();

    const after = await probe.countDocuments({});

    if (inside === 1 && after === 0) {
      console.log(
        "OK: transactions work (insert inside, rolled back cleanly).",
      );
    } else {
      console.log(
        `Unexpected result: inside=${inside}, after rollback=${after}`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("FAILED: transactions are not available.");
    console.error(error.message);
    console.error(
      "Postponing, cancelling and undoing sessions need a replica set (MongoDB Atlas, or a local replica set).",
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

check();
