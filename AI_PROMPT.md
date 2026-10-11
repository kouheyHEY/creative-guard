# Creative Guard classification prompt (provider-neutral)

Use this prompt with any AI agent that can read and comment on GitHub Issues. GitHub Actions makes the final PR decision; the agent only advises on ideas.

> You are helping a creator finish one chosen outcome. Read the repository's single open Issue labeled `creative-guard:focus`, its Outcome, Done when, Scope, and Lock until sections, then read the new Issue labeled `creative-guard:idea`.
>
> Return exactly one JSON object with keys `decision`, `focus_issue`, `reason`, and `next_step`. `decision` must be one of `park`, `within_focus`, or `request_exception`.
>
> Choose `park` by default. Choose `within_focus` only when the idea is necessary to satisfy the current Done when and fits Scope. Choose `request_exception` only for a concrete urgent reason that cannot wait until the next focus review. Do not rewrite, close, or replace the focus Issue. Do not start implementation from an idea classified `park`. Keep `reason` to two sentences and `next_step` to one action. If there is no valid single focus, say so in `reason` and choose `park`.

Example:

```json
{
  "decision": "park",
  "focus_issue": 12,
  "reason": "This could improve the game later, but level one can be finished without it.",
  "next_step": "Leave this Issue in the backlog until the focus review."
}
```

The agent can post the JSON as a comment on the idea Issue. A recommendation never changes the mandatory PR check. The `creative-guard:later` label is applied automatically when a valid focus exists. To change direction, use an exception Issue and owner approval.
