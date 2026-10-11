import { createHash } from 'node:crypto';

export const labels = Object.freeze({
  focus: 'creative-guard:focus',
  idea: 'creative-guard:idea',
  later: 'creative-guard:later',
  exception: 'creative-guard:exception',
});

export function section(body, title) {
  const lines = String(body ?? '').split(/\r?\n/);
  const heading = `## ${title}`.toLowerCase();
  const start = lines.findIndex(line => line.trim().toLowerCase() === heading);
  if (start < 0) return '';
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').replace(/<!--[\s\S]*?-->/g, '').trim();
}

export function isoDay(value) {
  const day = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? null : day;
}

export function parseFocus(body) {
  const outcome = section(body, 'Outcome');
  const done = section(body, 'Done when');
  const scope = section(body, 'Scope');
  const lockUntil = isoDay(section(body, 'Lock until'));
  const errors = [];
  if (!outcome) errors.push('Outcome is required');
  if (!done) errors.push('Done when is required');
  if (!scope) errors.push('Scope is required');
  if (!lockUntil) errors.push('Lock until must be YYYY-MM-DD');
  return { outcome, done, scope, lockUntil, errors };
}

export function parseException(body) {
  const reason = section(body, 'Reason');
  const change = section(body, 'Requested change');
  const expires = isoDay(section(body, 'Expires'));
  const errors = [];
  if (!reason) errors.push('Reason is required');
  if (!change) errors.push('Requested change is required');
  if (!expires) errors.push('Expires must be YYYY-MM-DD');
  return { reason, change, expires, errors };
}

export function reference(body, name) {
  const match = String(body ?? '').match(new RegExp(`^Creative Guard ${name}: #([1-9]\\d*)\\s*$`, 'im'));
  return match ? Number(match[1]) : null;
}

export function approvalDigest(body) {
  return createHash('sha256').update(String(body ?? '').replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
}

export function isApproved(comments, owner, body) {
  const expected = `/creative-guard approve ${approvalDigest(body)}`;
  return comments.some(comment => comment.user?.login?.toLowerCase() === owner.toLowerCase()
    && String(comment.body ?? '').trim() === expected);
}

export function evaluate({ focusIssues, prBody, exceptionIssue, exceptionComments = [], owner, today }) {
  const errors = [];
  if (focusIssues.length !== 1) errors.push(`Exactly one open focus issue is required; found ${focusIssues.length}`);
  const focus = focusIssues.length === 1 ? focusIssues[0] : null;
  const focusData = focus && parseFocus(focus.body);
  if (focusData) {
    errors.push(...focusData.errors.map(error => `Focus #${focus.number}: ${error}`));
    if (focusData.lockUntil && focusData.lockUntil < today) errors.push(`Focus #${focus.number} expired on ${focusData.lockUntil}`);
  }
  const linkedFocus = reference(prBody, 'Focus');
  const linkedException = reference(prBody, 'Exception');
  if (focus && linkedFocus === focus.number && !errors.length) return { ok: true, reason: `PR follows focus #${focus.number}` };
  if (!linkedException) {
    errors.push(`PR must contain "Creative Guard Focus: #${focus?.number ?? 'N'}" or an approved exception`);
    return { ok: false, errors };
  }
  if (!exceptionIssue || exceptionIssue.number !== linkedException || exceptionIssue.state !== 'open') {
    errors.push(`Exception #${linkedException} must be an open issue`);
    return { ok: false, errors };
  }
  if (!exceptionIssue.labels?.some(label => (typeof label === 'string' ? label : label.name) === labels.exception)) {
    errors.push(`Exception #${linkedException} needs label ${labels.exception}`);
  }
  const request = parseException(exceptionIssue.body);
  errors.push(...request.errors.map(error => `Exception #${linkedException}: ${error}`));
  if (request.expires && request.expires < today) errors.push(`Exception #${linkedException} expired on ${request.expires}`);
  if (!isApproved(exceptionComments, owner, exceptionIssue.body)) errors.push(`Exception #${linkedException} needs owner approval for its current body`);
  return errors.length ? { ok: false, errors } : { ok: true, reason: `PR uses approved exception #${linkedException}` };
}
