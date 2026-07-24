import { autoArrangeNodes } from '../core/arrange.js';
import { escapeHtml } from './selectableTable.js';
import { renderGraphqlButtonRow, bindGraphqlButton } from './graphqlButton.js';

export const key = 'process';

export const COLUMNS = ['Exchange Name', 'Element ID', 'Category', 'Element Name', 'Type', 'Key Property', 'Value'];
// Row keys line up 1:1 with COLUMNS above - see
// backend/routes/dx_routes.py's _rows_from_elements for how each one is
// derived from the FilterUsingComplexQuery element/property shape. Adding/
// reordering an entry here (and in dx_routes.py) is all CSV/Excel export
// needs too - tableExport.js builds its own columns from these at import time.
export const ROW_FIELDS = ['exchangeName', 'elementId', 'category', 'elementName', 'type', 'keyProperty', 'value'];

// Canned RSQL fragments covering the APS "Advanced Filtering" tutorial
// series (category equality, comparisons, and/or combination, set
// membership) - picking one seeds or extends the filter textbox rather
// than replacing it outright, so building up a compound filter is just
// "insert, then edit the placeholder values" instead of memorizing syntax.
const FILTER_PRESETS = [
    { label: 'Category equals…', snippet: 'property.name.category==Walls' },
    { label: 'Property comparison (>, <, ==)…', snippet: 'property.name.Area>10.0' },
    { label: 'Combine two conditions with AND…', snippet: 'property.name.category==Walls and property.name.Area>10.0' },
    { label: 'Combine two conditions with OR…', snippet: 'property.name.category==Walls or property.name.category==Windows' },
    { label: 'Match a list of values (=in=)…', snippet: "metadata.id=in=('ID_1', 'ID_2')" },
];

export function createFields(nodeData, options, nodeMeta) {
    nodeData.rows = [];
    nodeData.filterQuery = options.filterQuery ?? nodeMeta.default_fields.filterQuery;
}

export function renderBody(id, nodeData) {
    return `
        <div class="node-field">
            <label class="node-field-label">Filter</label>
            <input
                type="text"
                class="node-title-input"
                id="${id}-filter-input"
                data-node="${id}"
                value="${escapeHtml(nodeData.filterQuery)}"
                placeholder="e.g. property.name.category==Walls"
            />
            <select class="node-filter-preset" id="${id}-filter-preset" data-node="${id}">
                <option value="">Insert preset…</option>
                ${FILTER_PRESETS.map((p) => `<option value="${escapeHtml(p.snippet)}">${escapeHtml(p.label)}</option>`).join('')}
            </select>
            <div class="node-field-hint">Names/values with spaces need quotes: 'property.name.Element Name'=='Some Value'</div>
        </div>
        <div class="node-table-wrap">
            <table class="node-data-table">
                <thead>
                    <tr>${COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr>
                </thead>
                <tbody id="${id}-rows">
                    <tr><td class="node-table-empty" colspan="${COLUMNS.length}">Connect an Exchanges node and run the flow</td></tr>
                </tbody>
            </table>
        </div>
        ${renderGraphqlButtonRow('process')}
    `;
}

export function renderPorts(id) {
    return `
        <div class="port port-input" data-port="input" data-port-index="0" data-node="${id}"></div>
        <div class="port port-output" data-port="output" data-port-index="0" data-node="${id}"></div>
    `;
}

export function attachEvents(node, id, nodeData) {
    const filterInput = node.querySelector(`#${id}-filter-input`);
    if (filterInput) {
        filterInput.addEventListener('mousedown', (e) => e.stopPropagation());
        filterInput.addEventListener('input', (e) => {
            nodeData.filterQuery = e.target.value;
        });
    }

    const presetSelect = node.querySelector(`#${id}-filter-preset`);
    if (presetSelect && filterInput) {
        presetSelect.addEventListener('mousedown', (e) => e.stopPropagation());
        presetSelect.addEventListener('change', (e) => {
            const snippet = e.target.value;
            if (!snippet) return;

            const existing = filterInput.value.trim();
            filterInput.value = existing ? `${existing} and (${snippet})` : snippet;
            nodeData.filterQuery = filterInput.value;

            e.target.value = '';
            filterInput.focus();
        });
    }

    bindGraphqlButton(node);
}

export function serialize(nodeData) {
    return { filterQuery: nodeData.filterQuery };
}

function renderRows(id, rows) {
    const tbody = document.getElementById(`${id}-rows`);
    if (!tbody) return;

    if (!rows.length) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="${COLUMNS.length}">No elements found</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map((row) => `
        <tr>
            ${ROW_FIELDS.map((field) => `<td>${escapeHtml(row[field] ?? '')}</td>`).join('')}
        </tr>
    `).join('');
}

function renderError(id, message) {
    const tbody = document.getElementById(`${id}-rows`);
    if (tbody) {
        tbody.innerHTML = `<tr><td class="node-table-empty" colspan="${COLUMNS.length}">Error: ${escapeHtml(message)}</td></tr>`;
    }
}

// `exchanges` is the combined output of every Exchanges node connected to
// this node's single input port - core/run.js aggregates multiple
// connections into one array (same idea as Filter's port). One
// FilterUsingComplexQuery call per exchange id runs server-side, narrowed
// by `nodeData.filterQuery` (an RSQL string, empty means no filter); the
// backend flattens each into rows and hands back a single combined table.
export async function execute(id, nodeData, exchanges) {
    if (!exchanges?.length) {
        nodeData.rows = [];
        renderError(id, 'No exchanges connected — check boxes on an Exchanges node first');
        return nodeData.rows;
    }

    try {
        const response = await fetch('/api/dx/exchange-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                exchanges: (exchanges || []).map((exchange) => ({ id: exchange.id, region: exchange.region, name: exchange.name })),
                filter: nodeData.filterQuery,
            }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${response.status})`);
        }
        nodeData.rows = await response.json();

        renderRows(id, nodeData.rows);
        autoArrangeNodes();
    } catch (err) {
        nodeData.rows = [];
        renderError(id, err.message);
    }

    return nodeData.rows;
}
