export const canvas = document.getElementById('canvas');
export const canvasContainer = canvas.parentElement;
export const connectionsLayer = document.getElementById('connections-layer');
export const contextMenu = document.getElementById('context-menu');

function loadNodeTypes() {
    const el = document.getElementById('node-types-data');
    return el ? JSON.parse(el.textContent) : {};
}

// Canonical node type metadata (icon, name, accent, ports, default fields),
// injected by the server from backend/nodes/ - the single source of truth.
export const NODE_TYPES = loadNodeTypes();
