---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Skill]
tags: [preview]
---

/c4x:preview this diagram:

```c4x
%%{ c4: system-context }%%
graph LR
    Person(user, "User", "Reads reports")
    System(reports, "Reports", "Builds monthly reports")
    user -->|Reads reports in| reports
```
