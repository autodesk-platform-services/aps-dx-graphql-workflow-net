import { state } from './state.js';
import { NODE_TYPES } from './dom.js';
import { NODE_HANDLERS } from '../nodes/registry.js';
import { showToast } from './ui.js';

// Node types fed by a single upstream array (hubs, for Projects; projects,
// for Folders/Items/Exchanges; items, for Get Views) whose execute() awaits
// a network call and returns the currently-selected subset as its own output.
const PROJECT_FED_TYPES = ['projects', 'folders', 'items', 'exchanges', 'get_views'];

// CSV/Excel Output's single input port can have multiple table-producing
// nodes connected to it at once, same as Viewer Output's - but unlike
// Viewer Output, they need to know which elements came from which upstream
// node/type (see tableExport.js's buildTables), not one flattened array, so
// they get their own aggregation shape: [{ nodeId, type, elements }].
const TABLE_EXPORT_TYPES = ['csv_output', 'excel_output'];

export async function runFlow() {
    const nodeOutputs = new Map();

    state.nodes.forEach((nodeData, nodeId) => {
        if (nodeData.type === 'hubs') {
            nodeOutputs.set(nodeId, NODE_HANDLERS.hubs.getSeedValue(nodeData));
        }
    });

    const incomingConnections = new Map();
    state.connections.forEach((conn) => {
        if (!incomingConnections.has(conn.to)) incomingConnections.set(conn.to, []);
        incomingConnections.get(conn.to).push(conn);
    });

    let iterations = 0;
    const maxIterations = 100;
    let changed = true;

    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        // A for...of loop (rather than Map#forEach) so nodes that need to
        // await a network call can do so before the rest of this pass continues.
        for (const [nodeId, nodeData] of state.nodes) {
            if (nodeOutputs.has(nodeId)) continue;

            const incoming = incomingConnections.get(nodeId) || [];
            const inputs = [];
            let allInputsReady = true;

            if (nodeData.type === 'data') {
                // Viewer Output's single input port can have multiple
                // Exchanges/Items nodes connected to it at once (see
                // VIEWER_ALLOWED_SOURCE_TYPES in connections.js) - flatten
                // every upstream connection's elements into one list rather
                // than only using whichever connection happened to be first.
                inputs[0] = [];
                for (const conn of incoming) {
                    if (!nodeOutputs.has(conn.from)) {
                        allInputsReady = false;
                        break;
                    }
                    inputs[0].push(...(nodeOutputs.get(conn.from) || []));
                }
            } else if (nodeData.type === 'logic') {
                // Create Exchange's 2 ports: 0 (views) aggregates every
                // connected Get Views node into one array, same idea as
                // Viewer Output's port above - more than one Get Views node
                // can feed it at once. 1 (folder) is a plain single connection.
                inputs[0] = [];
                for (const conn of incoming.filter((c) => c.toPortIndex === 0)) {
                    if (!nodeOutputs.has(conn.from)) {
                        allInputsReady = false;
                        break;
                    }
                    inputs[0].push(...(nodeOutputs.get(conn.from) || []));
                }

                const folderConn = incoming.find((c) => c.toPortIndex === 1);
                if (folderConn) {
                    if (nodeOutputs.has(folderConn.from)) inputs[1] = nodeOutputs.get(folderConn.from);
                    else allInputsReady = false;
                } else {
                    inputs[1] = [];
                }
            } else if (nodeData.type === 'filter' || nodeData.type === 'process') {
                // Filter's and Get Exchange Data's single input port can
                // each have multiple upstream nodes connected at once (e.g.
                // several Folders nodes, or several Exchanges nodes) -
                // flatten all of their elements into one array before
                // filtering/querying, same idea as Viewer Output's port above.
                inputs[0] = [];
                for (const conn of incoming) {
                    if (!nodeOutputs.has(conn.from)) {
                        allInputsReady = false;
                        break;
                    }
                    inputs[0].push(...(nodeOutputs.get(conn.from) || []));
                }
            } else if (TABLE_EXPORT_TYPES.includes(nodeData.type)) {
                inputs[0] = [];
                for (const conn of incoming) {
                    if (!nodeOutputs.has(conn.from)) {
                        allInputsReady = false;
                        break;
                    }
                    inputs[0].push({
                        nodeId: conn.from,
                        type: state.nodes.get(conn.from)?.type,
                        elements: nodeOutputs.get(conn.from) || [],
                    });
                }
            } else if (incoming.length > 0) {
                // Every other type (output/projects/folders/items/exchanges) has a single input port.
                const conn = incoming[0];
                if (nodeOutputs.has(conn.from)) {
                    inputs[0] = nodeOutputs.get(conn.from);
                } else {
                    allInputsReady = false;
                }
            }

            if (!allInputsReady) continue;

            if (nodeData.type === 'output') {
                const value = inputs[0] !== undefined ? inputs[0] : 'No value';
                nodeData.displayValue = value;
                nodeOutputs.set(nodeId, value);
                NODE_HANDLERS.output.updateDisplay(nodeId, value);
                changed = true;
            } else if (PROJECT_FED_TYPES.includes(nodeData.type)) {
                const upstream = inputs[0] || [];
                // Folders/Items/Exchanges fed by a Filter node: it already
                // narrowed a previously-fetched list by name, so there's
                // nothing further to query - see selectableProjectFedTable.js's
                // skipFetch. Only 'filter' is ever a legal source for those
                // 3 types (see their allowed_source_types), so this is a
                // no-op for Projects/Get Views.
                const sourceType = state.nodes.get(incoming[0]?.from)?.type;
                const result = await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, upstream, { skipFetch: sourceType === 'filter' });
                nodeData.lastOutput = result;
                nodeOutputs.set(nodeId, result);
                changed = true;
            } else if (nodeData.type === 'data') {
                // No output port and nothing downstream can depend on it - just
                // render the model and mark it processed so the pass can finish.
                NODE_HANDLERS.data.execute(nodeId, nodeData, inputs[0] || []);
                nodeOutputs.set(nodeId, true);
                changed = true;
            } else if (TABLE_EXPORT_TYPES.includes(nodeData.type)) {
                // No output port either - writes the file(s) as a side
                // effect and marks itself processed, same as Viewer Output.
                await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, inputs[0] || []);
                nodeOutputs.set(nodeId, true);
                changed = true;
            } else if (nodeData.type === 'logic') {
                const result = await NODE_HANDLERS.logic.execute(nodeId, nodeData, inputs[0] || [], inputs[1] || []);
                nodeData.lastOutput = result;
                nodeOutputs.set(nodeId, result);
                changed = true;
            } else if (typeof NODE_HANDLERS[nodeData.type]?.execute === 'function') {
                // Generic fallback for any node type not special-cased above -
                // this is what a newly added node type gets automatically
                // (see README.md's "Adding a new node type" section): a
                // single input value in, an optional single output value out.
                // Filter and Get Exchange Data ('process') land here too -
                // their own gather-phase branch above already aggregated
                // inputs[0], this just runs their execute() the same as any
                // other single-value node. Types needing several
                // *simultaneously distinct* inputs (Create Exchange) still
                // need their own branch above instead.
                const result = await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, inputs[0]);
                nodeData.lastOutput = result;
                nodeOutputs.set(nodeId, NODE_TYPES[nodeData.type]?.has_output ? result : true);
                changed = true;
            }
        }
    }

    showToast('Flow executed');
}

// Reads a node's current value without requiring a full flow run - Hubs is
// always "live" (its output is just its current checkbox selection). Other
// producer types normally just return whatever they last computed (via a
// full run or their own per-node Run button); but if they've never been run
// at all yet, `lastOutput` is undefined, so this recursively resolves (and
// caches) that upstream node's value first, walking all the way back to a
// Hubs node if needed. `visited` guards against an accidental miswired cycle.
async function resolveCurrentValue(nodeData, visited = new Set()) {
    if (!nodeData) return undefined;
    if (nodeData.type === 'hubs') return NODE_HANDLERS.hubs.getSeedValue(nodeData);
    if (nodeData.lastOutput !== undefined) return nodeData.lastOutput;
    if (visited.has(nodeData.id)) return undefined;

    const handler = NODE_HANDLERS[nodeData.type];

    if (PROJECT_FED_TYPES.includes(nodeData.type)) {
        visited.add(nodeData.id);
        const conn = state.connections.find((c) => c.to === nodeData.id && c.toPortIndex === 0);
        const upstream = conn ? ((await resolveCurrentValue(state.nodes.get(conn.from), visited)) || []) : [];
        const sourceType = conn ? state.nodes.get(conn.from)?.type : undefined;
        nodeData.lastOutput = await handler.execute(nodeData.id, nodeData, upstream, { skipFetch: sourceType === 'filter' });
        return nodeData.lastOutput;
    }

    if (nodeData.type === 'filter' || nodeData.type === 'process') {
        visited.add(nodeData.id);
        const conns = state.connections.filter((c) => c.to === nodeData.id && c.toPortIndex === 0);
        const aggregated = [];
        for (const conn of conns) {
            aggregated.push(...((await resolveCurrentValue(state.nodes.get(conn.from), visited)) || []));
        }
        nodeData.lastOutput = await handler.execute(nodeData.id, nodeData, aggregated);
        return nodeData.lastOutput;
    }

    if (nodeData.type === 'logic') {
        visited.add(nodeData.id);
        const viewsConns = state.connections.filter((c) => c.to === nodeData.id && c.toPortIndex === 0);
        const folderConn = state.connections.find((c) => c.to === nodeData.id && c.toPortIndex === 1);

        const views = [];
        for (const conn of viewsConns) {
            views.push(...((await resolveCurrentValue(state.nodes.get(conn.from), visited)) || []));
        }
        const folders = folderConn ? ((await resolveCurrentValue(state.nodes.get(folderConn.from), visited)) || []) : [];

        nodeData.lastOutput = await handler.execute(nodeData.id, nodeData, views, folders);
        return nodeData.lastOutput;
    }

    // Generic fallback, mirroring runFlow()'s catch-all - any other node
    // type with an output port and its own execute() can be cold-start
    // resolved too, one single upstream value in and out.
    if (!NODE_TYPES[nodeData.type]?.has_output || typeof handler?.execute !== 'function') return undefined;
    visited.add(nodeData.id);
    const conn = state.connections.find((c) => c.to === nodeData.id && c.toPortIndex === 0);
    const upstream = conn ? await resolveCurrentValue(state.nodes.get(conn.from), visited) : undefined;
    nodeData.lastOutput = await handler.execute(nodeData.id, nodeData, upstream);
    return nodeData.lastOutput;
}

// Recomputes a single node from its immediate upstream connections' current
// values, without running the rest of the flow. Lets you e.g. change a Hubs
// selection and refresh just the downstream Projects node - and if nothing
// upstream has ever been run yet, resolves that chain first automatically.
export async function runSingleNode(nodeId) {
    const nodeData = state.nodes.get(nodeId);
    if (!nodeData) return;

    const incoming = state.connections.filter((conn) => conn.to === nodeId);

    if (PROJECT_FED_TYPES.includes(nodeData.type)) {
        const conn = incoming.find((c) => c.toPortIndex === 0);
        const upstream = conn ? ((await resolveCurrentValue(state.nodes.get(conn.from))) || []) : [];
        const sourceType = conn ? state.nodes.get(conn.from)?.type : undefined;
        nodeData.lastOutput = await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, upstream, { skipFetch: sourceType === 'filter' });
    } else if (nodeData.type === 'filter' || nodeData.type === 'process') {
        const aggregated = [];
        for (const conn of incoming) {
            aggregated.push(...((await resolveCurrentValue(state.nodes.get(conn.from))) || []));
        }
        nodeData.lastOutput = await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, aggregated);
        showToast(`${NODE_TYPES[nodeData.type]?.name || nodeData.type} executed`);
    } else if (nodeData.type === 'data') {
        // Aggregate every connected Exchanges/Items node, not just the first.
        const aggregated = [];
        for (const conn of incoming) {
            aggregated.push(...((await resolveCurrentValue(state.nodes.get(conn.from))) || []));
        }
        NODE_HANDLERS.data.execute(nodeId, nodeData, aggregated);
    } else if (TABLE_EXPORT_TYPES.includes(nodeData.type)) {
        // Keeps each connection's elements separate rather than flattening -
        // see the identical branch in runFlow() above for why.
        const groups = [];
        for (const conn of incoming) {
            groups.push({
                nodeId: conn.from,
                type: state.nodes.get(conn.from)?.type,
                elements: (await resolveCurrentValue(state.nodes.get(conn.from))) || [],
            });
        }
        await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, groups);
        showToast(`${NODE_TYPES[nodeData.type]?.name || nodeData.type} executed`);
    } else if (nodeData.type === 'logic') {
        const viewsConns = incoming.filter((c) => c.toPortIndex === 0);
        const folderConn = incoming.find((c) => c.toPortIndex === 1);

        const views = [];
        for (const conn of viewsConns) {
            views.push(...((await resolveCurrentValue(state.nodes.get(conn.from))) || []));
        }
        const folders = folderConn ? ((await resolveCurrentValue(state.nodes.get(folderConn.from))) || []) : [];

        nodeData.lastOutput = await NODE_HANDLERS.logic.execute(nodeId, nodeData, views, folders);
        showToast('Create Exchange executed');
    } else if (typeof NODE_HANDLERS[nodeData.type]?.execute === 'function') {
        // Generic fallback, mirroring runFlow()'s catch-all - see README.md's
        // "Adding a new node type" section.
        const conn = incoming.find((c) => c.toPortIndex === 0);
        const upstream = conn ? await resolveCurrentValue(state.nodes.get(conn.from)) : undefined;
        nodeData.lastOutput = await NODE_HANDLERS[nodeData.type].execute(nodeId, nodeData, upstream);
        showToast(`${NODE_TYPES[nodeData.type]?.name || nodeData.type} executed`);
    } else {
        showToast('This node type has nothing to run yet');
    }
}
