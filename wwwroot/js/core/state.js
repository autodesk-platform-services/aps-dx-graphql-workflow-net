export const state = {
    nodes: new Map(),
    connections: [],
    selectedNode: null,
    connecting: null,
    dragOffset: { x: 0, y: 0 },
    nodeCounter: 0,
    // Canvas pan offset, in pixels. Node x/y stay in unpanned canvas-local
    // coordinates; panning just translates the whole #canvas element, so
    // nothing else needs to account for this directly (see core/pan.js).
    pan: { x: 0, y: 0 },
};
