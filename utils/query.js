// Parses the JSON-encoded query string parameters of the collection
// endpoints and builds the query with Mongoose's own methods.

function parseJSONObject(raw, name) {
    if (raw === undefined) return { value: undefined };
    let value;
    try {
        value = JSON.parse(raw);
    } catch {
        return { error: `The "${name}" parameter must be valid JSON` };
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { error: `The "${name}" parameter must be a JSON object` };
    }
    return { value };
}

function parseNonNegativeInt(raw, name) {
    if (raw === undefined) return { value: undefined };
    const n = Number(raw);
    if (String(raw).trim() === '' || !Number.isInteger(n) || n < 0) {
        return { error: `The "${name}" parameter must be a non-negative integer` };
    }
    return { value: n };
}

function parseBool(raw, name) {
    if (raw === undefined) return { value: false };
    const s = String(raw).toLowerCase();
    if (s === 'true') return { value: true };
    if (s === 'false') return { value: false };
    return { error: `The "${name}" parameter must be true or false` };
}

// Only `select` applies to /:id endpoints. `filter` is accepted as an alias.
function parseSelect(query) {
    return parseJSONObject(query.select !== undefined ? query.select : query.filter, 'select');
}

// Returns { error } or { where, sort, select, skip, limit, count }.
function parseListQuery(query, defaultLimit) {
    const parts = {
        where: parseJSONObject(query.where, 'where'),
        sort: parseJSONObject(query.sort, 'sort'),
        select: parseSelect(query),
        skip: parseNonNegativeInt(query.skip, 'skip'),
        limit: parseNonNegativeInt(query.limit, 'limit'),
        count: parseBool(query.count, 'count'),
    };
    const result = {};
    for (const [key, part] of Object.entries(parts)) {
        if (part.error) return { error: part.error };
        result[key] = part.value;
    }
    result.where = result.where || {};
    result.limitGiven = result.limit !== undefined;
    if (!result.limitGiven) result.limit = defaultLimit;
    return result;
}

// Runs the list (or count) query entirely in MongoDB.
function runListQuery(Model, q) {
    if (q.count) {
        // Count matches; skip/limit only apply if the client asked for them.
        const query = Model.countDocuments(q.where);
        if (q.skip !== undefined) query.skip(q.skip);
        if (q.limitGiven) query.limit(q.limit);
        return query.exec();
    }
    const query = Model.find(q.where);
    if (q.sort) query.sort(q.sort);
    if (q.select) query.select(q.select);
    if (q.skip !== undefined) query.skip(q.skip);
    if (q.limit !== undefined) query.limit(q.limit);
    return query.exec();
}

module.exports = { parseListQuery, parseSelect, runListQuery };
