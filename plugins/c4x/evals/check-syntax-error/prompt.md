---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Skill]
tags: [check]
---

Is this C4X diagram valid? Don't rewrite it, just tell me what is wrong and where.

```text
%%{ c4: system-context }%%
graph LR
    Person(user, "User", "Reads reports")
    System(reports, "Reports", "Builds monthly reports")
    user ..>|Reads reports in| reports
```
