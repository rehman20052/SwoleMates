# Nutrition logging and save reliability

Nutrition retains the earlier Today / Plan / Recipes layout, goal calculator,
daily summary and weight interface. NutriDish is unchanged. The redesign covers
Log food and the paths for logging or saving recipes in the tracker.

## Log food

The logger opens with a meal name and fields for calories, protein, carbs, and
fat. Recent meals and Saved recipes open from shortcuts at the top. Expand
**Add ingredients** below the nutrition fields to build a meal, look up or scan
foods, and edit portions. Adding ingredients calculates the meal totals in the
same form. If you entered manual totals, you can switch back to them and keep
your ingredients in the draft. Removing the last ingredient also restores any
manual totals, and removal can be undone.

The selected journal date is kept. Local time at logging determines the group:
Breakfast before 11 a.m., Lunch before 4 p.m., and Dinner from 4 p.m. onward.
Users can correct the group by editing an existing entry, including older Snack
entries. Recent meals searches today and the previous six local days and fills
the form for review. Saved recipes logs one serving immediately from the picker
or the Recipes tab. Use **Save as meal** in the journal to keep a reusable copy.
The recipe editor still supports batch yield and finished weight.

Snapshots retain source, nutrient basis, entered quantity/unit and nutrients.
Grams and ounces require an explicit weight conversion. Unknown nutrients remain
distinct from zero. Numeric totals stay compatible with existing records;
`dataVersion: 2` and `incompleteNutrients` identify known subtotals. Older records
retain their totals without invented provenance. Recipe/catalog edits never
rewrite historical logs. Account-scoped drafts and stable record IDs support
recovery and duplicate prevention. Older drafts with a partial meal-plus-recipe
save can still retry the recipe without logging the meal again.

## Saving and contact protection

Outbox records acknowledge local persistence before cloud sync. Pending sync,
conflicts and failures remain distinct. Cloud requests do not block later local
edits. Account switches discard stale callbacks. Profile/account changes require
cloud confirmation and are never described as queued. Profile publishing and
old-media cleanup follow the primary save. Partial profile saves preserve edits
and uploaded media for retry.

Auth/read deadlines are 8 seconds, ordinary writes 15 seconds, individual media
uploads 120 seconds. Auth callbacks defer follow-up Supabase requests. Profile
progress identifies the current save stage.

Contact protection fails closed. Actionable status appears on contact screens
and Settings rather than globally. Diagnostics distinguish authentication,
timeout, missing RPC, permission and connection failures without credentials.
No backend migration was applied: the live RPC probe timed out, so deployment
configuration remains unverified. Mocked failure handling is tested separately.

## Native scanning

Expo Camera provides barcode capture, rear preview, torch and zoom. UPC/EAN check
digits are validated and UPC-E expanded. Typed barcodes/manual entry remain
available when permission or lookup fails. Scanning pauses on app suspension.

Label OCR uses on-device MLKit; photos are not uploaded for recognition. Users
review serving basis and nutrients before logging. Missing macros can stay
unknown. MLKit requires a new native build and is unavailable in Expo Go. Web
retains browser scanning and typed-barcode fallback. Provider secrets stay in
trusted server code.

## Verification

```
npm run typecheck
npm test
npm run build:pages
node tests/nutrition-smoke.cjs
npx expo export --platform all --output-dir artifacts/meal-tray-release
```

Browser tests mock external requests and cover restored navigation, meal building,
fractional portions, Undo, recipes, reload, barcode review, required names, drafts,
offline sync, safety recovery and profile/settings failures. Unit tests cover
calculations, persistence, conflicts, account changes and deadlines.

Bundle export does not compile CocoaPods/Gradle or exercise physical cameras.
Device validation must cover permission denial/revocation, resume, OCR quality,
torch/zoom, screen readers and small-screen keyboards. Web builds are local
validation; this work does not deploy GitHub Pages.
