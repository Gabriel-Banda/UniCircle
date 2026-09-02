// Standardized Animated Empty State Generator

export function renderEmptyState({
  icon = '💬',
  title = 'Nothing here yet',
  description = 'Your community is quiet... for now. Start the conversation and bring your classmates into the loop.',
  actionText = null,
  actionHref = null,
  actionId = null
}) {
  const buttonHtml = actionText ? `
    <div style="margin-top: 1.25rem;">
      ${actionHref 
        ? `<a href="${actionHref}" class="btn btn-primary btn-interactive">${actionText}</a>`
        : `<button id="${actionId || 'empty-state-btn'}" class="btn btn-primary btn-interactive">${actionText}</button>`
      }
    </div>
  ` : '';

  return `
    <div class="empty-state animate-fade-in">
      <div class="empty-state-icon">${icon}</div>
      <h3 class="empty-state-title">${title}</h3>
      <p class="empty-state-desc">${description}</p>
      ${buttonHtml}
    </div>
  `;
}
