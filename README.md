# Creative Guard MVP

Creative Guard protects a short creative commitment across GitHub repositories. One open focus Issue defines the current outcome. New idea Issues are parked automatically. A pull request must link the focus Issue or an approved, time-limited exception. The PR check is deterministic and works regardless of which AI agent wrote the Issue or PR.

## State and Issue data

| State | GitHub representation | Transition |
| --- | --- | --- |
| Current focus | Exactly one open Issue with `creative-guard:focus` | Create from focus template; close or relabel after review |
| Idea inbox | Open Issue with `creative-guard:idea` | Intake Action adds `creative-guard:later` while a focus is active |
| Parked idea | Both `creative-guard:idea` and `creative-guard:later` | Reconsider at focus review |
| Exception request | Open Issue with `creative-guard:exception` | Owner posts body-specific approval comment |

The focus body must contain `## Outcome`, `## Done when`, `## Scope`, and `## Lock until` (an ISO date). The lock date is inclusive; afterward PR checks fail until the focus is reviewed and updated. An exception body must contain `## Reason`, `## Requested change`, and `## Expires`. Dates use the `time-zone` input (UTC by default; the sample caller uses Asia/Tokyo).

The Issue intake Action comments with the approval command for a complete exception request. The owner approves by posting that exact command. It includes the first 12 characters of the SHA-256 hash of the exception body after CRLF is normalized to LF. Editing the request invalidates the approval. The repository owner login is the approver in this personal-account MVP.

## PR contract

Add one of these exact lines to the PR description:

```text
Creative Guard Focus: #12
Creative Guard Exception: #8
```

The check validates that there is exactly one well-formed, unexpired focus. A normal PR must link it. An exception PR needs an open labeled exception Issue, a valid future expiry, and an owner approval matching its current body. The check cannot prove that code actually fits the written Scope; reviewers still judge that part.

## Installation in each repository

1. Create labels `creative-guard:focus`, `creative-guard:idea`, `creative-guard:later`, and `creative-guard:exception`.
2. Copy `examples/creative-guard.yml` to `.github/workflows/creative-guard.yml` and the three templates in `examples/ISSUE_TEMPLATE/` to `.github/ISSUE_TEMPLATE/`.
3. Create one focus Issue using the template. Set a short lock period, such as seven days.
4. Open a test PR with `Creative Guard Focus: #<focus issue number>`. Confirm `check` passes; remove the line and confirm failure.
5. After the check has appeared, require both a PR and the `check` job in a branch ruleset for the default branch. Keep the ruleset in evaluate mode first; switch it to active after the focus and exception paths have been tested.

Use `AI_PROMPT.md` with Codex, Claude, Gemini, or another agent that processes ideas. A provider API key is not needed for the Action. The agent can submit ideas through GitHub Issues and leave classification comments; the same guard applies to every PR. The AI recommendation is advisory; the owner must still review whether a PR truly fits the focus scope.

For a personal GitHub account, there is no single organization-level required-workflow setting for all owned repositories. Install the small workflow and ruleset in each repository. The shared Action in this repository supplies one source of truth for the code. The sample caller pins a tested commit SHA. New repositories need the same installation steps.

## Permissions and rollout safety

The PR job needs only `issues: read` and `pull-requests: read`. The Issue intake job needs `issues: write` to add a label. No workflow checks out PR code or passes a secret to an untrusted PR. Adding the files alone does not block merges; the required check ruleset does. Install and test the workflow before enabling the ruleset to avoid blocking existing work. Existing workflows and files should remain untouched.

## Local verification

Run `node --test test/*.test.mjs` with Node 20 or later. The CI workflow runs the same tests on push and PR.

To survey an owner's repositories before a broad rollout, run `node scripts/audit-rollout.mjs OWNER` with an authenticated GitHub CLI. It reads the default-branch trees and reports existing target files, root or `.github` AGENTS.md instructions, archives, and truncated trees. It makes no changes.
