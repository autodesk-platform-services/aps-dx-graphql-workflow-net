import { contextMenu, NODE_TYPES } from './dom.js';

export function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

export function showContextMenu(x, y) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('show');
}

export function hideContextMenu() {
    contextMenu.classList.remove('show');
}

export function showGraphqlModal(nodeType) {
    const meta = NODE_TYPES[nodeType];

    document.getElementById('graphql-modal-title').textContent = `${meta?.name || nodeType} - GraphQL Query`;
    document.getElementById('graphql-modal-body').textContent
        = meta?.graphql_query_text || 'This node has no associated GraphQL query.';
    document.getElementById('graphql-modal-overlay').classList.add('show');
}

export function hideGraphqlModal() {
    document.getElementById('graphql-modal-overlay').classList.remove('show');
}
