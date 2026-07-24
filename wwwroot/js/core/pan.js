import { canvas, canvasContainer } from './dom.js';
import { state } from './state.js';

// #canvas holds every node + the SVG connections layer as direct children,
// so translating it moves both together as one rigid block - node x/y and
// the connection paths (drawn relative to canvas's own bounding rect) stay
// internally consistent with no other code needing to know about pan at all.
function applyPan() {
    canvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px)`;
    // The dotted grid lives on the (non-transformed) container; scrolling its
    // background-position along with the pan keeps the grid under the nodes,
    // instead of the canvas's edge becoming visible after panning far enough.
    canvasContainer.style.backgroundPosition = `${state.pan.x - 1}px ${state.pan.y - 1}px`;
}

export function panBy(dx, dy) {
    state.pan.x += dx;
    state.pan.y += dy;
    applyPan();
}

export function resetPan() {
    state.pan.x = 0;
    state.pan.y = 0;
    applyPan();
}

export function initCanvasPan() {
    // Listens on canvasContainer, not canvas - canvas is a fixed-size box
    // (100% of the container) that this file slides around with a CSS
    // transform, so once panned further than canvas's own width/height,
    // part of the visible container is no longer covered by canvas at all.
    // A mousedown there would never reach a listener on canvas, since
    // canvas isn't an ancestor of that click. canvasContainer always covers
    // the full viewport regardless of pan, so it's the one that needs to
    // start the gesture.
    canvasContainer.addEventListener('mousedown', (e) => {
        // Only start a pan when grabbing empty canvas background - not a
        // node, a port, or a connection line.
        if (e.target !== canvas && e.target !== canvasContainer && !e.target.classList.contains('connections-layer')) return;

        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startPan = { ...state.pan };
        canvasContainer.classList.add('panning');

        const onMouseMove = (moveEvent) => {
            state.pan.x = startPan.x + (moveEvent.clientX - startX);
            state.pan.y = startPan.y + (moveEvent.clientY - startY);
            applyPan();
        };

        const onMouseUp = () => {
            canvasContainer.classList.remove('panning');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    // Wheel/trackpad scroll pans directly - deltaX for horizontal, deltaY
    // for vertical, matching standard scrollable-canvas conventions. But if
    // the wheel is over something that scrolls on its own (a node's table,
    // its output display, a code textarea), let that scroll normally -
    // preventDefault() here would otherwise suppress it too, since this
    // listener's ancestor runs before the browser's native scroll happens.
    canvasContainer.addEventListener('wheel', (e) => {
        if (hasScrollableAncestor(e.target)) return;
        e.preventDefault();
        panBy(-e.deltaX, -e.deltaY);
    }, { passive: false });
}

function hasScrollableAncestor(target) {
    let el = target;
    while (el && el !== canvas) {
        const style = getComputedStyle(el);
        const scrollsY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && el.scrollHeight > el.clientHeight;
        const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth;
        if (scrollsY || scrollsX) return true;
        el = el.parentElement;
    }
    return false;
}
