/**
 * One-time helper for data created BEFORE per-user separation was added.
 * Old leads/contacts/tasks/notes have no owner, so nobody can see them.
 * This assigns all of those ownerless records to one account.
 *
 *   npm run claim-data -- you@example.com
 */
require("../config/env");
const mongoose = require("mongoose");
const { MONGODB_URI } = require("../config/env");
const { User, Lead, Contact, Task, Note } = require("../models");

(async () => {
  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.log("Usage: npm run claim-data -- you@example.com");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  const user = await User.findOne({ email });
  if (!user) {
    console.log(`No account found for ${email}. Register it in the app first.`);
    process.exit(1);
  }

  const noOwner = { $or: [{ user: { $exists: false } }, { user: null }] };
  for (const [label, Model] of [["leads", Lead], ["contacts", Contact], ["tasks", Task], ["notes", Note]]) {
    // Bypass schema (the field is `required`) and write straight to the collection.
    const res = await Model.collection.updateMany(noOwner, { $set: { user: user._id } });
    console.log(`${label}: ${res.modifiedCount} assigned to ${email}`);
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
