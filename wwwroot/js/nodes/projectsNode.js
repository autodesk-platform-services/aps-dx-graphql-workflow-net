import { autoArrangeNodes } from '../core/arrange.js';
import { escapeHtml } from './selectableTable.js';
import { renderGraphqlButtonRow, bindGraphqlButton } from './graphqlButton.js';

export const key = 'projects';

export function createFields(nodeData, options) {
    nodeData.projects = [];
    // Nothing selected by default - the user opts in to which projects feed downstream.
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
                    </tr>
                </thead>
                <tbody id="${id}-project-rows">
                    <tr><td class="node-table-empty" colspan="2">Connect a Hubs node and run the flow</td></tr>
                </tbody>
            </table>
        </div>
        ${renderGraphqlButtonRow('projects')}
    `;
}

export function renderPorts(id) {
    return `
        <div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>
        <div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>
    `;
}

export function attachEvents(node, id, nodeData) {
    // Stop checkbox clicks from bubbling to the node and starting a drag.
    const wrap = node.querySelector('.node-table-wrap');
    wrap.addEventListener('mousedown', (e) => {
        if (e.target.matches('input[type="checkbox"]')) e.stopPropagation();
    });

    node.addEventListener('change', (e) => {
        if (e.target.classList.contains('node-row-check')) {
            const projectId = e.target.dataset.itemId;
            if (e.target.checked) nodeData.selectedIds.add(projectId);
            else nodeData.selectedIds.delete(projectId);
        }
    });

    bindGraphqlButton(node);
}

export function serialize(nodeData) {
    return { selectedIds: Array.from(nodeData.selectedIds) };
}

function renderRows(id, nodeData) {
    const tbody = document.getElementById(`${id}-project-rows`);
    if (!tbody) return;

    const { projects, selectedIds } = nodeData;

    if (!projects.length) {
        tbody.innerHTML = '<tr><td class="node-table-empty" colspan="2">No projects found</td></tr>';
        return;
    }

    tbody.innerHTML = projects.map((project) => `
        <tr>
            <td class="node-table-check-col">
                <input
                    type="checkbox"
                    class="node-row-check"
                    data-item-id="${escapeHtml(project.id)}"
                    data-node="${id}"
                    ${selectedIds.has(project.id) ? 'checked' : ''}
                />
            </td>
            <td>${escapeHtml(project.name)}</td>
        </tr>
    `).join('');
}

function renderError(id, message) {
    const tbody = document.getElementById(`${id}-project-rows`);
    if (tbody) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="2">Error: ${escapeHtml(message)}</td></tr>`;
    }
}

// Called from core/run.js during Run, once this node's single input (the
// array of selected hubs from an upstream Hubs node) is available. Queries
// GetProjects for every hub server-side (backend/routes/dx_routes.py) and
// aggregates the results into this node's table.
export async function execute(id, nodeData, hubs) {
    try {
        const response = await fetch('/api/dx/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hubs: hubs.map((hub) => ({ id: hub.id, region: hub.region })),
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        const projects = await response.json();
        nodeData.projects = projects;

        renderRows(id, nodeData);
        // The table just changed size significantly - keep neighbors from overlapping.
        autoArrangeNodes();
    } catch (err) {
        nodeData.projects = [];
        renderError(id, err.message);
    }

    return nodeData.projects.filter((project) => nodeData.selectedIds.has(project.id));
}
