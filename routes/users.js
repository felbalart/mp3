const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const { ok, fail, isClientQueryError } = require('../utils/respond');
const { parseListQuery, parseSelect, runListQuery } = require('../utils/query');
const { isObjectId, parseUserBody } = require('../utils/validate');

const router = express.Router();
const UNASSIGNED = { assignedUser: '', assignedUserName: 'unassigned' };

async function findUser(id) {
    return isObjectId(id) ? User.findById(id) : null;
}

// Checks that run after body validation, before anything is written.
// Returns [status, message] on failure, null when the request may proceed.
async function checkReferences(value, userId) {
    const emailFilter = { email: value.email };
    if (userId) emailFilter._id = { $ne: userId };
    if (await User.exists(emailFilter)) return [400, 'A user with this email already exists'];

    if (value.pendingTasks.length) {
        const tasks = await Task.find({ _id: { $in: value.pendingTasks } }).select('completed');
        if (tasks.length !== value.pendingTasks.length) return [404, 'One or more tasks in pendingTasks do not exist'];
        if (tasks.some((t) => t.completed)) return [400, 'Completed tasks cannot be in pendingTasks'];
    }
    return null;
}

// Brings the tasks in line with the user's (already saved) pendingTasks.
async function syncTasks(user, oldPending) {
    const id = String(user._id);
    const newPending = user.pendingTasks;

    // Tasks that move here are taken off whoever had them before
    if (newPending.length) {
        await User.updateMany(
            { _id: { $ne: user._id }, pendingTasks: { $in: newPending } },
            { $pull: { pendingTasks: { $in: newPending } } }
        );
    }
    // Tasks dropped from the list become unassigned
    const removed = oldPending.filter((t) => isObjectId(t) && !newPending.includes(t));
    if (removed.length) {
        await Task.updateMany({ _id: { $in: removed }, assignedUser: id }, UNASSIGNED);
    }
    // New tasks get assigned; existing ones (completed too) pick up a renamed user
    await Task.updateMany(
        { $or: [{ _id: { $in: newPending } }, { assignedUser: id }] },
        { assignedUser: id, assignedUserName: user.name }
    );
}

router.get('/', async (req, res) => {
    const q = parseListQuery(req.query, undefined); // no default limit for users
    if (q.error) return fail(res, 400, q.error);
    try {
        return ok(res, await runListQuery(User, q));
    } catch (err) {
        if (isClientQueryError(err)) return fail(res, 400, 'The query parameters are not valid for users');
        throw err;
    }
});

router.post('/', async (req, res) => {
    const parsed = parseUserBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const refError = await checkReferences(parsed.value);
    if (refError) return fail(res, ...refError);

    const user = await User.create(parsed.value);
    await syncTasks(user, []);
    return ok(res, user, 201, 'User created');
});

router.get('/:id', async (req, res) => {
    const select = parseSelect(req.query);
    if (select.error) return fail(res, 400, select.error);
    if (!isObjectId(req.params.id)) return fail(res, 404, 'User not found');
    let user;
    try {
        user = await User.findById(req.params.id).select(select.value || {});
    } catch (err) {
        if (isClientQueryError(err)) return fail(res, 400, 'The select parameter is not valid for users');
        throw err;
    }
    if (!user) return fail(res, 404, 'User not found');
    return ok(res, user);
});

router.put('/:id', async (req, res) => {
    const user = await findUser(req.params.id);
    if (!user) return fail(res, 404, 'User not found');

    const parsed = parseUserBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const refError = await checkReferences(parsed.value, user._id);
    if (refError) return fail(res, ...refError);

    const oldPending = user.pendingTasks.slice();
    user.set(parsed.value); // dateCreated is immutable and not in parsed.value
    await user.save();
    await syncTasks(user, oldPending);
    return ok(res, user);
});

router.delete('/:id', async (req, res) => {
    const user = await findUser(req.params.id);
    if (!user) return fail(res, 404, 'User not found');

    await Task.updateMany({ assignedUser: String(user._id) }, UNASSIGNED);
    await user.deleteOne();
    return res.status(204).end(); // 204 No Content: success, empty body
});

module.exports = router;
