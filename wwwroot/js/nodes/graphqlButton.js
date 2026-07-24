// Shared "Get the GraphQL query" button - replaces the plain in/out port
// labels on nodes backed directly by a Data Exchange GraphQL query (Hubs,
// Projects, Folders, Items, Exchanges). Clicking it shows that node type's
// graphql_query_text (backend/nodes/*.py) in a popup.
import { showGraphqlModal } from '../core/ui.js';

export function renderGraphqlButtonRow(nodeType) {
    return `
        <div class="node-row node-graphql-row">
            <button class="node-graphql-btn" data-node-type="${nodeType}" title="Show the GraphQL query this node runs">
                Get the GraphQL query
            </button>
        </div>
    `;
}

export function bindGraphqlButton(node) {
    const btn = node.querySelector('.node-graphql-btn');
    if (!btn) return;

    btn.addEventListener('mousedown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showGraphqlModal(btn.dataset.nodeType);
    });
}
