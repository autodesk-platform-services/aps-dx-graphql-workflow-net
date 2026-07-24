import { ensureViewerReady, createViewer, loadModel, extractEmbeddedUrn } from './viewerSdk.js';

export const key = 'data';

export function createFields(nodeData) {
    nodeData.viewer = null;
    nodeData.pendingUrn = null;
    nodeData.elements = [];
    nodeData.selectedElementId = null;
}

export function renderBody(id) {
    return `
        <div class="node-viewer-container" id="${id}-viewer">Loading viewer…</div>
        <select class="node-viewer-select" id="${id}-viewer-select"></select>
        <div class="node-row">
            <span class="port-label">in</span>
            <span></span>
        </div>
    `;
}

export function renderPorts(id) {
    return `<div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>`;
}

export function attachEvents(node, id, nodeData) {
    const container = node.querySelector(`#${id}-viewer`);
    const select = node.querySelector(`#${id}-viewer-select`);

    select.addEventListener('change', () => {
        nodeData.selectedElementId = select.value;
        const element = nodeData.elements.find((el) => el.id === select.value);
        if (element) loadElement(id, nodeData, element);
    });
    select.addEventListener('mousedown', (e) => e.stopPropagation());

    ensureViewerReady()
        .then(() => {
            container.textContent = '';
            nodeData.viewer = createViewer(container);
            if (nodeData.pendingUrn) {
                loadModel(nodeData.viewer, nodeData.pendingUrn, (msg) => showViewerError(id, msg));
                nodeData.pendingUrn = null;
            }
        })
        .catch((err) => {
            console.error('Failed to initialize Autodesk Viewer:', err);
            showViewerError(id, 'Failed to load Autodesk Viewer');
        });
}

export function serialize() {
    return {};
}

function showViewerError(id, message) {
    const container = document.getElementById(`${id}-viewer`);
    if (container) container.textContent = `Error: ${message}`;
}

function elementLabel(element) {
    return element.name || element.id;
}

// Rebuilds the <select> options from nodeData.elements. Hidden entirely when
// there's zero or one element - nothing to choose between.
function updateSelectOptions(id, nodeData) {
    const select = document.getElementById(`${id}-viewer-select`);
    if (!select) return;

    select.innerHTML = nodeData.elements
        .map((el) => `<option value="${el.id}">${elementLabel(el)}</option>`)
        .join('');
    select.value = nodeData.selectedElementId || '';
    select.style.display = nodeData.elements.length > 1 ? '' : 'none';
}

// Exchanges carry alternativeIdentifiers.fileVersionUrn (the specific
// version Model Derivative actually has a manifest for) directly as a plain
// urn string - but it's nullable, and is null whenever that exchange's tip
// version hasn't been derived/translated yet. version.id (a base64 composite
// string, like an item's tipVersion.id - see extractEmbeddedUrn) is the
// fallback for that case. Items have neither alternativeIdentifiers field -
// their only source is tipVersion.id.
//
// Deliberately NOT in this list: alternativeIdentifiers.fileUrn and the
// element's own id. Both only ever resolve to a version-less *lineage* urn,
// which Model Derivative has no manifest for - feeding one into
// Document.load doesn't cleanly fail through the onError callback, it
// crashes the Viewer SDK internally (an uncaught "Cannot read properties of
// null (reading 'toLowerCase')"). Better to show a clear error here than to
// hand the SDK a urn already known to be unloadable.
function loadElement(id, nodeData, element) {
    const ids = element.alternativeIdentifiers || {};
    const fileUrn = ids.fileVersionUrn
        || extractEmbeddedUrn(element.version?.id)
        || extractEmbeddedUrn(element.tipVersion?.id);
    if (!fileUrn) {
        showViewerError(id, 'No viewable model version found for this element');
        return;
    }

    if (nodeData.viewer) {
        loadModel(nodeData.viewer, fileUrn, (msg) => showViewerError(id, msg));
    } else {
        nodeData.pendingUrn = fileUrn;
    }
}

// Called from core/run.js once every node connected to this node's input
// port is ready - `elements` is the combined, flattened list from all of
// them (this node's input port accepts more than one Exchanges/Items
// connection at once). Only one element is shown at a time - if more than
// one came in, a dropdown lets the user pick which; the previous selection
// is kept across reruns as long as that same element is still present.
export function execute(id, nodeData, elements) {
    nodeData.elements = elements || [];

    const stillPresent = nodeData.elements.some((el) => el.id === nodeData.selectedElementId);
    if (!stillPresent) {
        nodeData.selectedElementId = nodeData.elements[0]?.id ?? null;
    }

    updateSelectOptions(id, nodeData);

    const selected = nodeData.elements.find((el) => el.id === nodeData.selectedElementId);
    if (selected) loadElement(id, nodeData, selected);
}
