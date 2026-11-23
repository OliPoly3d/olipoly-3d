# Editable rate defaults and mileage origin

Prepared November 23, 2026. No database migration, customer communication, automatic correction, merge or publication is performed by this review package.

## Behavior

- New business mileage entries suggest the IRS federal business rate effective on the trip date. Verified periods cover 2022–2026, including the two midyear changes. For 2026 the rate is $0.725 January–June and $0.76 July–December.
- New mileage entries start at **OliPoly 3D LLC — HQ, 990 Aurora Hudson Rd, Aurora, OH 44202**. The start, destination, miles, rate, purpose and round-trip choice remain editable. A reset prepares a new entry with HQ; existing trips retain their saved origin.
- A new entry's date change updates a standard mileage suggestion until the owner manually overrides it. **Use standard rate** explicitly restores the verified value. Unsupported dates do not reuse an expired automatic suggestion.
- A single shared rate module contains the dated Ohio combined county rates for 2026. All 88 county names are selectable through a datalist. Warren is 6.75% before October 1 and 7.25% afterward. Ohio published no Q1–Q3 county changes in 2026; the Q4 table identifies Warren as the only Q4 county change.
- Delaware, Fairfield, Licking, Union and Wood have address-dependent transit exceptions. County-only selection does not choose a rate for them; the owner is prompted to verify the exact location in The Finder. Out-of-state/unrecognized counties and unsupported tax dates do not become assumed zero-tax sales.
- Draft quote county changes apply the verified rate unless a manual override is in effect. Rates remain editable and feed the existing canonical quote totals, live profit preview and normal save workflow. An existing custom rate is retained when opening/revisiting a quote.
- Finance corrections, PO review and fulfillment retain their saved rate on opening. Guidance and an explicit **Use standard rate** action allow deliberate changes through existing audited/approval workflows. A county-only financial correction still does not silently change collected tax.
- The selected tax county is a reporting/sourcing decision, not an automatic derivation from a shipping address. Existing quote/fulfillment helper text is clarified accordingly. No new address verification/API claim is made.
- Each helper shows its source, applicable date/period and November 23 verification date. Expired/unverified dates remain manual. The tax helper for Finance uses entry date; quote defaults use today's business date; PO/fulfillment guidance uses the shared quote date when available.

## Persistence and scope

The shared, versioned reference module is delivered with the app to every device. Actual rates and trip origins save in existing Supabase-backed financial/order fields through existing workflows. No new browser-only business records or settings are introduced. Reference lookup data is code, not a live IRS/Ohio integration. New periods need a verified reference update before suggestions are enabled. Saved historical entries are not rewritten when reference data changes.

Other defaults already present include consumer/business terms and business-use percentages, plus per-roll material costs and per-printer cost inputs in the production model. Those are owner/business assumptions, not government standard rates. A future shared settings screen should consolidate editable owner defaults (labor, margins, machine rates, home-office inputs, preferred terms, packaging standards) and preserve legacy Finance Pro settings during migration. This milestone does not claim that shared settings screen exists, infer tax exemption, invent actual postage/processor fees, or select a tax accounting/equipment treatment.

## Sources verified November 23, 2026

- IRS dated rate table: https://www.irs.gov/tax-professionals/standard-mileage-rates
- IRS Announcement 2026-11, revising the rate July 1: https://www.irs.gov/irb/2026-29_irb
- Ohio county/transit rate table: https://tax.ohio.gov/business/sales-and-use-tax/rate-tables/by-county-q4-2026
- Ohio rate-change history: https://tax.ohio.gov/business/sales-and-use-tax
- Ohio sourcing: https://tax.ohio.gov/business/ohio-business-taxes/sales-and-use/information-releases/st-2009-03-sourcing

## Validation and manual review

74 automated checks pass, including IRS date boundaries, all 88 counties, Warren's boundary, transit exceptions, unsupported dates, editable overrides, historical rate/origin preservation, actual Finance submit/reset, actual quote-builder recalculation/save, corrections and existing order/inventory/PO/shipping flows. Syntax and diff checks pass. jsdom verifies DOM interactions, not visual iPad rendering.

After approval to merge and publish this private test update:
1. Finance → Add expense → Vehicle / Delivery Mileage. Confirm HQ and the trip-date rate.
2. Change the date between June 30 and July 1, 2026. Check $0.725 versus $0.76.
3. Override the rate and starting location, change date, and confirm both overrides remain. Save and reload on another device.
4. Open a historical correction; confirm no value changes until you edit or apply a standard rate.
5. In a draft quote select Geauga, Portage, then a transit-exception county. Review canonical totals, editable override and required location verification. Sent quotes and approved totals remain protected by their existing workflows.

Rollback is a previous private Site version; no schema or saved-record rollback is required. No public site, customer PDFs/legal terms, OP numbering or production environment changes are included.
