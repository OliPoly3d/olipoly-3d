# Tax/PO Persistence + Quote-to-Order Carryover Fix

Overwrite:
- orders-admin.html
- quote.html
- quote.js

SQL:
- You already ran the SQL. The included SQL is safe/idempotent, but you do not need to rerun it unless you want to verify columns exist.

What this fixes:
- Orders Admin now loads tax_exempt, tax_exempt_reason, exemption_certificate_on_file, and po_file_on_file into the dropdowns when selecting an order.
- Orders Admin save payload includes those fields.
- Quote Tool save payload includes those fields.
- Quote → Order creation carries those fields into Orders Admin.
- Tax Exempt forces quote tax to $0 / Tax Exempt display.
