// Lazy-loads the APS (Autodesk Platform Services) Viewer SDK and runs
// Autodesk.Viewing.Initializer exactly once, no matter how many Viewer
// Output nodes request it concurrently - Initializer sets up one shared
// environment; each node then gets its own headless Viewer3D instance.
//
// https://aps.autodesk.com/en/docs/viewer/v7/developers_guide/viewer_basics/starting-html/
// https://aps.autodesk.com/en/docs/viewer/v2/tutorials/headless/

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

// Signature required by Autodesk.Viewing.Initializer: getAccessToken(onTokenReady)
// where onTokenReady(accessToken, expiresInSeconds).
function getAccessToken(onTokenReady) {
    fetch('/api/dx/viewer-token')
        .then((response) => {
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            return response.json();
        })
        .then((data) => onTokenReady(data.access_token, data.expires_in))
        .catch((err) => console.error('Failed to fetch viewer token:', err));
}

// Resolves once window.Autodesk.Viewing is loaded and initialized. Safe to
// call from multiple nodes - the actual load/init work only happens once.
export function ensureViewerReady() {
    if (!readyPromise) {
        readyPromise = loadScript(VIEWER_SCRIPT_URL).then(() => {
            loadStylesheet(VIEWER_CSS_URL);
            return new Promise((resolve) => {
                window.Autodesk.Viewing.Initializer({ env: 'AutodeskProduction', getAccessToken }, resolve);
            });
        });
    }
    return readyPromise;
}

// Viewer3D + initialize() (rather than GuiViewer3D + start()) is the
// "headless" viewer - it renders the model with no toolbar or model-browser
// panel, which is all this small embedded canvas has room for.
export function createViewer(container) {
    const viewer = new window.Autodesk.Viewing.Viewer3D(container, {});
    viewer.initialize();
    return viewer;
}

// Document.load expects "urn:" followed by the URL-safe base64 encoding of
// the actual object/version urn - not that urn itself. Passing the plain
// "urn:adsk.wipprod:..." string straight through (as read off an Exchange
// element) makes the manifest lookup fail with a 400.
function toViewerUrn(rawUrn) {
    return btoa(rawUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// IDs handed out by the Data Exchange GraphQL API (folder id, item id, item
// version id, ...) are themselves base64 of a "~"-joined composite string -
// e.g. an item id decodes to "item~b.<hubId>~b.<projectId>~urn:adsk.wipprod:
// fs.folder:co.xxxx~urn:adsk.wipprod:dm.lineage:yyyy" - note that's TWO
// embedded urns, the parent folder's followed by the item's own. The item
// (or item version) this id actually identifies is always the LAST one, so
// this anchors to end-of-string rather than taking the first match - so it
// can be fed into toViewerUrn() exactly like an Exchange's
// alternativeIdentifiers.fileVersionUrn.
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

// TEMP - verbose logging while tracking down the Get Views "always blank/
// gray canvas, no error" report. Safe to leave in (console.log, not visible
// to normal users), but remove once that's actually diagnosed.
function debugLog(...args) {
    console.log('[viewerSdk]', ...args);
}

// GuiViewer3D auto-fits the camera to whatever just loaded; the headless
// Viewer3D this app uses does not, since that's normally a toolbar/UI-driven
// action. Without this, a load can succeed with geometry actually in the
// scene while the (fixed, default) camera just isn't pointed at it - which
// looks identical to a failed load (a flat, empty-looking canvas) but with
// no error to explain why. Fits once, the first time geometry for this load
// finishes streaming in.
function fitOnFirstGeometry(viewer) {
    const timeout = setTimeout(() => {
        debugLog('GEOMETRY_LOADED_EVENT never fired within 15s of loadDocumentNode - the model may not actually be streaming in geometry at all.');
    }, 15000);
    const onGeometryLoaded = () => {
        clearTimeout(timeout);
        debugLog('GEOMETRY_LOADED_EVENT fired - model bounding box:', viewer.model?.getBoundingBox?.());
        viewer.fitToView();
        debugLog('fitToView() called. Camera position after fit:', viewer.navigation?.getPosition?.(), 'target:', viewer.navigation?.getTarget?.());
        viewer.removeEventListener(window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeometryLoaded);
    };
    viewer.addEventListener(window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeometryLoaded);
}

// viewer.loadDocumentNode() resolves its own internal load url via
// viewable.getViewableRootPath() (a public BubbleNode method - see the APS
// Viewer source). For a 3D leaf node with no embedded OTG manifest, that
// method only recognizes a child resource whose mime is exactly
// "application/autodesk-svf" (legacy SVF) - it has no fallback for
// "application/autodesk-svf2", which is what Data Exchange-derived
// manifests actually produce (confirmed via a manifest dump: a role:
// "graphics", mime: "application/autodesk-svf2" resource child, with no
// data.otg_manifest anywhere in the tree for getOtgGraphicsNode() to use
// instead). When getViewableRootPath() comes up empty, loadDocumentNode
// doesn't fail through its error callback - it throws several calls later
// doing `url.toLowerCase()` on the empty path, as an uncaught rejection deep
// inside the SDK's own promise chain.
function findSvf2ResourceUrn(viewable) {
    const resource = viewable.search?.({ mime: 'application/autodesk-svf2' })?.[0];
    return resource?.urn?.() || null;
}

function loadViewable(viewer, doc, viewable, onError) {
    debugLog('loadViewable() - viewable:', viewable, 'data:', viewable?.data);
    if (!viewable) {
        console.error('Document has no loadable viewable/geometry node.');
        if (onError) onError('No viewable geometry found');
        return;
    }
    let rootPath = viewable.getViewableRootPath?.();
    const svf2Urn = !rootPath && findSvf2ResourceUrn(viewable);
    if (svf2Urn) {
        // Patches only this one BubbleNode instance (an own-property
        // override wins over the prototype method) - loadDocumentNode's own
        // call to this same method further down then picks up the corrected
        // url, while everything else it does (property db paths,
        // acmSessionId, camera setup) still runs through its normal path.
        viewable.getViewableRootPath = () => svf2Urn;
        rootPath = svf2Urn;
    }
    debugLog(
        'viewable.getViewableRootPath():', rootPath,
        'isGeomLeaf:', viewable.isGeomLeaf?.(),
        'otgGraphicsNode:', viewable.getOtgGraphicsNode?.(),
        'svf2 resource urn found:', svf2Urn,
    );
    if (!rootPath) {
        console.error('Viewable has no resolvable root path - loadDocumentNode would crash internally on this manifest.');
        if (onError) onError('This model has no viewable geometry the Autodesk Viewer can load');
        return;
    }
    fitOnFirstGeometry(viewer);
    const result = viewer.loadDocumentNode(doc, viewable);
    debugLog('loadDocumentNode() returned:', result);
    if (result && typeof result.then === 'function') {
        result.then(
            (model) => debugLog('loadDocumentNode() promise resolved with model:', model),
            (err) => {
                debugLog('loadDocumentNode() promise REJECTED:', err);
                // This previously only reached the console - the viewer was
                // left looking blank/grey with no visible indication that
                // anything had failed. loadDocumentNode() rejects with a
                // bare numeric LMV error code, not a message (unlike
                // Document.load()'s own error callback), so there's no
                // string to show beyond the code itself for codes not
                // called out below.
                if (onError) onError(describeLoadDocumentNodeError(err));
            },
        );
    }
}

// 13 is Autodesk.Viewing.ErrorCodes.UNSUPORTED_FILE_EXTENSION - the code
// loadDocumentNode() rejects with for an SVF2 resource that has no embedded
// OTG manifest (see findSvf2ResourceUrn above): SVF2 content only loads via
// an OTG-manifest-mapped .json path, not a bare resource urn, so the SDK
// can't pick a file loader for it at all.
function describeLoadDocumentNodeError(errorCode) {
    if (errorCode === 13) {
        return 'This model\'s translated format (SVF2) has no viewer manifest to load it (Error 13)';
    }
    return `Error ${errorCode}`;
}

export function loadModel(viewer, fileUrn, onError) {
    window.Autodesk.Viewing.Document.load(
        `urn:${toViewerUrn(fileUrn)}`,
        (doc) => loadViewable(viewer, doc, doc.getRoot().getDefaultGeometry(), onError),
        (errorCode, errorMsg) => {
            console.error('Failed to load viewer document:', errorCode, errorMsg);
            if (onError) onError(errorMsg || `Error ${errorCode}`);
        },
    );
}

// Loads one specific view (by guid, from the Get Views node) out of a Revit
// document. Unlike loadModel()'s fileUrn, `derivativeUrn` here comes
// straight off the Model Derivative REST API (backend/services/
// model_derivative_service.py) already base64-encoded, exactly as used
// directly in that API's own URL paths - so it must NOT be run through
// toViewerUrn() again, just prefixed with "urn:".
// Walks up from `node` to the nearest ancestor that's an actual loadable
// viewable (type: 'geometry') - findByGuid() correctly locates the node for
// a given guid (its urn even shows the right per-view filename), but that
// node is often an internal SVF/F2D *resource* leaf one or more levels
// below the viewable itself (role: 'graphics', not directly loadable -
// loadDocumentNode rejects it with error code 13 and no other symptom).
// Searching sibling/top-level viewables by that same guid instead (as an
// earlier version of this function did) doesn't work either: nothing
// guarantees a viewable's own guid matches its resource children's, so it
// just never matches anything and silently always falls back to the
// default geometry - which looks like "every view shows the same thing."
function nearestViewableAncestor(node) {
    let current = node;
    while (current) {
        if (current.data?.type === 'geometry') return current;
        current = current.parent;
    }
    return null;
}

export function loadView(viewer, derivativeUrn, guid, onError) {
    debugLog('loadView() called with derivativeUrn:', derivativeUrn, 'guid:', guid);
    window.Autodesk.Viewing.Document.load(
        `urn:${derivativeUrn}`,
        (doc) => {
            debugLog('Document.load succeeded. Root:', doc.getRoot());
            const byGuid = guid && doc.getRoot().findByGuid(guid);
            debugLog('findByGuid result:', byGuid, byGuid ? byGuid.data : '(not found)');
            const ancestor = byGuid && nearestViewableAncestor(byGuid);
            debugLog('nearest viewable ancestor:', ancestor, ancestor ? ancestor.data : '(none - will fall back to getDefaultGeometry())');
            const viewable = ancestor || doc.getRoot().getDefaultGeometry();
            loadViewable(viewer, doc, viewable, onError);
        },
        (errorCode, errorMsg) => {
            console.error('Failed to load view document:', errorCode, errorMsg);
            if (onError) onError(errorMsg || `Error ${errorCode}`);
        },
    );
}
