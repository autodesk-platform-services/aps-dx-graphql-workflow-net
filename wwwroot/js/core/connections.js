import { canvas, connectionsLayer, NODE_TYPES } from './dom.js';
import { state } from './state.js';
import { showToast } from './ui.js';

export function calculateCurvePath(x1, y1, x2, y2, leftToRight) {
    const dx = Math.abs(x2 - x1);
    const controlOffset = Math.min(dx * 0.5, 100);

    if (leftToRight) {
        return `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;
    }
    return `M ${x1} ${y1} C ${x1 - controlOffset} ${y1}, ${x2 + controlOffset} ${y2}, ${x2} ${y2}`;
}

export function startConnection(port) {
    const portType = port.dataset.port;
    const nodeId = port.dataset.node;
    const portIndex = parseInt(port.dataset.portIndex) || 0;

    state.connecting = {
        sourceNode: nodeId,
        sourcePort: portType,
        sourcePortIndex: portIndex,
        element: port,
    };

    port.classList.add('connecting');

    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    preview.classList.add('connection-preview');
    preview.id = 'connection-preview';
    connectionsLayer.appendChild(preview);

    const updatePreview = (e) => {
        const rect = canvas.getBoundingClientRect();
        const portRect = port.getBoundingClientRect();

        const startX = portRect.left + portRect.width / 2 - rect.left;
        const startY = portRect.top + portRect.height / 2 - rect.top;
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        preview.setAttribute('d', calculateCurvePath(startX, startY, endX, endY, portType === 'output'));
    };

    const cancelConnection = () => {
        preview.remove();
        port.classList.remove('connecting');
        state.connecting = null;
        document.removeEventListener('mousemove', updatePreview);
        document.removeEventListener('mouseup', cancelConnection);
    };

    document.addEventListener('mousemove', updatePreview);
    document.addEventListener('mouseup', cancelConnection);
}

function cancelPendingConnection() {
    const preview = document.getElementById('connection-preview');
    if (preview) preview.remove();
    if (state.connecting) state.connecting.element.classList.remove('connecting');
    state.connecting = null;
}

export function endConnection(port) {
    if (!state.connecting) return;

    const targetNode = port.dataset.node;
    const targetPort = port.dataset.port;
    const targetPortIndex = parseInt(port.dataset.portIndex) || 0;
    const { sourceNode, sourcePort, sourcePortIndex } = state.connecting;

    if (sourceNode === targetNode) {
        showToast('Cannot connect node to itself');
        cancelPendingConnection();
        return;
    }

    if (sourcePort === targetPort) {
        showToast('Cannot connect same port types');
        cancelPendingConnection();
        return;
    }

    let fromNode, toNode, fromPortIndex, toPortIndex;
    if (sourcePort === 'output') {
        fromNode = sourceNode;
        toNode = targetNode;
        fromPortIndex = sourcePortIndex;
        toPortIndex = targetPortIndex;
    } else {
        fromNode = targetNode;
        toNode = sourceNode;
        fromPortIndex = targetPortIndex;
        toPortIndex = sourcePortIndex;
    }

    const toNodeData = state.nodes.get(toNode);
    const fromNodeData = state.nodes.get(fromNode);
    const toNodeMeta = NODE_TYPES[toNodeData?.type];
    // A node with several distinct input ports (e.g. Create Exchange) can
    // restrict each port differently via allowed_source_types_by_port;
    // ports with no entry there fall back to the node-level list.
    const allowedSourceTypes = toNodeMeta?.allowed_source_types_by_port?.[toPortIndex]
        ?? toNodeMeta?.allowed_source_types;
    if (allowedSourceTypes?.length && !allowedSourceTypes.includes(fromNodeData?.type)) {
        const allowedNames = allowedSourceTypes.map((t) => NODE_TYPES[t]?.name || t).join(' or ');
        showToast(`${NODE_TYPES[toNodeData.type]?.name} only accepts connections from ${allowedNames}`);
        cancelPendingConnection();
        return;
    }

    const exists = state.connections.some(
        (c) => c.from === fromNode && c.to === toNode
            && c.fromPortIndex === fromPortIndex && c.toPortIndex === toPortIndex,
    );

    if (exists) {
        showToast('Connection already exists');
        cancelPendingConnection();
        return;
    }

    state.connections.push({ from: fromNode, to: toNode, fromPortIndex, toPortIndex });
    updateConnections();
    cancelPendingConnection();
}

export function updateConnections() {
    connectionsLayer.querySelectorAll('.connection').forEach((el) => el.remove());

    const canvasRect = canvas.getBoundingClientRect();

    state.connections.forEach((conn, index) => {
        const fromNode = state.nodes.get(conn.from);
        const toNode = state.nodes.get(conn.to);

        if (!fromNode || !toNode) return;

        const fromPortIndex = conn.fromPortIndex || 0;
        const fromPort = fromNode.element.querySelector(`.port-output[data-port-index="${fromPortIndex}"]`);

        const toPortIndex = conn.toPortIndex || 0;
        let toPort;

        const portsContainer = toNode.element.querySelector('.ports-container.ports-input');
        if (portsContainer) {
            toPort = portsContainer.querySelector(`.port-input[data-port-index="${toPortIndex}"]`);
        } else {
            toPort = toNode.element.querySelector(`.port-input[data-port-index="${toPortIndex}"]`);
        }

        if (!fromPort || !toPort) return;

        const fromRect = fromPort.getBoundingClientRect();
        const toRect = toPort.getBoundingClientRect();

        const startX = fromRect.left + fromRect.width / 2 - canvasRect.left;
        const startY = fromRect.top + fromRect.height / 2 - canvasRect.top;
        const endX = toRect.left + toRect.width / 2 - canvasRect.left;
        const endY = toRect.top + toRect.height / 2 - canvasRect.top;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('connection');
        path.setAttribute('d', calculateCurvePath(startX, startY, endX, endY, true));
        path.dataset.index = index;

        path.addEventListener('click', () => {
            state.connections.splice(index, 1);
            updateConnections();
            showToast('Connection removed');
        });

        connectionsLayer.appendChild(path);
    });
}
