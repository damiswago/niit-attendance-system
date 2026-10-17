import Class from "../models/Class.js";

export const createClass = async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name) {
      return res.status(400).json({
        message: "Class name is required",
      });
    }

    const existingClass = await Class.findOne({ name }).collation({
      locale: "en",
      strength: 2,
    });

    if (existingClass) {
      return res.status(409).json({
        message: "A class with this name already exists",
      });
    }

    const newClass = await Class.create({
      name,
    });

    return res.status(201).json({
      message: "Class created successfully",
      class: newClass,
    });
  } catch (error) {
    console.error("Error creating class:", error);

    return res.status(500).json({
      message: "Failed to create class",
      error: error.message,
    });
  }
};

export const getClasses = async (req, res) => {
  try {
    const classes = await Class.find().sort({ name: 1 });

    return res.status(200).json({
      message: "Classes retrieved successfully",
      classes,
    });
  } catch (error) {
    console.error("Error retrieving classes:", error);

    return res.status(500).json({
      message: "Failed to retrieve classes",
      error: error.message,
    });
  }
};
