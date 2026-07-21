// Shared inline SVG icons + the edit/delete action buttons used in every log
// history row (fuel, charging, maintenance).

export const ICON_EDIT = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;

export const ICON_DELETE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>`;

export function itemActions(id) {
  return `
    <div class="item-actions">
      <button type="button" class="icon-action" data-edit="${id}" aria-label="Edit">${ICON_EDIT}</button>
      <button type="button" class="icon-action icon-danger" data-del="${id}" aria-label="Delete">${ICON_DELETE}</button>
    </div>`;
}
