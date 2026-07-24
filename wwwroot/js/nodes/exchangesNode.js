import {
    createSelectableFields,
    renderSelectableTableBody,
    renderInputOutputPorts,
    bindSelectableTableEvents,
    serializeSelectable,
    executeSelectableProjectFedTable,
} from './selectableProjectFedTable.js';
import { formatDateOnly } from './selectableTable.js';

export const key = 'exchanges';

export const COLUMNS = [
    { label: 'Version', getValue: (item) => item.version?.versionNumber },
    { label: 'Created', getValue: (item) => formatDateOnly(item.version?.createdOn) },
];

export function createFields(nodeData, options) {
    createSelectableFields(nodeData, options);
}

export function renderBody(id) {
    return renderSelectableTableBody(id, 'Connect a Projects or Folders node and run the flow', 'exchanges', COLUMNS);
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
        endpoint: '/api/dx/exchanges',
        emptyMessage: 'No exchanges found',
        columns: COLUMNS,
        skipFetch: options.skipFetch,
    });
}
