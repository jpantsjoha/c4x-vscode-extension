# Healthcare Patient Management System

HIPAA-compliant electronic health records (EHR) system demonstrating **healthcare architecture patterns**, **regulatory compliance**, and **patient data security**.

## System Context (C1) - Healthcare Ecosystem

```c4x
%%{ c4: system-context }%%
graph TB
  %% Healthcare Personas
  Person(patient, "Patient", "Receives care")
  Person(doctor, "Physician", "Provides care")
  Person(nurse, "Nurse", "Administers care")
  Person(admin, "Admin Staff", "Manages records")

  %% Our System
  System(ehr, "EHR System", "Patient management platform")

  %% External Systems
  System_Ext(lab, "Lab System", "Test results")
  System_Ext(pharmacy, "Pharmacy System", "e-Prescriptions")
  System_Ext(imaging, "Imaging System", "X-rays, MRI, CT")
  System_Ext(billing, "Billing System", "Claims processing")
  System_Ext(hie, "Health Info Exchange", "Regional data sharing")

  %% Relationships
  patient -->|Views records, books appointments| ehr
  doctor -->|Diagnoses, prescribes| ehr
  nurse -->|Updates vitals, medications| ehr
  admin -->|Manages scheduling, records| ehr

  ehr -->|Sends orders to| lab
  ehr -->|Sends prescriptions to| pharmacy
  ehr -->|Requests scans from| imaging
  ehr -->|Sends claims to| billing
  ehr -->|Shares data with| hie

  lab -.->|Returns results| ehr
  pharmacy -.->|Confirms fills| ehr
  imaging -.->|Returns images| ehr
```

## Container Diagram (C2) - HIPAA-Compliant Architecture

```c4x
%%{ c4: container }%%
graph TB
  %% Users
  Person(patient, "Patient", "End user")
  Person(provider, "Healthcare Provider", "Doctor/Nurse")

  %% Patient Portal
  Container(web, "Patient Portal", "React", "Web interface")
  Container(mobile, "Mobile App", "React Native", "iOS/Android")

  %% Provider Applications
  Container(ehr_ui, "EHR Workstation", "WPF/.NET", "Desktop app")
  Container(tablet, "Bedside App", "iPad/Android", "Tablet app")

  %% API Layer
  Container(api_gateway, "API Gateway", "Kong", "Request routing + auth")
  Container(fhir_api, "FHIR API", "Node.js", "HL7 FHIR R4 interface")

  %% Core Services
  Container(patient_svc, "Patient Service", "Java/Spring", "Demographics")
  Container(clinical_svc, "Clinical Service", "Java/Spring", "Encounters, notes")
  Container(medication_svc, "Medication Service", "Node.js", "Prescriptions")
  Container(lab_svc, "Lab Service", "Python", "Test orders/results")
  Container(consent_svc, "Consent Service", "Java", "Patient consent mgmt")

  %% Data Stores (Encrypted at Rest)
  ContainerDb(patient_db, "Patient DB", "PostgreSQL + Encryption", "PHI data")
  ContainerDb(clinical_db, "Clinical DB", "PostgreSQL + Encryption", "Medical records")
  ContainerDb(document_store, "Document Store", "S3 + KMS", "PDFs, images")
  ContainerDb(audit_log, "Audit Log", "Amazon QLDB", "Immutable access log")

  %% Security
  Container(auth, "Auth Service", "Keycloak", "OAuth2/OIDC")
  Container(rbac, "Access Control", "Java", "Role-based permissions")
  Container(encryption, "Encryption Service", "AWS KMS", "Key management")

  %% Integration
  Container(hl7_adapter, "HL7 Adapter", "Mirth Connect", "HL7 v2 messaging")
  Container(dicom_server, "DICOM Server", "Orthanc", "Medical imaging")

  %% External Systems
  System_Ext(lab_vendor, "Lab Vendor", "Quest Diagnostics")
  System_Ext(pharmacy, "Pharmacy", "CVS SureScripts")

  %% User Flow
  patient --> web
  patient --> mobile
  provider --> ehr_ui
  provider --> tablet

  %% Gateway
  web --> api_gateway
  mobile --> api_gateway
  ehr_ui --> api_gateway
  tablet --> api_gateway

  %% Authentication
  api_gateway -->|Validates tokens| auth
  api_gateway -->|Checks permissions| rbac

  %% FHIR API
  api_gateway --> fhir_api
  fhir_api --> patient_svc
  fhir_api --> clinical_svc
  fhir_api --> medication_svc
  fhir_api --> lab_svc

  %% Services to Databases
  patient_svc --> patient_db
  clinical_svc --> clinical_db
  medication_svc --> patient_db
  lab_svc --> clinical_db

  %% Document Storage
  clinical_svc -->|Encrypts with| encryption
  clinical_svc -->|Stores PDFs| document_store

  %% Audit Logging (All Access Logged)
  patient_svc -.->|Logs access| audit_log
  clinical_svc -.->|Logs access| audit_log
  medication_svc -.->|Logs access| audit_log
  lab_svc -.->|Logs access| audit_log

  %% Consent Check
  patient_svc -->|Checks consent| consent_svc
  clinical_svc -->|Checks consent| consent_svc

  %% External Integration
  hl7_adapter -->|HL7 v2 messages| lab_vendor
  medication_svc -->|e-Prescriptions| pharmacy
  ehr_ui -->|DICOM query| dicom_server
```

## Component Diagram (C3) - Clinical Service Internals

```c4x
%%{ c4: component }%%
graph TB
  %% External
  FHIR_API[FHIR API<br/>Container<br/>External]
  Clinical_DB[Clinical DB<br/>Container<br/>External]
  Audit_Log[Audit Log<br/>Container<br/>External]
  Consent_Svc[Consent Service<br/>Container<br/>External]

  subgraph ClinicalServiceContainer {
    %% API Layer
    RestController[REST Controller<br/>Component<br/>Spring MVC]

    %% Business Logic
    EncounterManager[Encounter Manager<br/>Component<br/>Visit management]
    DiagnosisManager[Diagnosis Manager<br/>Component<br/>ICD-10 coding]
    NotesManager[Clinical Notes Manager<br/>Component<br/>SOAP notes]
    VitalsManager[Vitals Manager<br/>Component<br/>Blood pressure, temp, etc.]

    %% Data Access
    EncounterRepo[Encounter Repository<br/>Component<br/>JPA/Hibernate]
    DiagnosisRepo[Diagnosis Repository<br/>Component<br/>JPA]
    NotesRepo[Notes Repository<br/>Component<br/>JPA]

    %% Security & Compliance
    ConsentChecker[Consent Checker<br/>Component<br/>Patient permissions]
    AuditLogger[Audit Logger<br/>Component<br/>Access tracking]
    DataMasker[Data Masker<br/>Component<br/>PII redaction]

    %% Validation
    FHIRValidator[FHIR Validator<br/>Component<br/>Resource validation]
    ClinicalRules[Clinical Rules Engine<br/>Component<br/>Business rules]

    %% Caching
    EncounterCache[Encounter Cache<br/>Component<br/>Redis]
  }

  %% Request Flow
  FHIR_API -->|FHIR Bundle| RestController
  RestController -->|Validates| FHIRValidator
  RestController -->|Checks consent| ConsentChecker

  ConsentChecker -->|Queries| Consent_Svc

  FHIRValidator -->|Routes to| EncounterManager
  FHIRValidator -->|Routes to| DiagnosisManager
  FHIRValidator -->|Routes to| NotesManager
  FHIRValidator -->|Routes to| VitalsManager

  %% Business Logic
  EncounterManager -->|Applies rules| ClinicalRules
  EncounterManager -->|Checks cache| EncounterCache
  EncounterCache -.->|Cache miss| EncounterRepo

  DiagnosisManager -->|Persists| DiagnosisRepo
  NotesManager -->|Persists| NotesRepo
  VitalsManager -->|Persists| EncounterRepo

  %% Data Access
  EncounterRepo -->|SQL queries| Clinical_DB
  DiagnosisRepo -->|SQL queries| Clinical_DB
  NotesRepo -->|SQL queries| Clinical_DB

  %% Audit Logging
  EncounterManager -.->|Logs access| AuditLogger
  DiagnosisManager -.->|Logs access| AuditLogger
  NotesManager -.->|Logs access| AuditLogger
  AuditLogger -.->|Writes to| Audit_Log

  %% Data Masking (for non-authorized users)
  RestController -->|Redacts PII| DataMasker
```

## HIPAA Compliance Features

| Requirement | Implementation |
|-------------|----------------|
| **Access Control (§164.312(a)(1))** | OAuth2 + RBAC |
| **Audit Controls (§164.312(b))** | Immutable audit log (QLDB) |
| **Encryption at Rest (§164.312(a)(2)(iv))** | PostgreSQL TDE + S3 KMS |
| **Encryption in Transit (§164.312(e)(1))** | TLS 1.3 everywhere |
| **Patient Consent (§164.508)** | Consent Service + checks |
| **Data Integrity (§164.312(c)(1))** | Checksums + digital signatures |
| **Emergency Access (§164.312(a)(2)(ii))** | Break-glass workflow |

## HL7 FHIR Resources

**Patient Resource**:
```json
{
  "resourceType": "Patient",
  "id": "patient-12345",
  "identifier": [{"system": "MRN", "value": "987654"}],
  "name": [{"family": "Doe", "given": ["John"]}],
  "birthDate": "1980-05-15",
  "gender": "male"
}
```

**Encounter Resource**:
```json
{
  "resourceType": "Encounter",
  "id": "enc-67890",
  "status": "in-progress",
  "class": {"code": "IMP", "display": "inpatient"},
  "subject": {"reference": "Patient/patient-12345"},
  "period": {"start": "2026-03-03T08:00:00Z"}
}
```

## Security Best Practices

1. ✅ **Encrypt PHI at rest** (AES-256)
2. ✅ **Log all access** (immutable audit trail)
3. ✅ **Minimum necessary principle** (role-based access)
4. ✅ **Patient consent** before data sharing
5. ✅ **De-identify data** for analytics/research
6. ✅ **Regular security audits** (quarterly)
7. ✅ **Incident response plan** (breach notification)
