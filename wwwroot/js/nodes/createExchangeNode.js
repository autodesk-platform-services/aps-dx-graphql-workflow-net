import { updateConnections } from '../core/connections.js';
import { renderGraphqlButtonRow, bindGraphqlButton } from './graphqlButton.js';

export const key = 'logic';

export function createFields(nodeData) {
    nodeData.results = [];
}

export function renderBody(id) {
    return `
        <div class="node-ports-row">
            <div class="node-ports-labels-left">
                <span class="port-label">views</span>
                <span class="port-label">folder</span>
            </div>
            <div class="node-ports-labels-right">
                <span class="port-label">out</span>
            </div>
        </div>
        <div class="node-field">
            <label class="node-field-label">Created Exchanges (raw mutation output)</label>
            <div class="node-output-display" id="${id}-output-display"></div>
        </div>
        ${renderGraphqlButtonRow('logic')}
    `;
}

// Plain standalone ports (not the shared .ports-container.ports-input
// stack) - alignPortsToLabels below gives each one its own computed `top`
// matching its label's row, which the generic centered-stack layout can't do.
export function renderPorts(id) {
    return `
        <div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>
        <div class="port port-input" data-port="input" data-port-index="1" data-node="${id}"></div>
        <div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>
    `;
}

export function attachEvents(node) {
    // The display box is user-resizable (see .node-output-display's `resize:
    // vertical` in styles.css) - keep connections attached to the node as it grows/shrinks.
    const display = node.querySelector('.node-output-display');
    if (display && typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => updateConnections());
        observer.observe(display);
    }
    updateDisplayElement(display, []);

    bindGraphqlButton(node);
    alignPortsToLabels(node);
}

// This node's ports live outside .node-body (so they can hang half off the
// node's edge, like every port in the app) and are positioned via CSS
// `top: 50%` of the *whole node* by default (see .port-input/.port-output
// in styles.css) - fine for a node with one input row roughly at that
// center, but this node has 2 stacked input labels above a resizable
// results box, so that 50% mark lands well below "views"/"folder". Measure
// each label's actual position instead of trusting the centered default.
function alignPortsToLabels(node) {
    const nodeRect = node.getBoundingClientRect();

    const leftLabels = node.querySelectorAll('.node-ports-labels-left .port-label');
    const inputPorts = node.querySelectorAll('.port-input');
    leftLabels.forEach((label, i) => {
        const port = inputPorts[i];
        if (!port) return;
        const labelRect = label.getBoundingClientRect();
        port.style.top = `${labelRect.top + labelRect.height / 2 - nodeRect.top}px`;
    });

    const outLabel = node.querySelector('.node-ports-labels-right .port-label');
    const outPort = node.querySelector('.port-output');
    if (outLabel && outPort) {
        const labelRect = outLabel.getBoundingClientRect();
        outPort.style.top = `${labelRect.top + labelRect.height / 2 - nodeRect.top}px`;
    }
}

export function serialize() {
    return {};
}

function updateDisplayElement(displayElement, results) {
    if (!displayElement) return;
    displayElement.innerHTML = (results && results.length)
        ? `<pre>${JSON.stringify(results, null, 2)}</pre>`
        : '<span class="node-output-placeholder">No exchanges created yet</span>';
}

// `views` (port 0) can be the combined output of several Get Views nodes
// at once; `folders` (port 1) is a single connection's value, and only
// folders[0] is used even if that Folders node has several checked. A view
// already carries the id of the item it belongs to (see
// model_derivative_service.get_views_for_item's `itemId`), so there's no
// separate Items input to match it against. The backend issues one
// createExchange mutation per view and hands back the raw per-call results
// untouched.
export async function execute(id, nodeData, views, folders) {
    try {
        const response = await fetch('/api/dx/create-exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                views: (views || []).map((view) => ({ id: view.id, name: view.name, itemId: view.itemId })),
                folders: (folders || []).map((folder) => ({ id: folder.id, region: folder.region })),
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        nodeData.results = await response.json();
    } catch (err) {
        nodeData.results = [{ error: err.message }];
    }

    updateDisplayElement(document.getElementById(`${id}-output-display`), nodeData.results);
    return nodeData.results;
}
