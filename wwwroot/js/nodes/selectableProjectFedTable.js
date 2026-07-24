// Shared behavior for node types fed by an array of selected projects that
// themselves produce a checkbox-selectable output (Folders, Items,
// Exchanges) - structurally identical to projectsNode.js, just fed by
// projects instead of hubs. Each node module is a thin wrapper around these
// functions, differing only in endpoint/placeholder copy.

import { autoArrangeNodes } from '../core/arrange.js';
import { escapeHtml } from './selectableTable.js';
import { renderGraphqlButtonRow, bindGraphqlButton } from './graphqlButton.js';

export function createSelectableFields(nodeData, options) {
    nodeData.items = [];
    nodeData.selectedIds = new Set(options.selectedIds || []);
}

// `nodeType` is optional - omit it for a node whose table isn't backed
// directly by a Data Exchange GraphQL query (e.g. Get Views, which reaches
// views via the Data Management + Model Derivative REST APIs instead), to
// skip the "Get the GraphQL query" button rather than show a misleading one.
//
// `columns` is an optional list of extra `{label, getValue(item)}` columns
// beyond the built-in checkbox + Name (e.g. Version, Created).
export function renderSelectableTableBody(id, waitingMessage, nodeType, columns = []) {
    const colspan = 2 + columns.length;
    return `
        <div class="node-table-wrap">
            <table class="node-data-table">
                <thead>
                    <tr>
                        <th class="node-table-check-col"></th>
                        <th>Name</th>
                        ${columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody id="${id}-rows">
                    <tr><td class="node-table-empty" colspan="${colspan}">${waitingMessage}</td></tr>
                </tbody>
            </table>
        </div>
        ${nodeType ? renderGraphqlButtonRow(nodeType) : ''}
    `;
}

export function renderInputOutputPorts(id) {
    return `
        <div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>
        <div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>
    `;
}

export function bindSelectableTableEvents(node, id, nodeData) {
    // Stop checkbox clicks from bubbling to the node and starting a drag.
    const wrap = node.querySelector('.node-table-wrap');
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.matches('input[type="checkbox"]')) e.stopPropagation();
    });

    node.addEventListener('change', (e) => {
        if (e.target.classList.contains('node-row-check')) {
            const itemId = e.target.dataset.itemId;
            if (e.target.checked) nodeData.selectedIds.add(itemId);
            else nodeData.selectedIds.delete(itemId);
        }
    });

    bindGraphqlButton(node);
}

export function serializeSelectable(nodeData) {
    return { selectedIds: Array.from(nodeData.selectedIds) };
}

function renderRows(id, nodeData, emptyMessage, columns) {
    const tbody = document.getElementById(`${id}-rows`);
    if (!tbody) return;

    const { items, selectedIds } = nodeData;
    const colspan = 2 + columns.length;

    if (!items.length) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="${colspan}">${emptyMessage}</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map((item) => `
        <tr>
            <td class="node-table-check-col">
                <input
                    type="checkbox"
                    class="node-row-check"
                    data-item-id="${escapeHtml(item.id)}"
                    data-node="${id}"
                    ${selectedIds.has(item.id) ? 'checked' : ''}
                />
            </td>
            <td>${escapeHtml(item.name)}</td>
            ${columns.map((c) => `<td>${escapeHtml(String(c.getValue(item) ?? ''))}</td>`).join('')}
        </tr>
    `).join('');
}

function renderError(id, message, columns) {
    const tbody = document.getElementById(`${id}-rows`);
    if (tbody) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="${2 + columns.length}">Error: ${escapeHtml(message)}</td></tr>`;
    }
}

// Fetches `endpoint` with the selected upstream items (id + region + kind),
// renders the checkbox-selectable result list, keeps neighbors from
// overlapping once the table's size changes, and returns the
// currently-checked subset so it can feed further downstream nodes.
//
// Upstream items are either projects (from a Projects node) or already-
// resolved folders (from another Folders node, to drill into a specific
// subfolder) - `kind` tells the backend which one it's looking at.
//
// `skipFetch` (set by core/run.js when the immediate upstream node is a
// Filter) means `projects` is already the final list to show - Filter only
// narrows an already-fetched list by name, it doesn't hand back something
// this node's own query could resolve further (an Item/Exchange has no
// "contents" to list, and even for a Folder, re-querying would drill one
// level deeper into its subfolders instead of just showing the filtered
// set). So render it directly instead of issuing a new backend call.
export async function executeSelectableProjectFedTable(id, nodeData, projects, { endpoint, emptyMessage, columns = [], skipFetch = false }) {
    if (skipFetch) {
        nodeData.items = projects || [];
        renderRows(id, nodeData, emptyMessage, columns);
        autoArrangeNodes();
        return nodeData.items.filter((item) => nodeData.selectedIds.has(item.id));
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projects: projects.map((item) => ({ id: item.id, region: item.region, kind: item.kind })),
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        const items = await response.json();
        nodeData.items = items;

        renderRows(id, nodeData, emptyMessage, columns);
        autoArrangeNodes();
    } catch (err) {
        nodeData.items = [];
        renderError(id, err.message, columns);
    }

    return nodeData.items.filter((item) => nodeData.selectedIds.has(item.id));
}
