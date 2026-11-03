// Load required packages
const mongoose = require('mongoose');

// Define our user schema
const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        email: { type: String, required: true, unique: true },
        // _id strings of the *pending* tasks assigned to this user
        pendingTasks: { type: [String], default: [] },
        // Set by the server on creation; never changes afterwards
        dateCreated: { type: Date, default: Date.now, immutable: true },
    },
    { versionKey: false }
);

// Export the Mongoose model
module.exports = mongoose.model('User', UserSchema);
