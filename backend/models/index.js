const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * Every business record (lead, contact, task, note) carries a `user` field.
 * All queries in routes/ filter by it, which is what keeps each account's
 * data completely separate from everyone else's.
 */
const owner = { type: Schema.Types.ObjectId, ref: "User", required: true, index: true };

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    company: { type: String, default: "" },
    avatar: { type: String, default: "" },
    role: { type: String, default: "Owner" },
  },
  { timestamps: true }
);

const leadSchema = new Schema(
  {
    user: owner,
    name: { type: String, required: true, trim: true },
    company: { type: String, default: "" },
    status: {
      type: String,
      enum: ["New", "Qualified", "Proposal", "Won", "Lost"],
      default: "New",
    },
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    value: { type: Number, default: 0 },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    source: { type: String, default: "Other" },
    notes: { type: String, default: "" },
    order: { type: Number, default: 0 },
    tags: [String],
    aiSummary: String,
    aiRiskScore: Number,
  },
  { timestamps: true }
);
leadSchema.index({ user: 1, status: 1, order: 1 });

const contactSchema = new Schema(
  {
    user: owner,
    name: { type: String, required: true, trim: true },
    title: { type: String, default: "" },
    role: { type: String, default: "" }, // legacy field, kept for old data
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
    notes: { type: String, default: "" },
    tags: [String],
    favorite: { type: Boolean, default: false },
  },
  { timestamps: true }
);
contactSchema.index({ user: 1, email: 1 });

const taskSchema = new Schema(
  {
    user: owner,
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    priority: { type: String, default: "Medium" },
    status: { type: String, default: "Pending" },
    dueDate: Date,
    relatedLead: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    relatedContact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
    completedAt: Date,
  },
  { timestamps: true }
);
taskSchema.index({ user: 1, status: 1 });

const noteSchema = new Schema(
  {
    user: owner,
    content: { type: String, required: true },
    pinned: { type: Boolean, default: false },
    lead: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    contact: { type: Schema.Types.ObjectId, ref: "Contact", default: null },
  },
  { timestamps: true }
);
noteSchema.index({ user: 1, pinned: -1, createdAt: -1 });

module.exports = {
  User: mongoose.model("User", userSchema),
  Lead: mongoose.model("Lead", leadSchema),
  Contact: mongoose.model("Contact", contactSchema),
  Task: mongoose.model("Task", taskSchema),
  Note: mongoose.model("Note", noteSchema),
};
