import { state } from './state.js';
import { NODE_HANDLERS } from '../nodes/registry.js';
import { createNodeWithId, deselectAll } from './canvas.js';
import { updateConnections } from './connections.js';
import { showToast } from './ui.js';

export function serializeFlow() {
    return {
        nodes: Array.from(state.nodes.values()).map((n) => {
            const handler = NODE_HANDLERS[n.type];
            return { id: n.id, type: n.type, x: n.x, y: n.y, ...handler.serialize(n) };
        }),
        connections: state.connections,
    };
}

// Generates a standalone C# script that re-runs this flow headlessly (see
// Services/FlowCodegenService.cs) and downloads it.
export async function exportFlow() {
    const flow = serializeFlow();

    try {
        const response = await fetch('/api/flows/export-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flow }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }

        const disposition = response.headers.get('Content-Disposition') || '';
        const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || 'flow.cs';

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('C# script exported');
    } catch (err) {
        showToast(`Error: ${err.message}`);
        console.error('Failed to export flow script:', err);
    }
}

export function loadFlow(flow) {
    if (!flow || !Array.isArray(flow.nodes) || !Array.isArray(flow.connections)) {
        showToast('Error: Invalid flow format');
        return;
    }

    state.nodes.forEach((node) => node.element.remove());
    state.nodes.clear();
    state.connections = [];
    state.selectedNode = null;

    let maxId = 0;
    flow.nodes.forEach((n) => {
        const match = n.id.match(/node-(\d+)/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxId) maxId = num;
        }
    });
    state.nodeCounter = maxId;

    const idMapping = new Map();
    flow.nodes.forEach((n) => {
        const { id, type, x, y, ...options } = n;
        const newId = createNodeWithId(type, x, y, id, options);
        idMapping.set(id, newId);
    });

    flow.connections.forEach((conn) => {
        state.connections.push({
            from: idMapping.get(conn.from) || conn.from,
            to: idMapping.get(conn.to) || conn.to,
            fromPortIndex: conn.fromPortIndex || 0,
            toPortIndex: conn.toPortIndex || 0,
        });
    });

    updateConnections();
    deselectAll();
    showToast('Flow loaded');
}

// --- Server persistence (data/flows/*.json via the Flask API) ---

async function apiRequest(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return response.status === 204 ? null : response.json();
}

export function listServerFlows() {
    return apiRequest('/api/flows');
}

export function saveFlowToServer(name, flowId) {
    const flow = serializeFlow();
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ name, flow });

    if (flowId) {
        return apiRequest(`/api/flows/${flowId}`, { method: 'PUT', headers, body });
    }
    return apiRequest('/api/flows', { method: 'POST', headers, body });
}

export async function loadFlowFromServer(flowId) {
    const record = await apiRequest(`/api/flows/${flowId}`);
    loadFlow(record.flow);
    return record;
}
