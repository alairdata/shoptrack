# ShopTrack — inventory and mini POS PWA

A simple mobile-first inventory app built with Next.js, Supabase Postgres and Vercel.

## Setup

1. Create a Supabase project at https://supabase.com/dashboard.
2. Open **SQL Editor** and execute `supabase/schema.sql` once on a new project.
3. Under **Authentication → Users**, create an email/password user for the shop. Disable public sign-ups under Authentication settings if you don't want other users registering.
4. Copy `.env.example` to `.env.local`, and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase project's API settings. **Use the publishable/anon key, never the service-role key.**
5. Run `npm install && npm run dev` to preview locally.
6. Push the project to GitHub, import it into Vercel, and set the same two environment variables in Vercel project settings. Deploy.
7. Open the deployed URL on your phone. Use the browser's **Add to Home Screen** option to install it as a PWA.

## Accounting rules

- **Stock investment:** original purchase cost of all recorded stock (remaining units + units already sold). This is not net cash contributed by the owner.
- **Remaining inventory cost:** purchase cost of unsold units.
- **Revenue:** sale price × units sold.
- **Gross profit:** (sale price − original unit cost) × units sold.
- **Operating expenses:** amounts entered under Expenses.
- **Net profit:** gross profit − operating expenses. Sales count at the price actually charged, so discounts are included. Does not include taxes, returns or payment fees unless recorded as expenses.
- Purchases of new stock belong under Inventory, not operating expenses.

## Notes and limitations

- Inventory is saved in Supabase and protected by per-user row-level security; each account sees only its own records.
- Sales are transactional and stock cannot go negative even if two devices sell at the same time.
- The app requires an internet connection for data entry; the PWA is installable but **does not provide offline data entry**.
- This MVP does not yet support sale refunds, receipts, item images, multiple employees sharing the same inventory, cash balance reconciliation or detailed profit reports. Add those before relying on it for more complex operations.
- Expenses and sales can be deleted after a confirmation. Deleting a sale returns its units to stock. Removing an item hides it from the shop and keeps its past sales.
- For accounting or tax reporting, reconcile with receipts and consult an accountant.
