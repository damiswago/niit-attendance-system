import mongoose from "mongoose";

const connectDB = async () => {
    try {
        console.log("Attempting MongoDB connection...");
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    };
};

export default connectDB;