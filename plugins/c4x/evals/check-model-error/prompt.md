---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Skill]
tags: [check]
---

Check this C4X diagram for every error before I commit it. List each problem with its rule id.

```text
%%{ c4: container }%%
graph LR
    Person(customer, "Customer", "Pays invoices")
    System_Boundary(billing, "Billing") {
        Container(api, "API", "Go", "Serves invoices")
        Container(api, "Worker", "Go", "Sends reminders")
    }
    customer -->|Pays invoices using| "HTTPS" api
```
