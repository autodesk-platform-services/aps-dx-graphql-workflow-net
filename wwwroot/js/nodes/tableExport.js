// Shared behavior for CSV Output and Excel Output - both accept the same
// input (any number of connected table-producing nodes: Items, Exchanges,
// Folders, Get Views, Get Exchange Data, or a Filter narrowing one of
// those), group it into one or more distinct tables, POST them to the
// backend, and trigger a browser download of the returned file bytes.

import { escapeHtml } from './selectableTable.js';
import { COLUMNS as ITEMS_COLUMNS } from './itemsNode.js';
import { COLUMNS as EXCHANGES_COLUMNS } from './exchangesNode.js';
import { COLUMNS as PROCESS_LABELS, ROW_FIELDS as PROCESS_FIELDS } from './exchangeDataNode.js';

const NAME_COLUMN = { label: 'Name', getValue: (el) => el.name };

// Exchange Data's rows have no `name` field at all - its own columns
// (Element ID, Category, ...) replace Name entirely rather than adding to
// it, unlike Items/Exchanges/Folders/Get Views which all show Name first.
const PROCESS_COLUMNS = PROCESS_FIELDS.map((field, i) => ({
    label: PROCESS_LABELS[i],
    getValue: (row) => row[field],
}));

// Table "shape" is detected from each element's own fields, not from which
// node/connection it arrived through - elements reaching this node may have
// passed through one or more Filter nodes first (which only narrow an
// upstream array by name, leaving each element's original shape untouched),
// and a single Filter can even mix Items+Exchanges elements together if fed
// by both at once - checking the actual shape handles that correctly
// regardless of how many hops or what mix arrived. Order doesn't matter
// here since these fields don't overlap across real shapes.
const SHAPES = [
    // Items and Exchanges happen to share the exact same column set (Name,
    // Version, Created), so they're named jointly here - anything using
    // this shape's `name` (sheet/file naming) reflects that it may contain
    // rows merged from either, not just one.
    { name: 'items_exchanges', matches: (el) => 'tipVersion' in el, columns: [NAME_COLUMN, ...ITEMS_COLUMNS] },
    { name: 'items_exchanges', matches: (el) => 'alternativeIdentifiers' in el || 'version' in el, columns: [NAME_COLUMN, ...EXCHANGES_COLUMNS] },
    { name: 'exchange_elements', matches: (el) => 'keyProperty' in el, columns: PROCESS_COLUMNS },
];
// Folders, Get Views, and anything else unrecognized (e.g. a Filter's own
// output) have no extra columns of their own - Name only, matching what
// those nodes' own tables show.
const DEFAULT_SHAPE = { name: 'table', columns: [NAME_COLUMN] };

function shapeFor(element) {
    return SHAPES.find((shape) => shape.matches(element)) || DEFAULT_SHAPE;
}

function stringifyCell(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
}

// `groups` is [{ nodeId, type, elements }] - one entry per connection into
// this node (see the TABLE_EXPORT_TYPES branches in core/run.js). `type` is
// unused here - shape detection below is per-element, not per-connection,
// so a mixed-shape source (e.g. one Filter fed by both an Items and an
// Exchanges node) still gets split correctly.
//
// Elements whose detected shape has the exact same column set are merged
// into one table (rows concatenated); anything else becomes its own table -
// column-set identity, not node type identity, is the merge key. E.g.
// Folders and Get Views both only have a Name column, so two such sources
// merge too, which matches "same table structure" taken literally.
export function buildTables(groups) {
    const buckets = new Map();

    for (const group of groups || []) {
        for (const element of group.elements || []) {
            const shape = shapeFor(element);
            const signature = shape.columns.map((c) => c.label).join(' ');

            if (!buckets.has(signature)) {
                buckets.set(signature, { name: shape.name, columns: shape.columns, rows: [] });
            }
            buckets.get(signature).rows.push(shape.columns.map((c) => stringifyCell(c.getValue(element))));
        }
    }

    return Array.from(buckets.values()).map((bucket) => ({
        name: bucket.name,
        columns: bucket.columns.map((c) => c.label),
        rows: bucket.rows,
    }));
}

export function createFields(nodeData, options) {
    nodeData.filepath = options.filepath ?? '';
}

export function renderBody(id, nodeData) {
    return `
        <div class="node-output-display" id="${id}-export-result">
            <span class="node-output-placeholder">Not exported yet</span>
        </div>
        <div class="node-row">
            <span class="port-label">in</span>
            <span></span>
        </div>
    `;
}

export function renderPorts(id) {
    return `<div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>`;
}

export function attachEvents() {
    // No node-specific inputs — export uses the node id as the download filename.
}

export function serialize(nodeData) {
    const filepath = (nodeData.filepath || '').trim();
    return filepath ? { filepath } : {};
}

function renderResult(id, message, isError) {
    const el = document.getElementById(`${id}-export-result`);
    if (!el) return;
    el.innerHTML = `<span class="${isError ? 'node-export-error' : 'node-export-success'}">${escapeHtml(message)}</span>`;
}

function parseDownloadFilename(response, fallback) {
    const disposition = response.headers.get('Content-Disposition') || '';
    return /filename="([^"]+)"/.exec(disposition)?.[1] || fallback;
}

function triggerBrowserDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

async function readExportError(response) {
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
        return `Request failed (${response.status})`;
    }
    const body = await response.json().catch(() => ({}));
    return body.error || `Request failed (${response.status})`;
}

// Returns an `execute(id, nodeData, groups)` that builds the table(s) from
// whatever's connected and POSTs them to `endpoint` - the one thing that
// actually differs between CSV Output and Excel Output.
export function makeExecute(endpoint, defaultExtension) {
    return async function execute(id, nodeData, groups) {
        const tables = buildTables(groups);
        if (!tables.length || tables.every((t) => t.rows.length === 0)) {
            renderResult(id, 'No rows to export', false);
            return;
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tables, filepath: nodeData.filepath || null, nodeId: id }),
            });
            if (!response.ok) {
                throw new Error(await readExportError(response));
            }

            const filename = parseDownloadFilename(response, `${id}${defaultExtension}`);
            const blob = await response.blob();
            triggerBrowserDownload(blob, filename);
            renderResult(id, `Downloaded ${filename}`, false);
        } catch (err) {
            renderResult(id, `Error: ${err.message}`, true);
        }
    };
}
