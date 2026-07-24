import {
    createSelectableFields,
    renderSelectableTableBody,
    renderInputOutputPorts,
    bindSelectableTableEvents,
    serializeSelectable,
    executeSelectableProjectFedTable,
} from './selectableProjectFedTable.js';
import { formatDateOnly } from './selectableTable.js';

export const key = 'items';

// Only BasicItem (the sole type implementing the Item interface) exposes
// tipVersion - see GET_FOLDER_ITEMS_QUERY's `... on BasicItem` fragment.
export const COLUMNS = [
    { label: 'Version', getValue: (item) => item.tipVersion?.versionNumber },
    { label: 'Created', getValue: (item) => formatDateOnly(item.tipVersion?.createdOn) },
];

export function createFields(nodeData, options) {
    createSelectableFields(nodeData, options);
}

export function renderBody(id) {
    return renderSelectableTableBody(id, 'Connect a Projects or Folders node and run the flow', 'items', COLUMNS);
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
        endpoint: '/api/dx/items',
        emptyMessage: 'No items found',
        columns: COLUMNS,
        skipFetch: options.skipFetch,
    });
}
