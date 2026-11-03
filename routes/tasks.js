const express = require('express');
const User = require('../models/user');
const Task = require('../models/task');
const { ok, fail, isClientQueryError } = require('../utils/respond');
const { parseListQuery, parseSelect, runListQuery } = require('../utils/query');
const { isObjectId, parseTaskBody } = require('../utils/validate');

const router = express.Router();
const DEFAULT_TASK_LIMIT = 100;

async function findTask(id) {
    return isObjectId(id) ? Task.findById(id) : null;
}

// Checks that the assigned user exists and that the names match.
// Fills in assignedUserName when it was omitted. Returns [status, message] or null.
async function checkAssignment(value) {
    if (!value.assignedUser) return null;
    const user = await User.findById(value.assignedUser).select('name');
    if (!user) return [404, 'The assigned user does not exist'];
    if (value.assignedUserName === undefined) value.assignedUserName = user.name;
    else if (value.assignedUserName !== user.name) {
        return [400, 'assignedUserName does not match the name of the assigned user'];
    }
    return null;
}

// Makes the users' pendingTasks agree with the (already saved) task.
async function syncUsers(task) {
    const id = String(task._id);
    const owner = task.assignedUser;

    // No other user may list this task (covers the previous assignee)
    await User.updateMany(owner ? { _id: { $ne: owner }, pendingTasks: id } : { pendingTasks: id }, {
        $pull: { pendingTasks: id },
    });
    if (owner) {
        // Pending tasks are listed by their user; completed ones are not
        const update = task.completed ? { $pull: { pendingTasks: id } } : { $addToSet: { pendingTasks: id } };
        await User.updateOne({ _id: owner }, update);
    }
}

router.get('/', async (req, res) => {
    const q = parseListQuery(req.query, DEFAULT_TASK_LIMIT);
    if (q.error) return fail(res, 400, q.error);
    try {
        return ok(res, await runListQuery(Task, q));
    } catch (err) {
        if (isClientQueryError(err)) return fail(res, 400, 'The query parameters are not valid for tasks');
        throw err;
    }
});

router.post('/', async (req, res) => {
    const parsed = parseTaskBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const refError = await checkAssignment(parsed.value);
    if (refError) return fail(res, ...refError);

    const task = await Task.create(parsed.value);
    await syncUsers(task);
    return ok(res, task, 201, 'Task created');
});

router.get('/:id', async (req, res) => {
    const select = parseSelect(req.query);
    if (select.error) return fail(res, 400, select.error);
    if (!isObjectId(req.params.id)) return fail(res, 404, 'Task not found');
    let task;
    try {
        task = await Task.findById(req.params.id).select(select.value || {});
    } catch (err) {
        if (isClientQueryError(err)) return fail(res, 400, 'The select parameter is not valid for tasks');
        throw err;
    }
    if (!task) return fail(res, 404, 'Task not found');
    return ok(res, task);
});

router.put('/:id', async (req, res) => {
    const task = await findTask(req.params.id);
    if (!task) return fail(res, 404, 'Task not found');

    const parsed = parseTaskBody(req.body);
    if (parsed.error) return fail(res, 400, parsed.error);

    const refError = await checkAssignment(parsed.value);
    if (refError) return fail(res, ...refError);

    task.set(parsed.value); // dateCreated is immutable and not in parsed.value
    await task.save();
    await syncUsers(task);
    return ok(res, task);
});

router.delete('/:id', async (req, res) => {
    const task = await findTask(req.params.id);
    if (!task) return fail(res, 404, 'Task not found');

    const id = String(task._id);
    await User.updateMany({ pendingTasks: id }, { $pull: { pendingTasks: id } });
    await task.deleteOne();
    return res.status(204).end(); // 204 No Content: success, empty body
});

module.exports = router;
