import { state } from './state.js';
import { startConnection, endConnection } from './connections.js';

export function bindPortEvents(port) {
    port.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startConnection(port);
    });

    port.addEventListener('mouseup', (e) => {
        e.stopPropagation();
        endConnection(port);
    });

    port.addEventListener('mouseenter', () => {
        if (state.connecting) port.classList.add('connecting');
    });

    port.addEventListener('mouseleave', () => port.classList.remove('connecting'));
}

export function bindAllPorts(root) {
    root.querySelectorAll('.port').forEach(bindPortEvents);
}
