// Shared helper for node types that render a checkbox-selectable table
// (Hubs, Projects). Rendering/fetch orchestration stays in each node module
// since that differs meaningfully; only the identical bits live here.

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// The Data Exchange API's DateTime fields come back as full ISO timestamps
// (e.g. "2026-07-20T14:03:11.000Z") - callers displaying "Created" columns
// only want the calendar date, not the time. Slicing the string directly
// (rather than going through `new Date(...)`) avoids the local-timezone
// conversion shifting the date shown across a midnight boundary.
export function formatDateOnly(isoString) {
    return isoString ? isoString.split('T')[0] : '';
}
