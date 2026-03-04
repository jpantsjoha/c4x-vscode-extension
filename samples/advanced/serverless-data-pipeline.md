# Serverless Data Pipeline

A fully serverless data processing pipeline on AWS demonstrating **event-driven Lambda functions**, **S3 triggers**, and **real-time analytics**.

## Use Case

Process uploaded CSV files, transform data, enrich with external APIs, and store in a data lake for analytics.

## Container Diagram (C2) - Serverless Pipeline

```c4x
%%{ c4: container }%%
graph LR
  %% Users
  Person(analyst, "Data Analyst", "Uploads CSV files")
  Person(business, "Business User", "Views dashboards")

  %% Data Sources
  System_Ext(crm, "CRM System", "Salesforce")
  System_Ext(api, "Enrichment API", "Clearbit")

  %% S3 Buckets
  ContainerDb(raw_bucket, "Raw Data Bucket", "S3", "Uploaded CSV files")
  ContainerDb(processed_bucket, "Processed Bucket", "S3", "Transformed data")
  ContainerDb(archive_bucket, "Archive Bucket", "S3 Glacier", "Long-term storage")

  %% Lambda Functions (Serverless Compute)
  Container(ingest_lambda, "Ingest Function", "Lambda/Python", "Validates CSV format")
  Container(transform_lambda, "Transform Function", "Lambda/Python", "Cleans and normalizes data")
  Container(enrich_lambda, "Enrich Function", "Lambda/Node.js", "Adds external data")
  Container(aggregate_lambda, "Aggregate Function", "Lambda/Python", "Calculates metrics")
  Container(notify_lambda, "Notification Function", "Lambda/Node.js", "Sends alerts")

  %% Event Infrastructure
  Container(eventbridge, "EventBridge", "AWS EventBridge", "Event routing")
  Container(sqs, "Processing Queue", "SQS", "Async task queue")
  Container(sns, "Notification Topic", "SNS", "Alert distribution")

  %% Data Processing
  Container(glue, "ETL Job", "AWS Glue", "Batch transformations")
  ContainerDb(dynamodb, "Metadata Table", "DynamoDB", "File tracking")
  ContainerDb(data_lake, "Data Lake", "S3/Parquet", "Analytics data")

  %% Analytics
  Container(athena, "Query Engine", "Athena", "SQL queries")
  Container(quicksight, "Dashboard", "QuickSight", "Visualizations")

  %% Monitoring
  Container(cloudwatch, "Logs & Metrics", "CloudWatch", "Observability")
  System_Ext(slack, "Slack", "Alerts")

  %% Upload Flow
  analyst -->|Uploads CSV| raw_bucket

  %% S3 Event Trigger
  raw_bucket ==>|S3 Event (ObjectCreated)| ingest_lambda

  %% Validation & Routing
  ingest_lambda -->|Records metadata| dynamodb
  ingest_lambda -->|Valid files| sqs
  ingest_lambda -.->|Invalid files| sns

  %% Processing Pipeline
  sqs -.->|Consumes| transform_lambda
  transform_lambda -->|Writes cleaned data| processed_bucket
  transform_lambda ==>|TransformComplete event| eventbridge

  %% Enrichment
  eventbridge -->|Routes to| enrich_lambda
  enrich_lambda -->|Fetches company data| api
  enrich_lambda -->|Fetches CRM data| crm
  enrich_lambda -->|Writes enriched data| data_lake

  %% Aggregation
  enrich_lambda ==>|EnrichComplete event| eventbridge
  eventbridge -->|Routes to| aggregate_lambda
  aggregate_lambda -->|Calculates KPIs| data_lake

  %% Archival
  processed_bucket -.->|Lifecycle policy (30d)| archive_bucket

  %% Notification
  aggregate_lambda ==>|PipelineComplete event| eventbridge
  eventbridge -->|Routes to| notify_lambda
  notify_lambda -->|Sends alert| sns
  sns -.->|Notifies| slack
  sns -.->|Emails| analyst

  %% Analytics
  business -->|Queries| quicksight
  quicksight -->|SQL queries via| athena
  athena -->|Scans| data_lake

  %% Monitoring
  ingest_lambda -.->|Logs| cloudwatch
  transform_lambda -.->|Logs| cloudwatch
  enrich_lambda -.->|Logs| cloudwatch
  aggregate_lambda -.->|Logs| cloudwatch
```

## Component Diagram (C3) - Transform Lambda Internals

```c4x
%%{ c4: component }%%
graph TB
  %% External Elements
  SQS[Processing Queue<br/>Container<br/>External]
  S3[Processed Bucket<br/>Container<br/>External]
  EventBridge[EventBridge<br/>Container<br/>External]
  CloudWatch[CloudWatch<br/>Container<br/>External]

  subgraph TransformLambdaContainer {
    %% Entry Point
    Handler[Lambda Handler<br/>Component<br/>Main entry point]

    %% Processing Components
    Validator[Data Validator<br/>Component<br/>Schema validation]
    Parser[CSV Parser<br/>Component<br/>Pandas]
    Cleaner[Data Cleaner<br/>Component<br/>Null handling, dedup]
    Transformer[Data Transformer<br/>Component<br/>Type conversions]

    %% Quality Checks
    QualityChecker[Quality Checker<br/>Component<br/>Data quality rules]
    MetricsCollector[Metrics Collector<br/>Component<br/>CloudWatch SDK]

    %% Output
    S3Writer[S3 Writer<br/>Component<br/>boto3]
    EventPublisher[Event Publisher<br/>Component<br/>EventBridge SDK]

    %% Error Handling
    ErrorHandler[Error Handler<br/>Component<br/>Retry logic]
    Logger[Logger<br/>Component<br/>Structured logging]
  }

  %% Flow
  SQS -.->|Trigger| Handler
  Handler -->|Validates message| Validator
  Handler -->|Parses CSV| Parser
  Handler -->|Cleans data| Cleaner
  Handler -->|Transforms| Transformer

  Transformer -->|Checks quality| QualityChecker
  QualityChecker -->|Records metrics| MetricsCollector
  MetricsCollector -->|Sends metrics| CloudWatch

  QualityChecker -->|Passed| S3Writer
  QualityChecker -.->|Failed| ErrorHandler

  S3Writer -->|Writes Parquet| S3
  S3Writer -->|Publishes event| EventPublisher
  EventPublisher -->|Sends| EventBridge

  ErrorHandler -.->|Logs errors| Logger
  Logger -.->|Writes logs| CloudWatch
  Handler -.->|Logs execution| Logger
```

## Event Flow

1. **Analyst uploads** `sales_2026_03.csv` to Raw Bucket
2. **S3 triggers** Ingest Lambda
3. **Ingest Lambda** validates schema → writes metadata to DynamoDB → sends to SQS
4. **Transform Lambda** consumes from SQS → cleans data → writes to Processed Bucket → publishes `TransformComplete`
5. **Enrich Lambda** triggered → calls Clearbit + Salesforce APIs → writes to Data Lake → publishes `EnrichComplete`
6. **Aggregate Lambda** triggered → calculates monthly KPIs → writes to Data Lake → publishes `PipelineComplete`
7. **Notify Lambda** triggered → sends Slack alert + email
8. **Business User** queries via QuickSight → Athena scans Data Lake

## Serverless Benefits

| Feature | Traditional | Serverless |
|---------|------------|-----------|
| **Infrastructure** | Manage EC2, scaling | Zero management |
| **Cost** | Pay for idle time | Pay per invocation |
| **Scaling** | Manual/autoscaling | Automatic (0 → 1000s) |
| **Cold Start** | N/A | ~1-2s initial latency |
| **Execution Limit** | Unlimited | 15 min max (Lambda) |

## Cost Example

**Processing 10,000 CSV files/month**:
- Lambda invocations: ~50,000 (5 functions × 10k files)
- Execution time: ~50,000 seconds total
- **Cost**: ~$1.50/month

vs. EC2 (t3.medium 24/7): ~$30/month

## Best Practices

1. ✅ **Use SQS between Lambdas** for async processing
2. ✅ **Enable S3 Event Notifications** for reactive processing
3. ✅ **Store state in DynamoDB**, not Lambda filesystem
4. ✅ **Use EventBridge** for loose coupling
5. ✅ **Monitor with CloudWatch** Logs + X-Ray tracing
