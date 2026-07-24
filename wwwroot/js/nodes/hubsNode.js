import { autoArrangeNodes } from '../core/arrange.js';
import { escapeHtml } from './selectableTable.js';
import { renderGraphqlButtonRow, bindGraphqlButton } from './graphqlButton.js';

export const key = 'hubs';

export function createFields(nodeData, options) {
    nodeData.hubs = [];
    // Nothing selected by default - the user opts in to which hubs feed downstream.
    nodeData.selectedIds = new Set(options.selectedIds || []);
}

export function renderBody(id) {
    return `
        <div class="node-table-wrap">
            <table class="node-data-table">
                <thead>
                    <tr>
                        <th class="node-table-check-col"></th>
                        <th>Name</th>
                        <th>Region</th>
                    </tr>
                </thead>
                <tbody id="${id}-hub-rows">
                    <tr><td class="node-table-empty" colspan="3">Loading hubs…</td></tr>
                </tbody>
            </table>
        </div>
        ${renderGraphqlButtonRow('hubs')}
    `;
}

export function renderPorts(id) {
    return `<div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>`;
}

export function attachEvents(node, id, nodeData) {
    // Stop checkbox clicks from bubbling to the node and starting a drag.
    const wrap = node.querySelector('.node-table-wrap');
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.matches('input[type="checkbox"]')) e.stopPropagation();
    });

    node.addEventListener('change', (e) => {
        if (e.target.classList.contains('node-row-check')) {
            const hubId = e.target.dataset.itemId;
            if (e.target.checked) nodeData.selectedIds.add(hubId);
            else nodeData.selectedIds.delete(hubId);
        }
    });

    bindGraphqlButton(node);
    fetchHubs(id, nodeData);
}

export function serialize(nodeData) {
    return { selectedIds: Array.from(nodeData.selectedIds) };
}

export function getSeedValue(nodeData) {
    return nodeData.hubs.filter((hub) => nodeData.selectedIds.has(hub.id));
}

function renderRows(id, nodeData) {
    const tbody = document.getElementById(`${id}-hub-rows`);
    if (!tbody) return;

    const { hubs, selectedIds } = nodeData;

    if (!hubs.length) {
        tbody.innerHTML = '<tr><td class="node-table-empty" colspan="3">No hubs found</td></tr>';
        return;
    }

    tbody.innerHTML = hubs.map((hub) => `
        <tr>
            <td class="node-table-check-col">
                <input
                    type="checkbox"
                    class="node-row-check"
                    data-item-id="${escapeHtml(hub.id)}"
                    data-node="${id}"
                    ${selectedIds.has(hub.id) ? 'checked' : ''}
                />
            </td>
            <td>${escapeHtml(hub.name)}</td>
            <td>${escapeHtml(hub.region)}</td>
        </tr>
    `).join('');
}

function renderError(id, message) {
    const tbody = document.getElementById(`${id}-hub-rows`);
    if (tbody) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="3">Error: ${escapeHtml(message)}</td></tr>`;
    }
}

async function fetchHubs(id, nodeData) {
    try {
        const response = await fetch('/api/dx/hubs');
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        const hubs = await response.json();
        nodeData.hubs = hubs;

        renderRows(id, nodeData);
        // The table just grew from a one-line "Loading..." placeholder to a
        // full list - re-arrange so it doesn't overlap neighboring nodes.
        autoArrangeNodes();
    } catch (err) {
        renderError(id, err.message);
    }
}
