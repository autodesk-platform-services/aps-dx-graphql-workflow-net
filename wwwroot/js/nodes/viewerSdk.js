// Lazy-loads the APS (Autodesk Platform Services) Viewer SDK and runs
// Autodesk.Viewing.Initializer exactly once, no matter how many Viewer
// Output nodes request it concurrently.
//
// Loading pattern matches aps-urn-viewer-nodejs: DS_ENDPOINTS +
// AutodeskProduction2 + streamingV2 + Document.load + loadDocumentNode.

const VIEWER_SCRIPT_URL = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.js';
const VIEWER_CSS_URL = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.css';

let readyPromise = null;

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}

function loadStylesheet(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function getAccessToken(onTokenReady) {
    fetch('/api/dx/viewer-token')
        .then((response) => {
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            return response.json();
        })
        .then((data) => onTokenReady(data.access_token, data.expires_in))
        .catch((err) => console.error('Failed to fetch viewer token:', err));
}

export function ensureViewerReady() {
    if (!readyPromise) {
        readyPromise = loadScript(VIEWER_SCRIPT_URL).then(() => {
            loadStylesheet(VIEWER_CSS_URL);
            return new Promise((resolve) => {
                window.Autodesk.Viewing.FeatureFlags.set('DS_ENDPOINTS', true);
                window.Autodesk.Viewing.Initializer(
                    { env: 'AutodeskProduction2', api: 'streamingV2', getAccessToken },
                    resolve,
                );
            });
        });
    }
    return readyPromise;
}

export function createViewer(container) {
    const viewer = new window.Autodesk.Viewing.Viewer3D(container, {});
    viewer.initialize();
    return viewer;
}

// Same normalization as aps-urn-viewer-nodejs/wwwroot/viewer.js normalizeUrn().
function normalizeDocumentId(urnInput) {
    const trimmed = urnInput.trim();
    if (!trimmed) {
        throw new Error('URN is empty.');
    }

    if (trimmed.startsWith('urn:adsk.')) {
        return `urn:${window.Autodesk.Viewing.toUrlSafeBase64(trimmed)}`;
    }

    if (trimmed.startsWith('urn:')) {
        const encoded = trimmed.slice(4);
        if (!encoded) {
            throw new Error('Invalid URN.');
        }
        return trimmed;
    }

    return `urn:${trimmed}`;
}

export function extractEmbeddedUrn(compositeId) {
    if (!compositeId) return null;
    try {
        const decoded = atob(compositeId);
        const match = decoded.match(/urn:[^~]+$/);
        return match ? match[0] : null;
    } catch {
        return null;
    }
}

function debugLog(...args) {
    console.log('[viewerSdk]', ...args);
}

function fitOnFirstGeometry(viewer) {
    const timeout = setTimeout(() => {
        debugLog('GEOMETRY_LOADED_EVENT never fired within 15s — geometry may not have loaded.');
    }, 15000);
    const onGeometryLoaded = () => {
        clearTimeout(timeout);
        viewer.fitToView();
        viewer.removeEventListener(window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeometryLoaded);
    };
    viewer.addEventListener(window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeometryLoaded);
}

function describeLoadDocumentNodeError(errorCode) {
    if (errorCode === 4) {
        return 'Access denied loading model geometry (Error 4) — sign in again or check viewables:read scope';
    }
    if (errorCode === 5) {
        return 'Model geometry not found (Error 5) — the exchange version may not be translated yet';
    }
    if (errorCode === 13) {
        return 'This model\'s translated format is not supported by the viewer (Error 13)';
    }
    return `Error ${errorCode}`;
}

function describeDocumentLoadError(errorCode, errorMsg) {
    if (errorMsg) return errorMsg;
    if (errorCode === 5) {
        return 'No viewer manifest for this version — the exchange may not be translated yet (Error 5)';
    }
    if (errorCode === 4) {
        return 'Access denied loading manifest (Error 4) — sign in again or check viewables:read scope';
    }
    return `Error ${errorCode}`;
}

function loadViewable(viewer, doc, viewable, onError) {
    debugLog('loadViewable()', viewable?.data);
    if (!viewable) {
        if (onError) onError('No viewable geometry found');
        return;
    }

    fitOnFirstGeometry(viewer);
    viewer.loadDocumentNode(doc, viewable)
        .then((model) => debugLog('loadDocumentNode() resolved:', model))
        .catch((err) => {
            debugLog('loadDocumentNode() rejected:', err);
            if (onError) onError(describeLoadDocumentNodeError(err));
        });
}

export function loadModel(viewer, fileUrn, onError) {
    debugLog('loadModel() fileUrn:', fileUrn);
    try {
        const documentId = normalizeDocumentId(fileUrn);
        window.Autodesk.Viewing.Document.load(
            documentId,
            (doc) => loadViewable(viewer, doc, doc.getRoot().getDefaultGeometry(), onError),
            (errorCode, errorMsg) => {
                console.error('Failed to load viewer document:', errorCode, errorMsg);
                if (onError) onError(describeDocumentLoadError(errorCode, errorMsg));
            },
        );
    } catch (err) {
        console.error('Invalid URN:', err);
        if (onError) onError(err.message || 'Invalid URN');
    }
}

function nearestViewableAncestor(node) {
    let current = node;
    while (current) {
        if (current.data?.type === 'geometry') return current;
        current = current.parent;
    }
    return null;
}

export function loadView(viewer, derivativeUrn, guid, onError) {
    debugLog('loadView()', derivativeUrn, guid);
    window.Autodesk.Viewing.Document.load(
        `urn:${derivativeUrn}`,
        (doc) => {
            const byGuid = guid && doc.getRoot().findByGuid(guid);
            const viewable = (byGuid && nearestViewableAncestor(byGuid)) || doc.getRoot().getDefaultGeometry();
            loadViewable(viewer, doc, viewable, onError);
        },
        (errorCode, errorMsg) => {
            console.error('Failed to load view document:', errorCode, errorMsg);
            if (onError) onError(describeDocumentLoadError(errorCode, errorMsg));
        },
    );
}
