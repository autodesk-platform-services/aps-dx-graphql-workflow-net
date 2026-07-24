import {
    createFields,
    renderBody as renderExportBody,
    renderPorts,
    attachEvents,
    serialize,
    makeExecute,
} from './tableExport.js';

export const key = 'excel_output';

export { createFields, renderPorts, attachEvents, serialize };

export function renderBody(id, nodeData) {
    return renderExportBody(id, nodeData);
}

export const execute = makeExecute('/api/dx/export/excel', '.xlsx');
