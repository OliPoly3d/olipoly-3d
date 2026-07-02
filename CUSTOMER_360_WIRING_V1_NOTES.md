# Customer 360 Wiring v1

Safe wiring pass using the latest installed Search v2/readability repo as the base.

Modified internal files only:
- orders-admin.html
- production-control.html
- inventory-control.html
- finance-pro.html
- quote.html

Adds Customer 360 shortcuts in internal top actions and contextual customer links where low-risk:
- Orders list customer rows now include a Customer 360 chip.
- Production job cards include a Customer 360 chip when a customer name exists.
- Quote customer field includes a Customer 360 launcher using the typed customer name.

No Supabase changes. No schema changes. No customer-facing pages touched.
