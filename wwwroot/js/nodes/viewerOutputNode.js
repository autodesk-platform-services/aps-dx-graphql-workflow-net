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

function isExchange(element) {
    return element.alternativeIdentifiers !== undefined;
}

// Exchanges: only alternativeIdentifiers.fileVersionUrn is valid for the
// Viewer — it is null until Model Derivative has translated that version.
// Falling back to version.id produces a wip/version urn with no manifest (404).
// Items: use tipVersion.id (composite id with embedded lineage/version urn).
function resolveViewableUrn(element) {
    if (isExchange(element)) {
        return element.alternativeIdentifiers?.fileVersionUrn || null;
    }
    return extractEmbeddedUrn(element.tipVersion?.id);
}

function isViewable(element) {
    return Boolean(resolveViewableUrn(element));
}

function elementLabel(element) {
    const name = element.name || element.id;
    if (isExchange(element) && !element.alternativeIdentifiers?.fileVersionUrn) {
        return `${name} (not translated)`;
    }
    return name;
}

function exchangeNotTranslatedMessage(element) {
    const name = element.name || element.id;
    return `Exchange "${name}" is not translated yet — fileVersionUrn is missing. Publish or wait for translation, then rerun the flow.`;
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

function loadElement(id, nodeData, element) {
    const fileUrn = resolveViewableUrn(element);
    if (!fileUrn) {
        showViewerError(
            id,
            isExchange(element)
                ? exchangeNotTranslatedMessage(element)
                : 'No viewable model version found for this element',
        );
        return;
    }

    if (nodeData.viewer) {
        loadModel(nodeData.viewer, fileUrn, (msg) => showViewerError(id, msg));
    } else {
        nodeData.pendingUrn = fileUrn;
    }
}

function preferViewableSelection(nodeData) {
    const selected = nodeData.elements.find((el) => el.id === nodeData.selectedElementId);
    if (selected && isViewable(selected)) {
        return selected;
    }

    return nodeData.elements.find(isViewable) || selected || null;
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

    const selected = preferViewableSelection(nodeData);
    if (selected) {
        nodeData.selectedElementId = selected.id;
    }

    updateSelectOptions(id, nodeData);

    if (selected) loadElement(id, nodeData, selected);
}
