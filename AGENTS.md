# AGENTS.md
# OliPoly ERP Engineering Guide

---

# Mission

You are the lead software engineer for the OliPoly ERP.

This repository supports a real, production business.

Your primary objective is to make the system simpler, more reliable, easier to maintain, and easier to extend.

Never add complexity simply because it is possible.

Prefer deleting obsolete code over adding another compatibility layer.

Every improvement should reduce technical debt.

---

# Development Philosophy

Inspect before modifying.

Understand before refactoring.

Preserve working functionality whenever practical.

Small, safe improvements are preferred over large rewrites.

Each Pull Request should solve one coherent business problem.

Do not combine unrelated changes.

---

# Architecture Ownership

Every major module owns one responsibility.

## Production Control

Production Control owns manufacturing.

It is the authoritative source for:

- production estimates
- filament usage
- material costs
- machine costs
- labor estimates
- packaging estimates
- hardware costs
- production workflow
- inventory reservation
- actual production usage
- scrap
- printer assignment
- suggested selling price
- suggested piece price
- break-even
- estimated profit

Quote should never recreate these calculations.

---

## Quote

Quote owns customer pricing.

Quote is responsible for:

- customer information
- quantity
- suggested selling price presentation
- custom selling price override
- discounts
- tax
- tax exemption
- deposits
- balance
- customer notes
- assumptions
- turnaround
- payment terms
- quote presentation

Quote does not estimate manufacturing.

---

## Orders

Orders begin only after Quote acceptance.

Orders own:

- fulfillment
- production linkage
- customer communication
- payment tracking
- completion

---

## Inventory

Inventory owns:

- rolls
- materials
- reservation
- consumption
- adjustments
- reorder points

Production requests inventory.

Inventory owns inventory.

---

## Finance

Finance owns:

- invoices
- receipts
- payments
- expenses
- reporting
- profitability

---

# Customer Types

There is ONE Quote system.

Not two.

Customer Type determines which fields are shown.

Retail:

- customer
- payment
- receipt
- pickup/delivery

Business:

- company
- PO
- invoice
- tax exempt
- billing
- shipping

Never duplicate pricing engines.

---

# Pricing Rules

There shall be one authoritative pricing engine.

calculateQuoteTotals()

Every customer-facing total comes from it.

These must never calculate totals independently:

- Quote page
- Quote PDF
- Quote Email
- Saved Quote
- Public Quote
- Accepted Order
- Finance import

These consume a totals snapshot.

They do not recalculate it.

---

# Production Workflow

The manufacturing workflow is:

Estimate

↓

Waiting for Customer

↓

Ready to Print

↓

Printing

↓

QC / Finishing

↓

Ready for Pickup / Shipment

↓

Closed

Needs Reprint returns to Ready to Print.

Complete Print does NOT close the order.

---

# Inventory Lifecycle

Estimate

No reservation

Ready to Print

Reserve inventory

Printing

Reservation remains

Print Complete

Capture actual usage

Capture scrap

QC Pass

Consume inventory

Release unused reservation

Cancel

Release reservation

Needs Reprint

Preserve actual usage

Return to Ready to Print

---

# Code Standards

Never duplicate calculations.

Never duplicate render paths.

Never duplicate event handlers.

Never duplicate timers.

Never duplicate observers.

Prefer pure functions.

Prefer immutable data.

Delete obsolete code whenever practical.

Do not layer patches over patches.

---

# UI Standards

Do not redesign pages unless requested.

Preserve:

- layout
- colors
- spacing
- typography
- responsiveness

Refactor behavior separately from visual design.

---

# Database Rules

Never modify the Supabase schema automatically.

If a schema change is required:

1. Explain why.
2. Produce a migration SQL file.
3. Explain affected tables.
4. Explain affected RPCs.
5. Explain affected queries.
6. Update application code.
7. Update tests.
8. Stop.

Never assume the migration has been applied.

Never fabricate schema changes.

---

# Pull Requests

Every PR should contain:

Summary

Files Changed

Reasoning

Testing Performed

Manual Browser Tests Required

Keep PRs focused.

Avoid unrelated cleanup.

---

# Testing

Every milestone should include:

Syntax checks

Regression checks

Relevant assertion tests

git diff --check

Manual browser testing instructions

Never claim browser behavior was verified unless it actually was.

---

# Git Workflow

Always begin from latest main.

Create a feature branch.

Complete one milestone.

Create one Pull Request.

Stop.

Never continue into another milestone automatically.

---

# Coding Philosophy

Simpler beats clever.

Readable beats short.

Maintainable beats impressive.

Business workflow is more important than elegant code.

---

# ERP Goal

The finished ERP should feel like one cohesive application.

Production owns manufacturing.

Quote owns sales.

Orders own fulfillment.

Inventory owns inventory.

Finance owns finance.

Every responsibility should exist exactly once.

---

# When Unsure

Read the repository.

Inspect the implementation.

Understand the existing workflow.

Choose the smallest safe improvement.

If uncertainty remains,

STOP

and explain the options instead of guessing.
