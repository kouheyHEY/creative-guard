import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalDigest, evaluate, labels, parseFocus } from '../src/core.mjs';

const focusBody = `## Outcome
Ship one playable level.

## Done when
- A player can finish the level.

## Scope
Level 1 only.

## Lock until
2026-10-18`;
const focus = { number: 12, body: focusBody };
const exceptionBody = `## Reason
The save file is corrupted.

## Requested change
Repair the save loader.

## Expires
2026-10-13`;

const base = {
  focusIssues: [focus],
  prBody: 'Creative Guard Focus: #12',
  owner: 'kouheyHEY',
  today: '2026-10-11',
};

test('valid focus PR passes', () => {
  assert.deepEqual(evaluate(base), { ok: true, reason: 'PR follows focus #12' });
});

test('idea in PR body does not count as a focus link', () => {
  assert.equal(evaluate({ ...base, prBody: 'Maybe focus #12?' }).ok, false);
});

test('zero or multiple active focus issues fail closed', () => {
  assert.equal(evaluate({ ...base, focusIssues: [] }).ok, false);
  assert.equal(evaluate({ ...base, focusIssues: [focus, { ...focus, number: 13 }] }).ok, false);
});

test('focus fields and lock expiry are checked', () => {
  assert.ok(parseFocus('## Outcome\nhello').errors.length >= 3);
  assert.ok(parseFocus(`## Outcome\n<!-- placeholder -->\n## Done when\n- done\n## Scope\nwork\n## Lock until\n2026-10-18`).errors.includes('Outcome is required'));
  assert.equal(evaluate({ ...base, today: '2026-10-19' }).ok, false);
  assert.equal(parseFocus(focusBody.replace('2026-10-18', '2026-02-30')).lockUntil, null);
});

test('exception needs current owner approval and must be unexpired', () => {
  const exceptionIssue = {
    number: 8,
    state: 'open',
    body: exceptionBody,
    labels: [{ name: labels.exception }],
  };
  const prBody = 'Creative Guard Exception: #8';
  const approval = { user: { login: 'kouheyHEY' }, body: `/creative-guard approve ${approvalDigest(exceptionBody)}` };
  assert.equal(evaluate({ ...base, prBody, exceptionIssue, exceptionComments: [approval] }).ok, true);
  assert.equal(evaluate({ ...base, prBody, exceptionIssue, exceptionComments: [{ ...approval, user: { login: 'bot' } }] }).ok, false);
  assert.equal(evaluate({ ...base, prBody, exceptionIssue: { ...exceptionIssue, body: `${exceptionBody}\nchanged` }, exceptionComments: [approval] }).ok, false);
  assert.equal(evaluate({ ...base, prBody, exceptionIssue, exceptionComments: [approval], today: '2026-10-14' }).ok, false);
});
