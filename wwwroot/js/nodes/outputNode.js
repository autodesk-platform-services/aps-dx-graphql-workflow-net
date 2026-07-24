import { updateConnections } from '../core/connections.js';

export const key = 'output';

export function createFields(nodeData) {
    nodeData.displayValue = null;
}

export function renderBody(id) {
    return `
        <div class="node-field">
            <label class="node-field-label">Received Value</label>
            <div class="node-output-display" id="${id}-output-display">
                <span class="node-output-placeholder">No value</span>
            </div>
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

export function attachEvents(node) {
    // The display box is user-resizable (see .node-output-display's `resize:
    // vertical` in styles.css) - keep connections attached to the node as it grows/shrinks.
    const display = node.querySelector('.node-output-display');
    if (!display || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => updateConnections());
    observer.observe(display);
}

export function serialize() {
    return {};
}

export function updateDisplay(id, value) {
    const displayElement = document.getElementById(`${id}-output-display`);
    if (!displayElement) return;

    let displayText;
    if (value === null || value === undefined) {
        displayText = '<span class="node-output-placeholder">No value</span>';
    } else if (typeof value === 'object') {
        displayText = `<pre>${JSON.stringify(value, null, 2)}</pre>`;
    } else {
        displayText = `<span class="node-output-value">${String(value)}</span>`;
    }
    displayElement.innerHTML = displayText;
}
