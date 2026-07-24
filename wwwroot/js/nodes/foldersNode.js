import {
    createSelectableFields,
    renderSelectableTableBody,
    renderInputOutputPorts,
    bindSelectableTableEvents,
    serializeSelectable,
    executeSelectableProjectFedTable,
} from './selectableProjectFedTable.js';

export const key = 'folders';

export function createFields(nodeData, options) {
    createSelectableFields(nodeData, options);
}

export function renderBody(id) {
    return renderSelectableTableBody(id, 'Connect a Projects or Folders node and run the flow', 'folders');
}

export function renderPorts(id) {
    return renderInputOutputPorts(id);
}

export function attachEvents(node, id, nodeData) {
    bindSelectableTableEvents(node, id, nodeData);
}

export function serialize(nodeData) {
    return serializeSelectable(nodeData);
}

export function execute(id, nodeData, projects, options = {}) {
    return executeSelectableProjectFedTable(id, nodeData, projects, {
        endpoint: '/api/dx/folders',
        emptyMessage: 'No folders found',
        skipFetch: options.skipFetch,
    });
}
