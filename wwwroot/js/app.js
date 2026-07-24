import { canvas, canvasContainer } from './core/dom.js';
import {
    createNode, deleteSelected, duplicateNode, autoArrangeNodes, clearCanvas, deselectAll,
} from './core/canvas.js';
import { showToast, hideContextMenu, hideGraphqlModal } from './core/ui.js';
import { runFlow } from './core/run.js';
import { initCanvasPan, resetPan } from './core/pan.js';
import { state } from './core/state.js';
import { updateConnections } from './core/connections.js';
import {
    exportFlow, listServerFlows, saveFlowToServer, loadFlowFromServer,
} from './core/flowIO.js';

let currentFlowId = null;

function initPaletteDragDrop() {
    document.querySelectorAll('.palette-node').forEach((paletteNode) => {
        paletteNode.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('nodeType', paletteNode.dataset.nodeType);
        });
    });

    // Listens on canvasContainer, not canvas - canvas is a fixed-size box
    // that pan.js slides around with a CSS transform, so once panned further
    // than canvas's own width/height, part of the visible container is no
    // longer covered by canvas at all, and drop/dragover would silently
    // never fire there. canvasContainer is the actual full-viewport,
    // never-transformed element, so it always covers the whole drop target
    // area regardless of pan. The coordinate math below still needs canvas's
    // own (transformed) rect, though - subtracting it is what converts a
    // screen point back into canvas's local, pre-transform coordinate space.
    canvasContainer.addEventListener('dragover', (e) => e.preventDefault());

    canvasContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const nodeType = e.dataTransfer.getData('nodeType');
        if (nodeType) {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left - 90;
            const y = e.clientY - rect.top - 30;
            createNode(nodeType, x, y);
        }
    });
}

function initGlobalEvents() {
    // On canvasContainer, not canvas - same reasoning as the drop listener
    // above: a click landing in the panned-past-canvas's-edge gap has
    // canvasContainer itself as its target, which a listener on canvas (a
    // descendant of canvasContainer) would never see bubble up to it.
    canvasContainer.addEventListener('click', (e) => {
        if (e.target === canvas || e.target === canvasContainer || e.target.classList.contains('connections-layer')) {
            deselectAll();
        }
    });

    document.addEventListener('click', () => hideContextMenu());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (document.activeElement === document.body) {
                e.preventDefault();
                deleteSelected();
            }
        }
        if (e.key === 'Escape') {
            deselectAll();
            hideGraphqlModal();
        }
    });
}

function initGraphqlModal() {
    document.getElementById('graphql-modal-close').addEventListener('click', hideGraphqlModal);
    document.getElementById('graphql-modal-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'graphql-modal-overlay') hideGraphqlModal();
    });
}

async function refreshFlowPicker() {
    const picker = document.getElementById('flow-picker');
    try {
        const flows = await listServerFlows();
        const selected = picker.value;
        picker.innerHTML = '<option value="">Saved flows…</option>'
            + flows.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
        picker.value = flows.some((f) => f.id === selected) ? selected : '';
    } catch (err) {
        console.error('Failed to list flows:', err);
    }
}

function createDefaultFlow() {
    const hubsId = createNode('hubs', 80, 100);
    const projectsId = createNode('projects', 440, 100);
    state.connections.push({ from: hubsId, to: projectsId, fromPortIndex: 0, toPortIndex: 0 });
    updateConnections();
}

function initToolbar() {
    document.getElementById('btn-run').addEventListener('click', runFlow);
    document.getElementById('btn-arrange').addEventListener('click', autoArrangeNodes);
    document.getElementById('btn-clear').addEventListener('click', () => {
        clearCanvas();
        createDefaultFlow();
        resetPan();
    });
    document.getElementById('btn-export').addEventListener('click', exportFlow);

    document.getElementById('btn-save').addEventListener('click', async () => {
        const name = window.prompt('Flow name', 'Untitled flow');
        if (name === null) return;
        try {
            const record = await saveFlowToServer(name, currentFlowId);
            currentFlowId = record.id;
            showToast('Flow saved');
            await refreshFlowPicker();
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
    });

    document.getElementById('flow-picker').addEventListener('change', async (e) => {
        const flowId = e.target.value;
        if (!flowId) return;
        try {
            const record = await loadFlowFromServer(flowId);
            currentFlowId = record.id;
        } catch (err) {
            showToast(`Error: ${err.message}`);
        }
    });
}

function initContextMenu() {
    document.getElementById('ctx-duplicate').addEventListener('click', duplicateNode);
    document.getElementById('ctx-delete').addEventListener('click', deleteSelected);
}

function init() {
    initPaletteDragDrop();
    initGlobalEvents();
    initToolbar();
    initContextMenu();
    initGraphqlModal();
    initCanvasPan();
    refreshFlowPicker();

    createDefaultFlow();

    deselectAll();
}

// A module script executes after the document has been parsed, so the DOM
// (including the #node-types-data blob and toolbar elements) is ready here.
init();
