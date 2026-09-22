# Nutrition and AI API strategy

This strategy was checked against provider documentation on September 15, 2026. Provider pricing and terms can change, so the team must review them again before launch.

## Recommended approach

Use a provider-adapter layer in trusted server code:

```text
SwoleMates app
  -> SwoleMates server/API
      -> USDA FoodData Central adapter
      -> Gymie AI adapter
  -> PostgreSQL and object storage
```

Never place provider keys in the mobile app or commit them to GitHub. Normalize external records into internal types and retain `provider`, `external_id`, `source_url`, and attribution.

## Nutrition source of truth

[USDA FoodData Central](https://fdc.nal.usda.gov/api-guide/) is the recommended durable source for food search, serving data, and macro calculation.

- It requires a free data.gov API key.
- The documented default limit is 1,000 requests per hour per IP.
- The data is public domain under CC0, with source attribution requested.
- Foundation Foods suits basic ingredients, FNDDS suits commonly consumed foods and portions, and Branded Foods suits packaged labels.
- USDA also provides [bulk downloads](https://fdc.nal.usda.gov/download-datasets/) if the project later needs a local searchable subset.

Normalize provider food records and preserve a nutrient snapshot on each historical journal entry. This prevents an external record update from silently changing a user's old daily totals.

## Gymie

Gymie should call an AI provider only through the backend. Give it a curated exercise/nutrition knowledge base and store citations with responses. Private profile, workout, and nutrition data should be included only with the user's explicit permission and only for that user's request.

For the MVP, constrain Gymie to general education, app help, and draft workout suggestions. It must avoid diagnosis and treatment, identify high-risk injury/eating-disorder/emergency prompts, and direct those users to an appropriate professional or emergency service.
