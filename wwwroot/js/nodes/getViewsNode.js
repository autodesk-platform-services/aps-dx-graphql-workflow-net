// Unlike Folders/Items/Exchanges, this node doesn't share
// selectableProjectFedTable.js - it needs its own embedded Viewer (see
// templateNode.js/viewerSdk.js) plus click-a-row-to-preview behavior that
// module doesn't (and shouldn't, for those other node types) support.
import { autoArrangeNodes } from '../core/arrange.js';
import { escapeHtml } from './selectableTable.js';
import { ensureViewerReady, createViewer, loadView } from './viewerSdk.js';

export const key = 'get_views';

export function createFields(nodeData, options) {
    nodeData.views = [];
    nodeData.selectedIds = new Set(options.selectedIds || []);
    nodeData.viewer = null;
    nodeData.pendingView = null;
    nodeData.activeViewId = null;
}

export function renderBody(id) {
    return `
        <div class="node-viewer-container" id="${id}-viewer">Loading viewer…</div>
        <div class="node-table-wrap">
            <table class="node-data-table">
                <thead>
                    <tr>
                        <th class="node-table-check-col"></th>
                        <th>Name</th>
                    </tr>
                </thead>
                <tbody id="${id}-rows">
                    <tr><td class="node-table-empty" colspan="2">Connect an Items node and run the flow</td></tr>
                </tbody>
            </table>
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
    const container = node.querySelector(`#${id}-viewer`);

    // Stop checkbox clicks from bubbling to the node and starting a drag.
    const wrap = node.querySelector('.node-table-wrap');
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.matches('input[type="checkbox"]')) e.stopPropagation();
    });

    node.addEventListener('change', (e) => {
        if (e.target.classList.contains('node-row-check')) {
            const viewId = e.target.dataset.itemId;
            if (e.target.checked) nodeData.selectedIds.add(viewId);
            else nodeData.selectedIds.delete(viewId);
        }
    });

    // Clicking a row (but not its checkbox) previews that view - independent
    // of the checkbox, which is only about this node's own output selection.
    node.addEventListener('click', (e) => {
        if (e.target.matches('input[type="checkbox"]')) return;
        const row = e.target.closest('tr[data-view-id]');
        if (!row) return;
        const view = nodeData.views.find((v) => v.id === row.dataset.viewId);
        if (view) displayView(id, nodeData, view);
    });

    ensureViewerReady()
        .then(() => {
            container.textContent = '';
            nodeData.viewer = createViewer(container);
            if (nodeData.pendingView) {
                loadView(nodeData.viewer, nodeData.pendingView.derivative_urn, nodeData.pendingView.id, (msg) => showViewerError(id, msg));
                nodeData.pendingView = null;
            }
        })
        .catch((err) => {
            console.error('Failed to initialize Autodesk Viewer:', err);
            showViewerError(id, 'Failed to load Autodesk Viewer');
        });
}

export function serialize(nodeData) {
    return { selectedIds: Array.from(nodeData.selectedIds) };
}

function showViewerError(id, message) {
    const container = document.getElementById(`${id}-viewer`);
    if (container) container.textContent = `Error: ${message}`;
}

function highlightActiveRow(id, nodeData) {
    const tbody = document.getElementById(`${id}-rows`);
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-view-id]').forEach((tr) => {
        tr.classList.toggle('active-view', tr.dataset.viewId === nodeData.activeViewId);
    });
}

function displayView(id, nodeData, view) {
    nodeData.activeViewId = view.id;
    highlightActiveRow(id, nodeData);

    if (!view.derivative_urn) return;
    if (nodeData.viewer) {
        loadView(nodeData.viewer, view.derivative_urn, view.id, (msg) => showViewerError(id, msg));
    } else {
        nodeData.pendingView = view;
    }
}

function renderRows(id, nodeData) {
    const tbody = document.getElementById(`${id}-rows`);
    if (!tbody) return;

    const { views, selectedIds, activeViewId } = nodeData;

    if (!views.length) {
        tbody.innerHTML = '<tr><td class="node-table-empty" colspan="2">No views found</td></tr>';
        return;
    }

    tbody.innerHTML = views.map((view) => `
        <tr data-view-id="${escapeHtml(view.id)}" class="${view.id === activeViewId ? 'active-view' : ''}">
            <td class="node-table-check-col">
                <input
                    type="checkbox"
                    class="node-row-check"
                    data-item-id="${escapeHtml(view.id)}"
                    data-node="${id}"
                    ${selectedIds.has(view.id) ? 'checked' : ''}
                />
            </td>
            <td>${escapeHtml(view.name)}</td>
        </tr>
    `).join('');
}

function renderError(id, message) {
    const tbody = document.getElementById(`${id}-rows`);
    if (tbody) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="2">Error: ${escapeHtml(message)}</td></tr>`;
    }
}

export async function execute(id, nodeData, items) {
    try {
        const response = await fetch('/api/dx/views', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projects: items.map((item) => ({ id: item.id, region: item.region, kind: item.kind })),
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        nodeData.views = await response.json();

        renderRows(id, nodeData);
        autoArrangeNodes();
    } catch (err) {
        nodeData.views = [];
        renderError(id, err.message);
    }

    return nodeData.views.filter((view) => nodeData.selectedIds.has(view.id));
}
