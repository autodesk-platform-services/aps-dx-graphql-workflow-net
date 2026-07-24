import { escapeHtml } from './selectableTable.js';

export const key = 'filter';

export function createFields(nodeData, options, nodeMeta) {
    nodeData.filterText = options.filterText ?? nodeMeta.default_fields.filterText;
}

export function renderBody(id, nodeData) {
    return `
        <div class="node-field">
            <label class="node-field-label">Filter by name</label>
            <input
                type="text"
                class="node-title-input"
                data-node="${id}"
                value="${escapeHtml(nodeData.filterText)}"
                placeholder="e.g. Office"
            />
        </div>
        <div class="node-row">
            <span class="port-label">in</span>
            <span class="port-label">out</span>
        </div>
    `;
}

export function renderPorts(id) {
    return `
        <div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>
        <div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>
    `;
}

export function attachEvents(node, id, nodeData) {
    const input = node.querySelector('.node-title-input');
    if (!input) return;

    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('input', (e) => {
        nodeData.filterText = e.target.value;
    });
}

export function serialize(nodeData) {
    return { filterText: nodeData.filterText };
}

// `elements` is whatever the connected Hubs/Projects/Folders/Items/
// Exchanges/Get Views node output - each one is a plain object with a
// `name` field, so a single substring check works across all of them.
export function execute(id, nodeData, elements) {
    const needle = (nodeData.filterText || '').trim().toLowerCase();
    if (!needle) return elements || [];
    return (elements || []).filter((el) => (el.name || '').toLowerCase().includes(needle));
}
