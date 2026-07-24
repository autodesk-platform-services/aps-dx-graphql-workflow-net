import { state } from './state.js';
import { updateConnections } from './connections.js';
import { showToast } from './ui.js';

export function autoArrangeNodes() {
    if (state.nodes.size === 0) {
        showToast('No nodes to arrange');
        return;
    }

    const config = {
        startX: 60,
        startY: 60,
        horizontalGap: 80,
        verticalGap: 40,
    };

    const outgoing = new Map();
    const incoming = new Map();

    state.nodes.forEach((_, nodeId) => {
        outgoing.set(nodeId, []);
        incoming.set(nodeId, []);
    });

    state.connections.forEach((conn) => {
        outgoing.get(conn.from).push(conn.to);
        incoming.get(conn.to).push(conn.from);
    });

    const depth = new Map();
    const queue = [];

    state.nodes.forEach((nodeData, nodeId) => {
        if (incoming.get(nodeId).length === 0) {
            depth.set(nodeId, 0);
            queue.push(nodeId);
        }
    });

    if (queue.length === 0) {
        state.nodes.forEach((nodeData, nodeId) => {
            if (nodeData.type === 'hubs') {
                depth.set(nodeId, 0);
                queue.push(nodeId);
            }
        });
    }

    if (queue.length === 0 && state.nodes.size > 0) {
        const firstNode = state.nodes.keys().next().value;
        depth.set(firstNode, 0);
        queue.push(firstNode);
    }

    while (queue.length > 0) {
        const current = queue.shift();
        const currentDepth = depth.get(current);

        outgoing.get(current).forEach((neighbor) => {
            if (!depth.has(neighbor) || depth.get(neighbor) < currentDepth + 1) {
                depth.set(neighbor, currentDepth + 1);
                queue.push(neighbor);
            }
        });
    }

    state.nodes.forEach((_, nodeId) => {
        if (!depth.has(nodeId)) depth.set(nodeId, 0);
    });

    const layers = new Map();
    depth.forEach((d, nodeId) => {
        if (!layers.has(d)) layers.set(d, []);
        layers.get(d).push(nodeId);
    });

    const sortedDepths = Array.from(layers.keys()).sort((a, b) => a - b);

    // Measure every node's actual rendered size up front (a single batch of
    // reads) so spacing reflects real dimensions - nodes vary a lot in size
    // (a Hubs table, an expanded Function body, a resized Output box), and a
    // fixed grid stride packs them too tightly and they end up overlapping.
    const sizeOf = new Map();
    state.nodes.forEach((nodeData, nodeId) => {
        const rect = nodeData.element.getBoundingClientRect();
        sizeOf.set(nodeId, { width: rect.width, height: rect.height });
    });

    let currentX = config.startX;

    sortedDepths.forEach((d) => {
        const nodesInLayer = layers.get(d);
        nodesInLayer.sort((a, b) => state.nodes.get(a).y - state.nodes.get(b).y);

        let currentY = config.startY;
        let layerWidth = 0;

        nodesInLayer.forEach((nodeId) => {
            const nodeData = state.nodes.get(nodeId);
            const { width, height } = sizeOf.get(nodeId);

            nodeData.x = currentX;
            nodeData.y = currentY;
            nodeData.element.style.left = `${currentX}px`;
            nodeData.element.style.top = `${currentY}px`;

            currentY += height + config.verticalGap;
            layerWidth = Math.max(layerWidth, width);
        });

        currentX += layerWidth + config.horizontalGap;
    });

    updateConnections();
    showToast('Nodes arranged');
}
