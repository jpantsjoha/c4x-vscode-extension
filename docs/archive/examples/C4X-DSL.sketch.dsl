view C1 direction LR title "Campaign Content Studio — Context" {
  Person marketer "Marketer" "Brand/content teams"
  System contentStudio "Campaign Content Studio" "GenAI content generator"
  System marTech "MarTech Platforms" "Adobe / SFMC" tag External
  System oneapp "OneApp/Web" "Consumer channels" tag External
  Rel marketer -> contentStudio "Prompts & requests"
  Rel contentStudio -> marTech "Publish approved content"
  Rel contentStudio -> oneapp "Localized copy"
}

view C2 direction LR title "Campaign Content Studio — Containers" {
  Boundary cs "Content Studio" {
    Container ui "Web UI" "React" "Prompt input, review"
    Container orch "Workflow Orchestrator" "Logic Apps/Functions" "Approvals & integrations"
    Container llm "LLM Runtime" "Azure OpenAI" "Copy/translation"
    Container ctx "Context & Grounding" "AI Search + Blob" "Guidelines, corpora"
    Container comp "Compliance Agent" "Functions + Rules" "Policy checks"
    Container rev "Review Store" "Cosmos/SQL" "Feedback & audit"
  }
  System marTech "MarTech Platforms" "Adobe / SFMC" tag External
  Rel ui -> orch "Submit workflow"
  Rel orch -> llm "Prompt + tools"
  Rel llm -> ctx "RAG lookups"
  Rel orch -> comp "Compliance checks"
  Rel orch -> rev "Persist drafts/feedback"
  Rel orch -> marTech "Publish"
}