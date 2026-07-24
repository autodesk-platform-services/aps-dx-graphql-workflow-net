import { canvas, NODE_TYPES } from './dom.js';
import { state } from './state.js';
import { NODE_HANDLERS } from '../nodes/registry.js';
import { bindAllPorts } from './ports.js';
import { updateConnections } from './connections.js';
import { runSingleNode } from './run.js';
import { showToast, showContextMenu, hideContextMenu } from './ui.js';

// Hubs is always "live" (no run step needed) and Output is a passive
// display - every other type gets a per-node Run button in its header.
const RUNNABLE_TYPES_EXCLUDED = new Set(['hubs', 'output']);

export function createNode(type, x, y, options = {}) {
    const id = `node-${++state.nodeCounter}`;
    const nodeMeta = NODE_TYPES[type];
    const handler = NODE_HANDLERS[type];

    const node = document.createElement('div');
    node.className = `node node-type-${type}`;
    node.id = id;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;

    const nodeData = {
        id,
        type,
        element: node,
        x,
        y,
        hasInput: nodeMeta.has_input,
        hasOutput: nodeMeta.has_output,
    };
    handler.createFields(nodeData, options, nodeMeta);

    const bodyContent = handler.renderBody(id, nodeData, nodeMeta);
    const portsHtml = handler.renderPorts(id, nodeData, nodeMeta);
    const runButtonHtml = RUNNABLE_TYPES_EXCLUDED.has(type)
        ? ''
        : `<button class="node-run-btn" data-node="${id}" title="Run this node">▶</button>`;

    node.innerHTML = `
        <div class="node-header">
            <div class="node-icon">${nodeMeta.icon}</div>
            <div class="node-title" id="${id}-title">${nodeMeta.name}</div>
            ${runButtonHtml}
        </div>
        <div class="node-body">
            ${bodyContent}
        </div>
        ${portsHtml}
    `;

    canvas.appendChild(node);
    state.nodes.set(id, nodeData);

    if (handler.attachEvents) handler.attachEvents(node, id, nodeData);
    bindAllPorts(node);
    setupNodeEvents(node, id);
    setupRunButton(node, id);
    selectNode(id);

    return id;
}

export function createNodeWithId(type, x, y, specificId, options = {}) {
    const match = specificId.match(/node-(\d+)/);
    if (match) {
        state.nodeCounter = parseInt(match[1], 10) - 1;
    }
    return createNode(type, x, y, options);
}

function setupRunButton(node, id) {
    const btn = node.querySelector('.node-run-btn');
    if (!btn) return;

    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        runSingleNode(id);
    });
}

function setupNodeEvents(node, id) {
    node.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('port')) return;

        e.preventDefault();
        selectNode(id);

        const nodeData = state.nodes.get(id);
        state.dragOffset = { x: e.clientX - nodeData.x, y: e.clientY - nodeData.y };
        node.classList.add('dragging');

        const onMouseMove = (moveEvent) => {
            const x = moveEvent.clientX - state.dragOffset.x;
            const y = moveEvent.clientY - state.dragOffset.y;

            nodeData.x = x;
            nodeData.y = y;
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;

            updateConnections();
        };

        const onMouseUp = () => {
            node.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    node.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        selectNode(id);
        showContextMenu(e.clientX, e.clientY);
    });
}

export function selectNode(id) {
    if (state.selectedNode) {
        const prev = state.nodes.get(state.selectedNode);
        if (prev) prev.element.classList.remove('selected');
    }
    state.selectedNode = id;
    const node = state.nodes.get(id);
    if (node) node.element.classList.add('selected');
}

export function deselectAll() {
    if (state.selectedNode) {
        const node = state.nodes.get(state.selectedNode);
        if (node) node.element.classList.remove('selected');
    }
    state.selectedNode = null;
    hideContextMenu();
}

export function deleteSelected() {
    if (!state.selectedNode) return;

    const nodeId = state.selectedNode;
    const node = state.nodes.get(nodeId);

    if (node) {
        node.element.remove();
        state.nodes.delete(nodeId);
        state.connections = state.connections.filter((c) => c.from !== nodeId && c.to !== nodeId);
        updateConnections();
    }

    state.selectedNode = null;
    hideContextMenu();
    showToast('Node deleted');
}

export function duplicateNode() {
    if (!state.selectedNode) return;

    const node = state.nodes.get(state.selectedNode);
    if (node) {
        createNode(node.type, node.x + 30, node.y + 30);
        showToast('Node duplicated');
    }

    hideContextMenu();
}

export function clearCanvas() {
    state.nodes.forEach((node) => node.element.remove());
    state.nodes.clear();
    state.connections = [];
    state.selectedNode = null;
    state.nodeCounter = 0;
    updateConnections();
    showToast('Canvas cleared');
}

// Re-exported here so existing imports of autoArrangeNodes from canvas.js
// keep working. Lives in its own module (rather than inline in this file)
// so node modules (e.g. hubsNode.js) can call it without creating a cycle
// through canvas.js -> nodes/registry.js -> hubsNode.js -> canvas.js.
export { autoArrangeNodes } from './arrange.js';
