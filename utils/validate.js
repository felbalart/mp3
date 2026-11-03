// Request body validation shared by the users and tasks routes.
// Each parser returns { error } (-> 400) or { value } with defaults filled in.

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const EMAIL = /^[^\s@]+@[^\s@]+$/;

function isObjectId(value) {
    return typeof value === 'string' && OBJECT_ID.test(value);
}

function isBlank(value) {
    return value === undefined || value === null || value === '';
}

function requireString(value, label) {
    if (isBlank(value)) return `${label} is required`;
    if (typeof value !== 'string') return `${label} must be a string`;
    if (value.trim() === '') return `${label} is required`;
    return null;
}

function asBody(body) {
    if (body === undefined || body === null) return {};
    if (typeof body !== 'object' || Array.isArray(body)) return null;
    return body;
}

function parseUserBody(rawBody) {
    const body = asBody(rawBody);
    if (!body) return { error: 'Request body must be an object' };

    const nameError = requireString(body.name, 'Name');
    if (nameError) return { error: nameError };
    const emailError = requireString(body.email, 'Email');
    if (emailError) return { error: emailError };
    if (!EMAIL.test(body.email.trim())) return { error: 'Email is not a valid email address' };

    let pendingTasks = body.pendingTasks;
    if (isBlank(pendingTasks)) pendingTasks = [];
    // A single value from a form-encoded body arrives as a plain string
    if (typeof pendingTasks === 'string') pendingTasks = [pendingTasks];
    if (!Array.isArray(pendingTasks)) return { error: 'pendingTasks must be a list of task ids' };
    for (const id of pendingTasks) {
        if (!isObjectId(id)) return { error: 'pendingTasks contains an invalid task id' };
    }

    return {
        value: {
            name: body.name,
            email: body.email.trim(),
            pendingTasks: [...new Set(pendingTasks)],
        },
    };
}

function parseDate(value) {
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') {
        // Form-encoded bodies send timestamps as strings of digits
        return /^-?\d+$/.test(value.trim()) ? new Date(Number(value)) : new Date(value);
    }
    return null;
}

function parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
}

function parseTaskBody(rawBody) {
    const body = asBody(rawBody);
    if (!body) return { error: 'Request body must be an object' };

    const nameError = requireString(body.name, 'Name');
    if (nameError) return { error: nameError };

    if (isBlank(body.deadline)) return { error: 'Deadline is required' };
    const deadline = parseDate(body.deadline);
    if (!deadline || isNaN(deadline.getTime())) return { error: 'Deadline must be a valid date' };

    let description = '';
    if (!isBlank(body.description)) {
        if (typeof body.description !== 'string') return { error: 'Description must be a string' };
        description = body.description;
    }

    let completed = false;
    if (!isBlank(body.completed)) {
        completed = parseBoolean(body.completed);
        if (completed === null) return { error: 'Completed must be true or false' };
    }

    let assignedUser = '';
    if (!isBlank(body.assignedUser)) {
        if (!isObjectId(body.assignedUser)) return { error: 'assignedUser is not a valid user id' };
        assignedUser = body.assignedUser;
    }

    // undefined = not supplied; the route fills it in from the user
    let assignedUserName;
    if (!isBlank(body.assignedUserName)) {
        if (typeof body.assignedUserName !== 'string') return { error: 'assignedUserName must be a string' };
        assignedUserName = body.assignedUserName;
    }
    if (!assignedUser) {
        if (assignedUserName !== undefined && assignedUserName !== 'unassigned') {
            return { error: 'assignedUserName was given without a matching assignedUser' };
        }
        assignedUserName = 'unassigned';
    }

    return { value: { name: body.name, description, deadline, completed, assignedUser, assignedUserName } };
}

module.exports = { isObjectId, parseUserBody, parseTaskBody };
