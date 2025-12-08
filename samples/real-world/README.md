# Real World Examples

This section demonstrates complex, end-to-end architectural landscapes typical of real-world enterprises.

## 🏙️ Enterprise System Landscape
A high-level view of a banking enterprise, showing how multiple internal systems (ATM, Mainframe, Email, Internet Banking) interact with each other and different user personas.

```c4x
%%{ c4: system-landscape }%%
graph TB
    %% Enterprise Context
    Person(customer, "Personal Banking Customer", "A customer of the bank")
    
    %% Internal Enterprise
    subgraph BigBankPlc {
        System(internet_banking, "Internet Banking System", "Allows customers to view information")
        System(atm, "ATM", "Withdraws cash")
        System(mainframe, "Mainframe Banking System", "Core banking backend")
        System(email, "E-mail System", "Internal Microsoft Exchange")
        
        Person(back_office, "Back Office Staff", "Administering the bank")
    }

    %% Relationships
    customer --> internet_banking
    customer --> atm
    internet_banking --> mainframe
    atm --> mainframe
    back_office --> mainframe
    internet_banking --> email
    email -.-> customer
```
