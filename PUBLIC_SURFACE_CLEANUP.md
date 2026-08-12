# Public Surface Cleanup

## 1. Authoritative public surface

The repository now represents three intentional surfaces: the current public product, the active internal ERP, and the frozen active legacy Niles campaign.

### 2. Files retained

**Core public (8):** `index.html`, `collections.html`, `studio.html`, `creations.html`, `collaboration.html`, `community.html`, `about.html`, and `events.html`.

**Customer/support public (7):** `faq.html`, `start-project.html`, `project-received.html`, `quote-response.html`, `track.html`, `pay.html`, and `legal.html`.

**Campaign public (2):** `fundraiser.html` and the unchanged `niles.html`.

**Internal ERP (11):** `hub.html`, `campaign-manager.html`, `customer-360.html`, `erp-handbook.html`, `erp-knowledge-library.html`, `finance-pro.html`, `inventory-control.html`, `orders-admin.html`, `product-recipes.html`, `production-control.html`, and `quote.html`.

## 3. URLs retired

The following 16 filenames remain deployed solely as redirect stubs: `showcase.html`, `real-solutions.html`, `branded-details.html`, `eye-catching-work.html`, `finished-pieces.html`, `from-imagination.html`, `designed-before-printing.html`, `raw-to-refined.html`, `northeast-ohio-3d-printing.html`, `custom-3d-printing-aurora-ohio.html`, `custom-3d-printing-chagrin-falls-ohio.html`, `custom-3d-printing-hudson-ohio.html`, `custom-3d-printing-niles-ohio.html`, `custom-3d-printing-solon-ohio.html`, `custom-3d-printing-streetsboro-ohio.html`, and `custom-3d-printing-twinsburg-ohio.html`.

## 4. Redirect strategy

Each retired filename is a minimal static HTML document. An immediate HTML refresh targets the logical root `/`, an absolute canonical identifies `https://olipoly3d.com/`, `noindex, follow` retires the stale search result, and a visible homepage link provides an accessible fallback. The old filename therefore remains resolvable on static GitHub Pages-style hosting without retaining obsolete content or relying on JavaScript.

## 5. Archived files removed

Removed six archived HTML files: `archive/admin.html`, `archive/index2.html`, `archive/index3.html`, `archive/quote-backup.html`, `archive/quote-lite-backup.html`, and `archive/quote-tool.html`.

## 6. Orphan dependencies removed

Repository-wide reference checks proved `archive/quote-backup.js`, `archive/quote-lite-backup.js`, and `archive/quote-tool.js` were archive-only, so all three were deleted.

Forty-nine retired-branch-only media files were deleted from `images/`: `AI-CAD.png`, `calibration_firstlayer.png`, `cap-design.png`, `cap-solution.png`, `cat-fusion.png`, `cat-real-drawing.png`, `chagrin-falls-art.png`, `cobra.png`, `cpb-keyring.png`, `cpb-magnet.png`, `custom-company-logo-coasters.png`, `designed-before-printing-loop.mp4`, `double-truck.png`, `dragons.png`, `drip-organizer.png`, `drip-with-accys.png`, `fin-ptero.png`, `fin-sabre.png`, `fin-trex.png`, `final-cat.png`, `finished-rocky-enhanced-rotated.mp4`, `flying-dragon.png`, `geauga-lake.png`, `hc-keychain.png`, `hudson-keepsake.png`, `imagination-process.png`, `lit_up_litho.png`, `material-planning.png`, `missing-problem.png`, `mtf-black-coaster.png`, `multipart-spacers.png`, `neo-location.png`, `ninjas.png`, `organization.png`, `poly-fusion.png`, `poly-real-drawing.png`, `poly-real-print.png`, `raw-trex.png`, `red-cupholder-broken.png`, `sb-design.png`, `shark-toys.png`, `solon-business.png`, `sp-keychains.png`, `stones-yellow.png`, `streetsboro-pride.png`, `team-colors-coin.png`, `top_down_spacerplateview.png`, `twinsburg-pride.png`, and `unfin-fin-rocky.png`.

Shared media (`finished-rocky.png`, `funished-cap-bottle.png`, `poly-head.png`, `poly-showcase.png`, and `raw-rocky.png`) and the legacy frame CSS/JS remain because retained pages reference them.

## 7. Sitemap changes

The sitemap changed from 21 URLs (13 retained URLs and 8 local SEO URLs) to 11 truthful, indexable URLs: the homepage, seven other core pages, FAQ, Start Project, and Legal. It excludes transactional/customer-specific surfaces, dynamic fundraiser query URLs, Niles, all retired URLs, archives, and every ERP URL.

## 8. Robots changes

`robots.txt` continues to allow the public site and advertise the sitemap. Its internal ERP exclusions now cover all 11 authoritative ERP filenames. Retired stubs are deliberately not blocked, allowing crawlers to observe their redirect, canonical, and noindex metadata. Customer-task pages use page-level noindex rather than robots blocking.

## 9. Canonical and noindex changes

All retained public pages except the byte-frozen Niles page now have self-referencing canonicals. `project-received.html`, `quote-response.html`, `track.html`, `pay.html`, and the query-driven `fundraiser.html` are `noindex, follow`. Every redirect stub is `noindex, follow` and canonicalizes to the homepage. Niles metadata remains exactly as it was.

## 10. References updated

No retained public HTML linked to a retired filename. Tests that previously treated retired pages as current RC5/public-shell examples were narrowed to retained pages. Historical Markdown was left intact because it documents earlier decisions rather than providing runtime navigation.

## 11. Niles freeze verification

The SHA-256 digest before and after cleanup is `e09e36606edb816d5d1e2f09c1390f7c1f517ccf5af2f788adbb2f3f0973a279`. A focused regression assertion now protects that exact byte identity.

## 12. Customer-task functionality preserved

The cleanup does not change application scripts or workflow markup. Focused assertions preserve the fundraiser campaign query parser, Quote Response `q`/`token` parameters and public RPC names, Track/Pay query handling and `public_order_tracking_lookup`, Project Received, and Stripe/PayPal/Venmo presentation.

## 13. ERP preservation

All 11 ERP HTML applications remain. They were not edited; only their complete search-crawler exclusion list was added to `robots.txt`. Finance source and behavior were not changed.

## 14. Tests

`tests/public-surface-authority.test.js` covers the retained inventories, Niles digest, all redirect contracts, obsolete-content removal, sitemap exclusions, archive deletion, retained-link boundaries, campaign and transactional hooks, payment providers, and indexing boundaries. Existing RC5 tests were updated only where their page inventories contradicted the authoritative disposition. Run the complete suite with `node --test tests/*.test.js`, plus `git diff --check` and the documented hash check.

## 15. Remaining cleanup debt

Historical documents still describe former public branches; they remain intentionally as engineering records. The shared `rc5-legacy-frame` assets cannot be removed because retained campaign/customer pages still load them. No uncertain asset was deleted.

## 16. SEO follow-up items

A later focused initiative should review titles, descriptions, structured data, content strategy, local-search strategy, and Search Console migration/indexing. It should not recreate the retired local landing-page branch by default. Search engines may take time to recrawl redirect stubs and remove stale results.

## 17. Exact file count before and after

Repository HTML count: **50 before**, **44 after**. The final 44 comprise 17 current public files, 11 internal ERP files, and 16 redirect stubs. Six archive HTML files were removed. In addition, 3 archive-only scripts and 49 retired-only media assets were removed.

## 18. Commit hash

Authority baseline: `030d9b0`. The delivery commit is the commit containing this document and is reported by `git rev-parse HEAD` (a commit cannot embed its own SHA because changing the document changes that SHA).
