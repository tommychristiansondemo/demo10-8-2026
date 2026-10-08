# Spec extraction verification report

First pass: Claude Sonnet 4.6 on plain text. Review pass: us.anthropic.claude-opus-4-6-v1 on layout text. Generated 2026-10-06.

## 2023 Altima

- Engine oil and filter (PR25DD): interval_miles 5000 -> 10000, interval_months 6 -> 12. Pages 554 (20k), 556 (30k), 559 (50k), 562 (60k) show oil & filter replacement at every other 5k interval = 10k/12mo repeat.
- Engine oil and filter (KR20DDET): interval_miles 3750 -> 7500, interval_months 6 -> 12. Pages 572 (15k/24mo), 572 (22.5k/36mo), 574 (30k/48mo) show oil & filter replacement at every other 3,750 mi interval = 7,500 mi/12 mo repeat.
- Brake fluid (PR25DD): Changed from two separate records (standard at 20k/24mo + severe at 20k/24mo) to single 'both' record at 10k/12mo. Pages show brake fluid replacement at 20k, 30k, 50k, 60k (standard) and also at 30k, 50k severe essentials — the repeating pattern is every 10k/12mo, not 20k/24mo. Schedule 'standard' -> 'both'. Removed duplicate severe-only record.
- Brake fluid (KR20DDET): interval_miles 15000 -> 7500, interval_months 24 -> 12. Pages 571 (7.5k/12mo), 572 (15k/24mo), 573 (22.5k/36mo), 574 (30k/48mo) all show 'Replace brake fluid' under both standard and severe essentials — every 7,500 mi/12 mo.
- CVT fluid inspect (PR25DD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Pages 554 (20k), 555 (30k) show CVT fluid inspection at every other standard interval = 10k/12mo. Split into separate PR25DD record.
- CVT fluid inspect (KR20DDET): Created separate record at 15000/24 for KR20DDET. Pages 571 (15k), 572 (22.5k), 573 (30k) show CVT fluid inspection.
- CVT fluid replace (severe): Changed applies_to from PR25DD to KR20DDET. Page 578 shows 'Replace CVT transmission fluid' at 60,000 mi/96 mo in the KR20DDET schedule (not PR25DD). The 60k milestone is in the KR20DDET section (pages 571-581).
- Engine drive belts (PR25DD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Pages 554 (20k), 555 (25k), 556 (30k), 559 (55k) show engine drive belt inspections at every standard interval including odd 5k intervals, but the consistent pattern for the 'full' inspection block is every 10k/12mo.
- Engine drive belts (KR20DDET): interval_months 24 -> 12. Pages 571 (11.25k/18mo), 572 (22.5k/36mo), 573 (30k/48mo) show engine drive belt inspections at every 7,500 mi/12 mo interval.
- Brake lines and cables (PR25DD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Pages 554 (20k), 555 (30k) show brake lines inspection at every other standard interval = 10k/12mo.
- Brake pads and rotors (KR20DDET): interval_miles 7500 -> 3750, interval_months 12 -> 6. Pages 571 (7.5k severe + 11.25k severe + 15k standard), etc. show brake pads inspected at every interval = 3,750 mi/6 mo.
- Exhaust system (KR20DDET): interval_miles 7500 -> 3750, interval_months 12 -> 6. Pages show exhaust inspected at every severe interval = 3,750 mi/6 mo.
- Steering gear and linkage (KR20DDET): interval_miles 7500 -> 3750, interval_months 12 -> 6. Pages show steering inspected at every severe interval = 3,750 mi/6 mo.
- Axle and suspension parts (KR20DDET): interval_miles 7500 -> 3750, interval_months 12 -> 6. Pages show axle & suspension inspected at every severe interval = 3,750 mi/6 mo.
- Drive shaft boots (KR20DDET): interval_miles 7500 -> 3750, interval_months 12 -> 6. Pages show drive shaft boots inspected at every severe interval = 3,750 mi/6 mo.
- Differential gear oil inspect (AWD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Pages 554 (20k), 555 (25k/30k) show differential oil inspection at every other standard interval = 10k/12mo.
- Transfer case oil inspect (AWD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Same pattern as differential gear oil.
- Differential gear oil replace severe (AWD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Page 554 shows first severe replacement at 20k; appears to repeat at every other severe interval.
- Transfer case oil replace severe (AWD): interval_miles 20000 -> 10000, interval_months 24 -> 12. Same pattern as differential gear oil severe replacement.
- Fuel tank vapor vent system (PR25DD): interval_miles 20000 -> 15000, interval_months unchanged at 24. Pages 554 (20k) and 555 (30k) show it appears at 20k and 30k but not 25k — the pattern across the full schedule (20k, 30k, 45k, 60k, 75k, 90k) suggests approximately every 15k.
- Fuel lines and connections (PR25DD): interval_miles 20000 -> 15000, interval_months unchanged at 24. Same pattern as fuel tank vapor vent system.
- Engine coolant capacity (PR25DD): Corrected from '16-1/4 gal (FWD); 16 gal (AWD)' to '2-1/4 gal' per page 586. The 16-1/4 gal and 16 gal figures are FUEL TANK capacities, not coolant. Page 586 clearly shows engine coolant with reservoir: PR25DD = 8.3L / 2-1/4 gal.
- Engine coolant: Merged into single 'all' fluid entry with both engine capacities noted. KR20DDET coolant capacity confirmed as 8.2L / 2-1/8 gal per page 586.

## 2023 Armada

- Drive belts interval_miles: 60000 -> 15000 (with first_at_miles 60000); pages 554, 556, 558, 560, 562 show inspections at 60k/75k/90k/105k/120k = every 15,000 miles after first at 60,000
- Drive belts interval_months: 48 -> 12 (with first_at_months 48); consistent with 15,000-mile repeat interval
- Engine coolant interval_miles: 105000 -> 75000; page 560 footnote (2) states 'After first replacement, replace every 75,000 miles (120,000 km) or 60 months'; the repeat interval is 75,000 not 105,000
- Engine coolant interval_months: 84 -> 60; page 560 footnote (2) states repeat interval is 60 months after first at 84 months
- Intelligent Key battery replace interval_miles: 45000 -> 22500; pages 552, 555, 558, 561 show replacements at 45,000/67,500/90,000/112,500 = every 22,500 miles, with first_at_miles=45000
- Intelligent Key battery replace interval_months: 36 -> 18; consistent with 22,500-mile repeat pattern
- Fuel capacity: '21-5/8 gal' -> '26 gal (US)'; page 566 shows US Measure = 26 gal, Imperial Measure = 21-5/8 gal. The first-pass confused Imperial for US.
- Fuel specification updated to clarify 26 gal US / 21-5/8 gal Imperial per page 566
- source_pages: removed 608, 609, 610 (index pages with no maintenance data extracted)

## 2023 Frontier

- Intelligent Key battery (standard): interval_miles 45000/interval_months 36 -> 22500/18, first_at_miles 45000/first_at_months 36 added; pages 498 (45k), 502 (67.5k), 505 (90k), 509 (112.5k) show 22,500-mile/18-month repeat pattern
- Intelligent Key battery (standard): Added separate inspect entry at 22,500 mi/18 mo per page 495 which shows 'Inspections: Intelligent Key battery' under standard at 22,500 mi/18 mo
- Engine drive belts (standard): interval_miles 30000/interval_months 24 -> 15000/12 with first_at_miles 60000/first_at_months 48; pages 500 (60k), 503 (75k), 505 (90k), 507 (105k), 509 (120k) show ~15k interval after first at 60k
- Engine coolant (standard): interval_miles 105000 -> 75000, interval_months 84 -> 60; the 105k/84mo is the first_at value, repeat is 75k/60mo per footnote (4) on page 508
- Brake lines and cables (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at 15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k per pages 494, 496, 498, 500, 503, 505, 507, 509
- Brake pads and rotors (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at every 15k standard milestone per pages 494, 496, 498, 500, 503, 505, 507, 509
- Drive shaft boots (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at every 15k standard milestone
- Propeller shaft (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at every 15k standard milestone
- Differential gear oil (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at 15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k
- Transfer fluid (standard): interval_miles 30000 -> 15000, interval_months 24 -> 12; appears at 15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k
- Automatic transmission fluid (standard): interval noted as 30000 repeat -> actually 15000/12 repeat; appears at 15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k per pages 494, 496, 498, 500, 503, 505, 507, 509
- Brake fluid (severe): interval_miles 15000/interval_months 12 -> 10000/12; severe brake fluid replace appears at 10k, 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k per pages 494-508
- Transfer fluid (severe): applies_to VQ38DD -> 4WD models; transfer case is 4WD-specific
- Intelligent Key battery (severe): removed; page 495 at 15,000/18mo shows Intelligent Key battery inspection under STANDARD not severe. No severe-specific Intelligent Key entry found in pages.
- Removed pages 557, 560 from source_pages as they are just index pages not containing maintenance data
- oil_life_monitor: 'Not described in the provided pages.' -> '' (empty string per schema convention)

## 2023 Kicks

- Brake fluid: split into separate standard and severe entries. Original had only standard at 30k/24mo. Severe schedule shows replacement at every 10,000 mi/12 mo (pages 493, 495, 497, 498, 500, 502, 503, 505, 507, 508, 510). Standard remains 30,000 mi/24 mo (pages 496, 501, 506).
- Brake fluid notes: removed incorrect claim that first standard occurrence is at 10,000 mi/12 mo — 10k is severe only (page 493). Cleaned up confused month/mileage pattern in notes.
- In-cabin microfilter interval_miles: 30000 -> 15000. Schedule shows replacement at 15k, 30k, 45k, 60k, 75k, 90k, 105k — every 15,000 miles (pages 493, 496, 498, 501, 504, 506, 509).
- In-cabin microfilter notes: corrected to include 60,000 miles which was missing from original notes (page 501).
- CVT fluid inspect interval_miles: 30000 -> 15000. CVT fluid is inspected every 15,000 miles per standard schedule (pages 493, 496, 498, 501, 503, 506, 508).
- CVT fluid replace: corrected notes — page 502 shows 60k/72mo (severe schedule), not 48 months as originally stated. Removed unsupported claims about 90k and 105k CVT fluid replacement from standard schedule.
- Spark plugs interval_months: 84 -> null. Page 509 footnote (2) explicitly states 'Performed based on mileage only.'
- Engine coolant interval_miles: 105000 -> 75000. The repeat interval after first replacement is 75,000 miles/60 months per page 509 footnote (3). first_at_miles remains 105000, first_at_months remains 84.
- Brake pads, rotors, drums and linings: split from 'both' with interval 7500 into separate standard (15,000 mi, no months) and severe (5,000 mi/6 mo) entries. Standard schedule shows inspection at 15k, 30k, 45k, 60k, 75k, 90k, 105k — not every 7,500 miles. Pages 493, 496, 498, 501, 503, 506, 508.
- Steering gear and linkage: split from 'both' into separate standard (30,000 mi) and severe (5,000 mi/6 mo) entries per schedule pages.
- Axle and suspension parts: split from 'both' into separate standard (30,000 mi) and severe (5,000 mi/6 mo) entries per schedule pages.
- Exhaust system: split from 'both' into separate standard (30,000 mi) and severe (5,000 mi/6 mo) entries per schedule pages.
- Drive shaft boots: split from 'both' into separate standard (15,000 mi) and severe (5,000 mi/6 mo) entries per schedule pages.
- Intelligent Key battery replace interval_miles: 45000 -> 22500. Schedule shows replacement at 45k, 67.5k, 90k, 112.5k — every 22,500 miles (pages 498, 502, 506, 510).
- Intelligent Key battery replace interval_months: null -> 18. Interval is approximately 18 months based on schedule pattern.
- Engine drive belt inspect interval_miles: 60000 -> 15000 with first_at_miles 60000. Appears at 60k, 75k, 90k, 105k — first at 60k then every 15k (pages 501, 503, 506, 508).
- Removed page 162 from source_pages — contains only power window information, not relevant to maintenance.
- Removed pages 538-541 from source_pages — index pages only.
- oil_life_monitor: 'Not described in the provided pages.' -> '' (empty string per schema convention).

## 2023 Leaf

- Intelligent Key battery replace: notes old -> 'then at 75k/60mo, 90k/72mo, 112.5k/90mo, 120k/96mo' new -> 'then at 67,500/54mo, 90k/72mo, 112.5k/90mo (approximately every 18 months after first replacement)'. Per pages 572 (45k/36mo first replace), 574 (67.5k/54mo), 576 (90k/72mo), 577 (112.5k/90mo). The original incorrectly listed 75k/60mo as a replacement point; page 574 shows 67.5k/54mo is the replace, while 75k/60mo has no Intelligent Key battery action. Also 120k/96mo is not listed as a replacement point on page 577 (120k shows standard inspections only, no IK battery replace).
- Extraction caveat 5: old -> 'then at 75k/60mo, 90k/72mo, 112.5k/90mo, 120k/96mo' new -> 'then at 67,500/54mo, 90,000/72mo, 112,500/90mo'. Corrected per pages 574, 576, 577. The interval is approximately every 18 months, not 30 months as originally stated.
- Added extraction caveat 12 noting that severe-use items at 15,000 miles per page 571 do NOT include brake pads & rotors or drive shaft boots (those only appear at 7,500 severe). The first-pass JSON had these items listed at 15,000 severe which is not supported — however they were not present in the maintenance_items at 15,000 severe, so no item removal was needed. The existing severe items at 15,000 (axle & suspension, front suspension ball joints, steering gear and linkage, steering linkage ball joints, brake fluid) are correct per page 571.

## 2023 Murano

- Engine coolant interval_miles: 105000 -> 75000 (repeat interval after first replacement per page 471 footnote 3: 'After first replacement, replace every 75,000 miles (120,000 km) or 60 months')
- Engine coolant interval_months: 84 -> 60 (repeat interval after first replacement per page 471 footnote 3)
- Differential gear oil (standard) interval_miles: 20000 -> 60000 (standard schedule shows replacement at 60,000 miles only per page 463; 20,000-mile interval is severe schedule per page 454)
- Differential gear oil (standard) interval_months: 24 -> null (no month interval shown for standard schedule replacement; mileage-based only)
- Transfer case oil (standard) interval_miles: 20000 -> 60000 (standard schedule shows replacement at 60,000 miles only per page 463; 20,000-mile interval is severe schedule per page 454)
- Transfer case oil (standard) interval_months: 24 -> null (no month interval shown for standard schedule replacement; mileage-based only)
- Engine air cleaner filter interval_months: 24 -> null (no month interval shown in schedule pages; replacement at 30,000/60,000/90,000 miles only per pages 456, 462, 468)
- Engine oil and filter (severe) interval_miles: 10000 -> 5000 (severe schedule shows oil replacement at every severe interval: 10k, 15k, 20k, 25k, 30k, etc. — i.e. every 5,000 miles, per pages 452-473)
- Engine oil and filter (severe) interval_months: 12 -> 6 (severe intervals are spaced approximately 6 months apart per the schedule pages)
- Brake fluid (severe): changed to first_at_miles=10000, first_at_months=12, interval_miles=20000, interval_months=24 (first replacement at 10,000 mi/12 mo per page 452, then every 20,000 miles per pages 456/460/464/469/472)
- Engine drive belt inspect: first_at_miles added as 60000, first_at_months as 48; interval changed to 15000 mi / 12 months to reflect inspections at 60k/75k/90k/105k per pages 462/465/468/471 (first at 60k, then every 15k)
- Evaporative emissions control vapor lines interval_months: 24 -> null (starred item, no month interval shown in schedule)
- Fuel lines and connections interval_months: 24 -> null (starred item, no month interval shown in schedule)
- Fuel tank vapor vent system interval_months: 24 -> null (starred item, no month interval shown in schedule)
- Added Brake pads and rotors (severe) as separate item — inspected at every severe interval per pages 452-473
- Added Transfer case oil as separate fluid entry (page 476 lists it separately from differential gear oil with same spec)
- Removed page 157 from source_pages (power windows page, not relevant to maintenance)
- Removed pages 510, 513 from source_pages (index pages, not primary maintenance content)

## 2023 Pathfinder

- Tire rotation applies_to: 'VQ35DD' -> 'all', no engine-specific qualifier in schedule pages (pp. 602-613)
- Brake fluid interval_miles: 30000 -> 20000, interval_months: 36 -> 24; standard schedule shows replacement at 20k, 40k, 60k, 80k, 100k, 110k (pp. 603, 605, 607, 609, 611, 613); severe shows at every interval including 10k (p. 602). The dominant standard pattern is every 20,000 miles, not 30,000.
- Brake fluid notes: corrected to reflect actual schedule appearances per pages 602-613
- In-cabin microfilter: added first_at_miles=15000 and first_at_months=18 (was missing from JSON though described in notes), per page 603 (15k milestone)
- Intelligent Key battery: added first_at_miles=15000 and first_at_months=18 (was missing from JSON though described in notes), per page 603 (15k milestone)
- Engine coolant interval_miles: 105000 -> 75000, interval_months: 84 -> 60; the repeat interval after first service is 75,000 miles/60 months per footnote (3) on page 612. first_at_miles=105000 and first_at_months=84 remain correct.
- Brake lines and cables interval_miles: 20000 -> 10000, interval_months: 24 -> 12; standard schedule shows this inspection at 10k (p. 602), 20k (p. 603), 30k (p. 604), 40k (p. 605), etc. — every 10,000 miles, not 20,000.
- Brake pads and rotors interval_miles: 10000 -> 5000, interval_months: 12 -> 6; severe schedule shows inspection at 5k (p. 602), so the minimum interval is 5,000 miles/6 months.
- Exhaust system interval_miles: 10000 -> 5000, interval_months: 12 -> 6; severe schedule shows inspection at 5k (p. 602).
- Drive shaft boots interval_miles: 10000 -> 5000, interval_months: 12 -> 6; severe schedule shows inspection at 5k (p. 602).
- Propeller shaft interval_miles: 10000 -> 5000, interval_months: 12 -> 6; severe schedule shows inspection at 5k (p. 602).
- Steering gear and linkage interval_miles: 10000 -> 5000, interval_months: 12 -> 6; severe schedule shows inspection at 5k (p. 602).
- Differential gear oil (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12; standard schedule shows inspection at 10k (p. 602), 20k (p. 603), 30k (p. 604), etc.
- Coupling oil (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12; standard schedule shows inspection at 10k (p. 602), 20k (p. 603), 30k (p. 604), etc.
- Transfer fluid (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12; standard schedule shows inspection at 10k (p. 602), 20k (p. 603), 30k (p. 604), etc.
- Drive belts interval_miles: 40000 -> 10000, added first_at_miles=40000 and first_at_months=48; first appears at 40k (p. 605), then at 50k (p. 606), 60k (p. 607), 70k (p. 608), 80k (p. 609), 90k (p. 610), 100k (p. 611), 110k (p. 613) — every 10,000 miles after first appearance.
- Brake fluid severe schedule: severe schedule shows replacement at every interval starting at 10k (p. 602), 20k (p. 604), 30k (p. 605), etc. — effectively every 10,000 miles. Kept combined as 'both' with 20k interval since standard is the governing repeat.
- extraction_caveats: updated caveats 3, 5, 12, 16, 17 to reflect corrected intervals and added note 16 and 17

## 2023 Rogue

- Engine air filter KR15DDT: interval_months old 48 -> 48 is actually correct per schedule (first at 30,000 mi/48 mo, repeats every 30,000 mi). However, checking pages: KR15DDT schedule shows engine air filter replaced at 30,000/48mo, 60,000/96mo, 90,000/144mo — that's every 30,000 miles / 48 months. 48 months is correct. No change needed.
- Engine drive belt PR25DD: first_at_miles should be 40,000, first_at_months 48, then interval_miles 10,000, interval_months 12 — the JSON has interval_miles=40000 which is the FIRST occurrence, not the repeat interval. Adding first_at_miles=40000, first_at_months=48, changing interval_miles to 10000, interval_months to 12. Page 539 (40k first), then 540 (50k), 541 (60k), 542 (70k) etc.
- Engine drive belt KR15DDT: first_at_miles should be 30000, first_at_months 48, then interval_miles 7500, interval_months 12. JSON has interval_miles=30000 which is the FIRST occurrence. Changing interval_miles to 7500, interval_months to 12. Page 552 (30k first), then 553 (37.5k), 554 (45k) etc.
- Intelligent Key battery PR25DD inspect: interval_miles old 15000 -> 15000 is correct (first check at 15k). But the repeat is also every 15,000 miles since it appears at 15k, 45k, 75k, 105k. Correct as-is.
- Intelligent Key battery KR15DDT inspect: interval_miles 11250 is correct (first at 11,250). Repeat is also 11,250. Correct.
- Brake fluid PR25DD standard: checking schedule — appears at 20k, 40k, 60k, 80k, 100k, 120k = every 20,000 miles/24 months. Correct.
- Brake fluid KR15DDT standard: appears at 15k/24mo, 30k(no - checking 22,500 has no brake fluid), 45k/72mo has brake fluid... Wait: KR15DDT schedule: 7.5k has brake fluid (severe essential), 15k has brake fluid (standard essential), 22.5k has brake fluid (severe essential), 30k has brake fluid (severe essential + standard at 30k? checking p552: 30k standard essentials include 'Replace brake fluid'). Actually checking more carefully: 15k/24mo (p550) standard has Replace brake fluid. 30k/48mo (p552) standard has Replace brake fluid. 45k/72mo (p554) standard has Replace brake fluid. So interval is 15,000 miles / 24 months. Correct.
- Brake fluid KR15DDT severe: checking schedule — severe brake fluid appears at 7.5k, 15k, 22.5k, 30k etc. = every 7,500 miles / 12 months. Correct.
- Brake fluid PR25DD severe: checking schedule — severe brake fluid at 10k, 20k, 30k etc. = every 10,000 miles / 12 months. Correct.
- CVT fluid KR15DDT severe: checking p532 — the severe CVT fluid replacement note says 'If using a car-top carrier, or towing a trailer, or using a camper, or driving on rough or muddy roads: Replace the CVT fluid every 60,000 miles (96,000 km)...' This applies to all models. Also KR15DDT schedule at 60k (p556) severe essentials do NOT show 'Replace CVT fluid' — only PR25DD 60k and 120k show it. But the text on p532 doesn't distinguish engines. Checking KR15DDT 60k severe (p556): severe essentials show 'Replace brake fluid' only, no CVT fluid. However the general note on p532 applies to all. The KR15DDT schedule only goes to 90k so the 60k severe CVT replacement isn't shown in the schedule grid. But the text note on p532 doesn't specify engine. Keeping as-is since p532 text applies generally.
- KR15DDT schedule: no spark plugs or engine coolant replacement listed through 90,000 miles/144 months. Confirmed — no items to add.
- PR25DD schedule runs to 120,000 miles/144 months per p533 and p536. Confirmed.
- Checking Intelligent Key battery replace intervals: PR25DD replace at 30k, 60k, 90k, 120k = every 30,000 miles/36 months. Correct. KR15DDT replace at 22.5k, 45k, 67.5k, 90k = every 22,500 miles/36 months. Correct.
- In-cabin microfilter PR25DD: appears at 15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k = every 15,000 miles/18 months. Correct.
- In-cabin microfilter KR15DDT: appears at 11.25k, 22.5k, 33.75k, 45k, 56.25k, 67.5k, 78.75k, 90k = every 11,250 miles/18 months. Correct.
- Fuel tank vapor vent system PR25DD: appears at 20k, 40k, 60k, 80k, 100k, 120k = every 20,000 miles/24 months. Correct.
- Fuel tank vapor vent system KR15DDT: appears at 15k, 30k, 45k, 60k, 75k, 90k = every 15,000 miles/24 months. Correct.
- Spark plugs PR25DD: 105,000 miles only, no months. Correct per p546.
- Engine coolant PR25DD: first at 105,000 mi/84 mo, then every 75,000 mi/60 mo. Correct per p546 footnote (3).
- PR25DD schedule header says 'After 120,000 miles (192,000 km)/144 months' per p536. KR15DDT says 'After 90,000 miles (144,000 km)/144 months' per p549. Confirmed.
- Engine drive belt PR25DD: adding first_at_miles=40000, first_at_months=48, changing interval_miles from 40000 to 10000, interval_months from 48 to 12
- Engine drive belt KR15DDT: adding first_at_miles=30000, first_at_months=48, changing interval_miles from 30000 to 7500, interval_months from 48 to 12
- KR15DDT severe CVT fluid: The 60k severe page for KR15DDT (p556) does NOT list 'Replace CVT fluid' under severe essentials. Only PR25DD 60k (p541/548) and 120k (p548) list it. However p532 text note applies generally. Keeping the item but noting it comes from the general text note on p532, not the KR15DDT schedule grid.
- Checking whether 'Replace CVT fluid' appears in KR15DDT severe schedule at any mileage: scanning all KR15DDT pages (549-560). None of the severe essentials sections list 'Replace CVT fluid'. The note on p532 about replacing CVT fluid every 60,000 miles under severe conditions doesn't specify engine. Keeping the KR15DDT severe CVT fluid item as derived from p532 general note.

## 2023 Sentra

- Brake fluid: interval_miles changed 20000 -> 10000, interval_months changed 24 -> 12; per pages 492-505 the combined standard+severe pattern shows brake fluid replacement at nearly every 10k milestone (standard at 20k,60k,70k,80k,100k,120k; severe at 10k,30k,40k,50k,90k,110k). Added separate severe schedule entry for brake fluid.
- Brake fluid: added separate 'severe' schedule entry to capture the severe-only replacement milestones (10k,30k,40k,50k,90k,110k) per pages 492,494,497,502,505.
- CVT fluid inspect: interval_miles changed 20000 -> 10000, interval_months changed 24 -> 12; the CVT fluid inspection appears at 20k,30k,60k,70k,80k,90k,100k,120k — approximately every 10k in the standard schedule per pages 493,494,497,499,500,501,502,505.
- Manual transmission gear oil inspect: interval_miles changed 20000 -> 10000, interval_months changed 24 -> 12; same pattern as CVT fluid inspection per pages 493,494,497,499,500,501,502,505.
- Drive belt inspect: interval_miles changed 60000 -> 10000, interval_months changed 72 -> 12; the drive belt is inspected as part of 'engine drive belts and hose inspections' at every standard interval, and with * marking at 60k,70k,80k,90k,100k,120k per pages 492-505. The first formal appearance is well before 60k.
- Brake lines and cables: interval_miles changed 20000 -> 10000, interval_months changed 24 -> 12; appears at 20k,30k,60k,70k,80k,90k,100k,120k per pages 493,494,497,499,500,501,502,505.
- Intelligent Key battery: notes corrected — removed 75k and 120k from the replacement list. Per pages 494,498,502, the pattern is 30k,60k,90k. Page 499 shows 75k replacement which breaks the 30k pattern; kept 30k/36mo as base interval with note about 75k anomaly.
- Evaporative emissions control vapor lines: notes corrected to reflect actual schedule appearances at 20k,60k,80k,100k,120k per pages 493,497,500,502,505 (not at 40k as originally noted).
- Extraction caveats: updated to reflect corrected brake fluid complexity, Intelligent Key battery 75k anomaly, and corrected intervals for drive belt, brake lines, CVT/MT fluid inspections.

## 2023 Titan

- Brake fluid schedule: 'standard' -> 'both'; first_at_miles 10000 is from severe essentials (p.545), standard first appears at 30,000 (p.549). Interval kept at 20,000 as approximate repeat. p.545, p.547, p.549, p.551, p.553, p.555, p.556, p.557, p.559, p.561, p.562, p.566
- Differential gear oil schedule: 'standard' -> 'both'; appears in both standard essentials (20k, 40k, 60k, 80k) and severe essentials (20k, 40k, 60k, 80k). p.547, p.551, p.555, p.556, p.559
- Transfer case oil schedule: 'standard' -> 'both'; appears in both standard and severe essentials at same intervals. p.547, p.551, p.555, p.556, p.559
- Severe brake pads/rotors interval_miles: 10000 -> 5000; severe inspections appear at every 5,000-mile severe interval (10k, 15k, 20k, 25k, 30k, 35k, etc.). p.545, p.546, p.547, p.548, p.549, p.550
- Severe brake pads/rotors interval_months: 10 -> null; severe intervals are not on a consistent month pattern. p.545-p.566
- Severe steering gear interval_miles: 10000 -> 5000; same reasoning as brake pads. p.545-p.566
- Severe steering gear interval_months: 10 -> null; same reasoning. p.545-p.566
- Severe axle/suspension interval_miles: 10000 -> 5000; same reasoning. p.545-p.566
- Severe axle/suspension interval_months: 10 -> null; same reasoning. p.545-p.566
- Severe drive shaft boots interval_miles: 10000 -> 5000; same reasoning. p.545-p.566
- Severe drive shaft boots interval_months: 10 -> null; same reasoning. p.545-p.566
- Severe exhaust system interval_miles: 10000 -> 5000; same reasoning. p.545-p.566
- Severe exhaust system interval_months: 10 -> null; same reasoning. p.545-p.566
- Differential gear oil (front) capacity: was '2-5/8 pt (Non-XD); 3-1/4 pt (XD)' which matches p.572 Front row. Previously labeled as 'rear' in first-pass. Swapped front/rear labels to match p.572 table layout: Front row shows 2-5/8 pt (Non-XD) / 3-1/4 pt (XD); Rear row shows 4-7/8 pt (Non-XD) / 5-1/2 pt (XD). p.572
- Differential gear oil (rear) capacity: was '4-7/8 pt (Non-XD); 5-1/2 pt (XD)' which matches p.572 Rear row. Previously labeled as 'front' in first-pass. Labels corrected. p.572
- Intelligent Key battery notes: old 'Replace at 45,000 miles/36 months; 67,500 miles/54 months (inspect); 90,000 miles/72 months; 112,500 miles/90 months' -> corrected to note that 67,500/54mo is a replacement not just inspect per p.557 essentials. p.548 (22,500 inspect), p.552 (45,000 replace), p.557 (67,500 replace), p.561 (90,000 replace), p.566 (112,500 replace)
- Steering stopper cap interval_miles: 10000 -> 5000; appears at nearly every severe interval which is every ~5,000 miles. p.545, p.547, p.548, p.549, p.550, p.553, p.554, p.556, p.559, p.560, p.562, p.563, p.566
- Steering stopper cap schedule: 'standard' -> 'both'; appears in both standard and severe essentials. p.545-p.566
- Extraction caveats updated to clarify front/rear differential capacity labels per p.572 table and to note brake fluid first service context.

## 2023 Z

- Intelligent Key battery: action changed from 'inspect' to 'replace', interval_miles changed from 15000 to 30000, interval_months changed from 18 to 36, added first_at_miles=15000 and first_at_months=18. Per pages 363-373: 'Inspect intelligent Key battery' at 15k; 'Replace intelligent Key battery' at 30k, 60k, 90k, 120k. The repeat replacement interval is 30,000 miles/36 months with first inspect at 15k.
- Engine coolant: interval_miles changed from 105000 to 75000, interval_months changed from 84 to 60. The first replacement is at 105,000 mi/84 months (first_at fields), but the repeat interval after that is 75,000 miles/60 months per footnote (2) on page 372.
- Engine oil specification: corrected 'GF6' to 'GF-6' per page 376 which shows 'GF-6'.

## 2024 Altima

- Engine coolant interval_miles: 105000 -> 75000 (repeat interval is 75,000 miles per page 558 note '(1) First replacement interval is 105,000 miles...After first replacement, replace every 75,000 miles'); first_at_miles remains 105000
- Engine coolant interval_months: 84 -> 60 (repeat interval is 60 months per page 558 note); first_at_months remains 84
- Spark plugs applies_to: 'all' -> 'PR25DD' (only shown in PR25DD schedule at 105k on page 558; KR20DDET schedule pages up to 90k do not show spark plug replacement)
- Engine coolant (PR25DD) capacity: '16-1/4 gal (FWD); 16 gal (AWD)' -> '2-1/4 gal with reservoir' (page 576 table clearly shows engine coolant with reservoir as 2-1/4 gal for PR25DD; the 16-1/4 gal and 16 gal figures are for Fuel, not coolant)
- Engine coolant (KR20DDET) capacity: '2-1/8 gal (FWD); approx. 2-1/8 gal (AWD)' -> '2-1/8 gal with reservoir' (page 576 shows 2-1/8 gal for KR20DDET coolant with reservoir)
- Fuel capacity: added '16-1/4 gal (FWD); 16 gal (AWD)' to Fuel fluid entry (page 576 shows these are fuel tank capacities, not coolant)
- Brake fluid (KR20DDET) interval_miles: 15000 -> 7500 (pages 562-572 show brake fluid replacement at nearly every interval including 7.5k severe, 15k standard, 22.5k severe, 30k standard, etc.)
- Brake fluid (KR20DDET) interval_months: 24 -> 12 (consistent with 7,500-mile/12-month base interval for KR20DDET)
- CVT fluid inspect: split from 'all' into PR25DD (20k/24mo) and KR20DDET (15k/24mo) since the two engines have different base intervals; KR20DDET schedule shows CVT fluid inspection at 15k, 22.5k, 30k, etc.
- Brake lines and cables: split from 'all' into PR25DD (20k/24mo) and KR20DDET (15k/24mo) per respective schedules
- Brake pads and rotors: split from single 'both' entry into separate standard and severe entries per engine, since PR25DD standard is 20k and severe is 10k, while KR20DDET standard is 15k and severe is 7.5k
- Exhaust system: split from single 'both' entry into separate standard and severe entries per engine
- Steering gear and linkage: split from single 'both' entry into separate standard and severe entries per engine
- Axle and suspension parts: split from single 'both' entry into separate standard and severe entries per engine
- Drive shaft boots: split from single 'both' entry into separate standard and severe entries per engine
- Propeller shaft: split into standard (20k) and severe (10k) entries; applies to AWD models in PR25DD schedule only based on provided pages
- Fuel tank vapor vent system: split from 'all' into PR25DD (20k) and KR20DDET (15k) per respective schedules (pages 546/549/554/557 for PR25DD; pages 562/564/566/570/572 for KR20DDET)
- Fuel lines/connections: split from 'all' into PR25DD (20k) and KR20DDET (15k) per respective schedules
- Added Transfer oil as separate fluid entry in fluids table (page 577 lists it as a separate line item)
- Removed non-maintenance source pages (178, 402, 602, 603, 604, 605) that contain no maintenance data
- In-cabin microfilter (PR25DD) notes: corrected to remove '(skipped)' references that were inaccurate; the filter does appear at 30k per page 548

## 2024 Armada

- Engine coolant interval_miles: 105000 -> 75000 (the repeat interval after first replacement is 75,000 miles/60 months per footnote 2 on page 516; first_at_miles remains 105000)
- Engine coolant interval_months: 84 -> 60 (repeat interval is 60 months per footnote 2 on page 516)
- Spark plugs interval_miles: 105000 -> null (only one replacement at 105,000 shown in the 120k schedule; no repeat interval established; moved 105000 to first_at_miles)
- Spark plugs interval_months: 84 -> null (same reason as above; moved 84 to first_at_months)
- Intelligent Key battery (inspect) interval_miles: 22500 -> null (only one inspect at 22,500 shown on page 506; not a repeating interval; moved to first_at_miles)
- Intelligent Key battery (inspect) interval_months: 18 -> null (same reason; moved to first_at_months)
- Intelligent Key battery (replace) interval_miles: 45000 -> 22500 (replacements at 45k/67.5k/90k/112.5k = every 22,500 miles; first_at_miles=45000, page 508/511/514/517)
- Intelligent Key battery (replace) interval_months: 36 -> 18 (same reasoning, every 18 months after first at 36 months)
- Engine drive belts interval_miles: 60000 -> 15000 with first_at_miles=60000 (inspected at 60k/75k/90k/105k/120k = every 15,000 miles after first at 60k, pages 510/512/514/516/518)
- Engine drive belts interval_months: 48 -> 12 with first_at_months=48 (same reasoning)
- Fuel capacity: '21-5/8 gal' -> '26 gal (US measure) / 21-5/8 gal (Imperial)' (page 520 shows US Measure=26 gal, Imperial Measure=21-5/8 gal; the original only listed Imperial)
- oil_life_monitor: 'Not described in the provided pages. No oil life monitoring system mentioned.' -> '' (no evidence in pages, use empty string)
- Several items applies_to changed from 'VK56VD' to 'all' where the schedule does not restrict to engine code but applies to all variants (e.g. brake items, exhaust, steering, cabin filter, etc.)
- source_pages: removed pages 564, 565, 566 (index pages with no maintenance data)

## 2024 Frontier

- Intelligent Key battery (standard): interval_miles 45000/36mo -> 22500/18mo; pages 486 (22,500 mi inspect), 489 (45,000 mi replace), 492 (67,500 mi replace), 495 (90,000 mi replace), 498 (112,500 mi replace) show a pattern starting at 22,500 mi. The first-pass had 45,000/36 and confused severe references.
- Intelligent Key battery (standard): notes updated to reflect actual page evidence — inspect at 22,500 mi, replace at 45,000/67,500/90,000/112,500 mi per pages 486,489,492,495,498.
- Intelligent Key battery (severe): removed entirely — no severe-schedule Intelligent Key battery item found in the pages. The 15,000 mi/18 mo severe inspect item was not supported; page 486 shows 15,000 mi/18 mo as a severe maintenance block but Intelligent Key battery is NOT listed there.
- Automatic transmission fluid (standard replace at 30,000): removed as separate item — the 30,000 mi standard entry is conditional (inspect via CONSULT, replace only if deterioration >77000), already captured by the ATF inspect item. No unconditional ATF replacement exists in the standard schedule.
- Engine coolant: interval_miles changed from 105000 -> 75000 (repeat interval); first_at_miles remains 105000, first_at_months remains 84. Per page 497 footnote (3): first at 105,000 mi/84 mo, then every 75,000 mi/60 mo.
- Brake fluid (severe): interval_miles 15000 -> 10000; pages show severe brake fluid replacement at 10,000/20,000/30,000/40,000/50,000/60,000/70,000/80,000/90,000/100,000/110,000 mi (every 10,000 mi), not every 15,000 mi. See pages 485 (10,000 mi severe), 486 (20,000 mi severe), 487 (30,000 mi severe), etc.
- Engine drive belts (standard): notes updated — first-pass said 60,000/75,000/90,000/100,000/115,000/120,000 but pages show 60,000/75,000/90,000/105,000/120,000 per pages 491,493,495,497,499. The 100,000 and 115,000 entries are not standard schedule items (those are severe-only milestones).
- oil_life_monitor: changed from 'Not described in the provided pages.' to '' (empty string) since no oil life monitor system is described.
- source_pages: removed 544, 545, 546, 547 (index pages with no maintenance data).

## 2024 Kicks

- Engine coolant interval_miles: 105000 -> 75000 (repeat interval); first_at_miles remains 105000. Page 508 footnote: 'After first replacement, replace every 75,000 miles (120,000 km) or 60 months.'
- Engine drive belts first_at_miles: null -> 60000, first_at_months: null -> 48. interval_miles: 60000 -> 30000, interval_months: 48 -> 24. Pages 501 (60k), 503 (75k), 505 (90k), 507 (105k), 509 (120k) show first at 60k then roughly every 15-30k; using 30k/24mo as the repeat after first at 60k/48mo.
- Air cleaner filter interval_months: 24 -> null. Schedule pages show air cleaner at 30k/60k/90k miles but no explicit month pairing for air cleaner filter replacement.
- Intelligent Key battery interval_miles: 45000 -> 22500, interval_months: 36 -> 18, added first_at_miles: 45000, first_at_months: 36. Pattern is 45k/36mo, 67.5k/54mo, 90k/72mo, 112.5k/90mo = every 22,500 miles / 18 months after first at 45k/36mo. Pages 499, 502, 505, 509.
- CVT fluid (replace) added severe schedule entry for car-top carrier / rough/muddy roads at 30,000 miles per page 492.
- Drive shaft boots (standard) interval_miles kept at 15000 but note updated: appears at every 15k standard interval (15k, 30k, 45k, 60k, 75k, 90k, 105k, 120k per schedule pages).
- Brake lines and cables: added first_at_miles: 15000, first_at_months: 12; interval_miles: 15000 -> 30000 (repeat). First at 15k then at 30k, 45k, 60k, 75k, 90k, 105k, 120k — effectively every 15k but the dominant repeat pattern in the schedule is 30k with some 15k gaps.
- Tire rotation applies_to: HR16DE -> all (chassis item, not engine-specific).
- In-cabin microfilter applies_to: HR16DE -> all (not engine-specific).
- Brake fluid applies_to: HR16DE -> all (both standard and severe).
- Brake pads/rotors/drums/linings applies_to: HR16DE -> all (chassis item).
- Steering gear and linkage applies_to: HR16DE -> all.
- Axle and suspension parts applies_to: HR16DE -> all.
- Drive shaft boots applies_to: HR16DE -> all.
- Exhaust system applies_to: HR16DE -> all.
- Intelligent Key battery applies_to: HR16DE -> all.
- source_pages: removed 162, 536, 537, 538, 539 (no maintenance data on these pages).

## 2024 Leaf

- Reduction gear fluid capacity: '1-1/4 qt' -> '1-1/2 qt'; page 577 US Measure column shows '1-1/2 qt'
- Coolant interval_miles: 125000 -> 75000; the 125,000 mi is the first service, subsequent repeat is 75,000 mi per page 564. The first_at_miles correctly captures 125,000.
- Coolant first_at_months: null -> 180; page 564 states factory fill coolant first replacement at 15 years (180 months)
- Coolant interval_months: null -> 60; subsequent replacement every 5 years (60 months) per page 564
- Intelligent Key battery replace notes updated: the schedule shows replace at 45k/36mo (p568), 67.5k/54mo (p570), 90k/72mo (p572), 112.5k/90mo (p573) — irregular cadence, not every 30 months as originally stated. 67.5k/54mo was missing from original notes.
- source_pages: removed page 440 which is not relevant to maintenance schedules
- extraction_caveats: updated caveat #3 to reflect irregular Intelligent Key battery replace cadence including 67.5k/54mo entry; added caveats #11 and #12

## 2024 Murano

- Tire rotation applies_to: 'VQ35DE' -> 'all' — tire rotation is not engine-specific, applies to all models
- In-cabin microfilter applies_to: 'VQ35DE' -> 'all' — chassis/body item, not engine-specific per p.448
- Brake fluid (standard) applies_to: 'VQ35DE' -> 'all' — chassis/body item per p.448
- Brake fluid (severe) interval_miles: 15000 -> 10000, interval_months: 18 -> 12 — severe schedule shows brake fluid replacement at 10,000 (p.452), 20,000 (p.453), 30,000 (p.455), 40,000 (p.456), 50,000 (p.458), 60,000 (p.460), 70,000 (p.461), 80,000 (p.462), 90,000 (p.464), 100,000 (p.465), 110,000 (p.467) — every 10,000 mi / 12 months, not 15,000/18
- Brake fluid (severe) applies_to: 'VQ35DE' -> 'all' — chassis/body item
- Intelligent Key battery interval_miles: 45000 -> 22500, interval_months: 36 -> 18 — appears at 22,500 (inspection, p.454), then replacement at 45,000 (p.457), 67,500 (p.460), 90,000 (p.464), 112,500 (p.467); repeating interval is 22,500 mi / 18 months
- Intelligent Key battery applies_to: 'VQ35DE' -> 'all' — not engine-specific
- Engine coolant interval_miles: 105000 -> 75000, interval_months: 84 -> 60 — the repeat interval after first replacement is 75,000 mi / 60 months per p.466 footnote; first_at_miles=105000/first_at_months=84 captures the first service
- Differential gear oil (severe replace) interval_miles: 15000 -> 20000, interval_months: 18 -> 24 — severe replacements at 20,000 (p.453), 40,000 (p.456), 60,000 (p.460), 80,000 (p.462), 100,000 (p.465) = every 20,000 mi / 24 months
- Transfer fluid (severe replace) interval_miles: 15000 -> 20000, interval_months: 18 -> 24 — severe replacements at 20,000 (p.453), 40,000 (p.456), 60,000 (p.460), 80,000 (p.462), 100,000 (p.465) = every 20,000 mi / 24 months
- Engine drive belts interval_miles: 60000 -> 15000 with first_at_miles: 60000, first_at_months: 48 — first inspection at 60,000 mi then every 15,000 mi (75k, 90k, 105k) per pp.459/461/463/466
- In-cabin microfilter notes corrected: was listing '15,000 / 45,000 / 60,000 / 90,000 / 105,000' -> actual schedule shows replacement at 15,000 / 30,000 / 45,000 / 60,000 / 75,000 / 90,000 / 105,000 per pp.452/455/457/459/461/464/466
- source_pages: removed 161, 504, 507 — these pages contain no maintenance data (power windows, index pages)
- extraction_caveats: updated caveat 8 to reflect corrected 20,000 mi interval for diff oil and transfer fluid severe replacements; added caveats 9-10 for engine drive belts and Intelligent Key battery patterns

## 2024 Pathfinder

- Exhaust system interval_miles: 10000 -> 20000, interval_months: 12 -> 24. In standard schedule, exhaust system inspection appears at 20k, 40k, 60k, 80k, 100k (pages 600, 602, 604, 606, 608) — NOT at 10k (page 599 standard only lists brake lines/cables, brake pads/rotors, drive shaft boots, propeller shaft, diff/coupling/transfer oil). It does NOT appear at 10k standard.
- Steering gear and linkage interval_miles: 10000 -> 20000, interval_months: 12 -> 24. In standard schedule, steering gear & linkage appears at 20k, 40k, 60k, 80k, 100k (pages 600, 602, 604, 606, 608) — not at 10k standard (page 599 standard does not list it).
- Axle and suspension parts interval_miles: 10000 -> 20000, interval_months: 12 -> 24. Same pattern as steering gear — appears at 20k, 40k, 60k, 80k, 100k in standard schedule (pages 600, 602, 604, 606, 608).
- Brake lines and cables interval_miles: 20000 -> 10000, interval_months: 24 -> 12. In standard schedule, brake lines and cables appear at 10k, 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k (pages 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609).
- Differential gear oil (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12. In standard schedule, differential gear oil inspection appears at 10k, 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k (pages 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609).
- Coupling oil (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12. Same pattern as differential gear oil — appears at every 10k in standard schedule.
- Transfer fluid (inspect) interval_miles: 20000 -> 10000, interval_months: 24 -> 12. Same pattern as differential gear oil — appears at every 10k in standard schedule.
- Brake fluid schedule: standard -> both, interval_miles: 20000 -> 10000, interval_months: 24 -> 12. Standard schedule shows brake fluid replace at 10k (page 600 under 10k essential), 20k, 40k, 60k, 80k, 100k. Severe schedule shows it at every 10k (20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k). Combined effective interval is every 10k for severe and approximately every 20k for standard (but first at 10k). Recording as 'both' with 10k interval.
- Engine coolant interval_miles: 105000 -> 75000, interval_months: 84 -> 60. The repeat interval after first replacement is 75,000 miles / 60 months per footnote on page 609. The first_at values remain 105000/84.
- Engine drive belts interval_miles: 40000 -> 10000, first_at_miles: null -> 40000, first_at_months: null -> 48. The item first appears at 40k then repeats every 10k (50k, 60k, 70k, etc.) per pages 602-609. The repeat interval is 10k, first service at 40k.

## 2024 Rogue

- Engine oil capacity (without filter): '3-1/8 qt' -> '4-7/8 qt', page 567 shows 'Without oil filter change: US Measure 4-7/8 qt'
- Intercooler coolant capacity: '4-7/8 qt (with reservoir)' -> '3-1/8 qt (with reservoir)', page 567 shows intercooler coolant 'With reservoir: US Measure 3-1/8 qt' (the original JSON had swapped the engine coolant without-filter capacity with the intercooler coolant with-reservoir capacity)
- Engine drive belts interval_miles: 30000 -> 7500, first_at_miles: null -> 30000, first_at_months: null -> 48. Per schedule pages 554-562, engine drive belts first appear at 30,000 miles then every 7,500 miles (30,000 / 37,500 / 45,000 / 52,500 / 60,000 / 67,500 / 75,000 / 82,500 / 90,000). The repeat interval is 7,500 miles, not 30,000.
- Intelligent Key battery (replace) interval_miles: 22500 -> 11250, first_at_miles: null -> 22500, first_at_months: null -> 36. Per schedule pages, first replacement at 22,500 then every 11,250 miles thereafter (22,500 / 33,750 / 45,000 / 56,250 / 67,500 / 78,750 / 90,000).
- In-cabin microfilter notes corrected: the repeat interval is 11,250 miles/18 months (not 22,500/36 months). Schedule shows replacement at every 11,250-mile service point: 11,250 / 22,500 / 33,750 / 45,000 / 56,250 / 67,500 / 78,750 / 90,000 per pages 552-562.
- Exhaust system standard interval notes: removed references to 37,500 / 52,500 / 67,500 / 82,500 from standard schedule. Per pages, exhaust system in standard schedule appears at 15,000 / 30,000 / 45,000 / 60,000 / 75,000 / 90,000 (every 15,000 miles). The 37,500 / 52,500 etc. appearances are only under severe use columns.
- Brake fluid standard schedule notes: corrected to remove 'First replacement at 15,000 miles/24 months' phrasing; it simply repeats every 15,000 miles/24 months per schedule pages.
- extraction_caveats caveat 1: corrected to note that page 549 says 120,000 miles/96 months while page 551 KR15DDT header says 90,000 miles/144 months — these are contradictory statements in the manual.
- source_pages: removed page 404 (not relevant to maintenance), removed pages 600/601/602/603 (index pages, not maintenance source content)

## 2024 Sentra

- Engine coolant interval_miles: 105000 -> 75000 (repeat interval after first replacement); first_at_miles remains 105000; first_at_months remains 84. Page 514 footnote (1): 'First replacement interval is 105,000 miles or 84 months. After first replacement, replace every 75,000 miles or 60 months.'
- Engine coolant interval_months: 84 -> 60 (repeat interval after first replacement per page 514 footnote).
- Manual transmission gear oil (replace) schedule: standard -> severe. Pages 505, 507, 509, 511, 513 show 'Replace manual transmission gear oil' only under 'Severe use maintenance: Essentials', not under standard essentials.
- Manual transmission gear oil (replace) interval_miles: 30000 -> 20000; interval_months: 36 -> 24. Severe use replacement appears at 20k, 40k, 60k, 80k, 100k (pages 505, 507, 509, 511, 513), pattern is every 20,000 miles / 24 months.
- Brake fluid (standard) interval_miles: 30000 -> 10000; interval_months: 36 -> 12. Pages show brake fluid replacement under standard essentials at nearly every 10,000-mile milestone (20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k).
- Intelligent Key battery interval_miles: 25000 -> 15000; interval_months: 30 -> 18; first_at_miles: 30000; first_at_months: 36. Pages show replace at 30k, 45k, 60k, 75k, 90k, 105k — first replacement at 30k/36mo, then every 15k/18mo.
- In-cabin microfilter notes updated: also appears at 45k/54mo per page 507, confirming 15k/18mo pattern.
- Engine drive belts first_at_miles: added 40000; first_at_months: added 48. First inspection at 40k/48mo per page 506, then appears at subsequent intervals.
- Engine coolant capacity: '6-7/8 qt (with reservoir) — manual transmission; 7-1/2 qt (with reservoir) — CVT' -> '1-7/8 gal (with reservoir) — manual transmission; 1-7/8 gal (with reservoir) — CVT'. Page 518 shows 1-7/8 gal US for both variants, not quarts.
- Windshield-washer fluid capacity: '2.6 qt (USA); 4.4 qt (Canada)' -> '5/8 gal (USA); 1-1/8 gal (Canada)'. Page 519 shows 5/8 gal US and 1-1/8 gal US (Canada).
- Fuel capacity: '13 gal (approx.)' -> '12-3/8 gal (approx.)'. Page 518 shows 12-3/8 gal US measure.
- Engine oil notes updated: milestones corrected to include 30k, 60k, 90k, 100k which are visible in the pages (pages 505, 509, 512, 513).
- CVT fluid inspect notes updated: also appears at 30k per page 505, confirming it appears at every 10k interval where 20k-spaced items appear.

## 2024 Titan

- Brake fluid: was single 'both' entry with interval_miles=10000/interval_months=12 -> split into two entries: standard schedule 30000 mi/24 mo and severe schedule 10000 mi/12 mo. Per pages 537-559, standard schedule shows brake fluid replacement at 30,000/60,000/90,000 mi; severe shows it starting at 10,000 mi.
- Differential gear oil replace: schedule 'standard' -> 'severe'. Per pages 539, 544, 548, 552, 556, differential gear oil replacement only appears under severe-schedule essentials (20,000 mi/24 mo checkpoints), not under standard maintenance essentials. Standard schedule only inspects differential gear oil.
- Transfer fluid replace: schedule 'standard' -> 'severe'. Per pages 539, 544, 548, 552, 556, transfer fluid replacement only appears under severe-schedule essentials (20,000 mi/24 mo checkpoints), not under standard maintenance essentials. Standard schedule only inspects transfer fluid.
- Engine coolant: interval_miles 105000 -> 75000, interval_months 84 -> 60. The 105,000/84 is the first_at value; the repeat interval after first replacement is 75,000 mi/60 mo per page 557 footnote (2).
- Brake pads and rotors: was single 'both' entry with interval_miles=10000 -> split into standard (15,000 mi/12 mo per page 538) and severe (5,000 mi per pages 537-559). Standard first appears at 15,000 mi not 10,000 mi.
- Steering gear and linkage: was single 'both' entry with interval_miles=10000 -> split into standard (30,000 mi/24 mo, first at 30,000 per page 541) and severe (5,000 mi). Standard first appears at 30,000 mi not 10,000 mi.
- Axle and suspension parts: was single 'both' entry with interval_miles=10000 -> split into standard (30,000 mi/24 mo) and severe (5,000 mi). Standard first appears at 30,000 mi per page 541.
- Drive shaft boots: was single 'both' entry with interval_miles=10000 -> split into standard (15,000 mi/12 mo per page 538) and severe (5,000 mi). Standard first appears at 15,000 mi.
- Exhaust system: was single 'both' entry with interval_miles=10000 -> split into standard (30,000 mi/24 mo per page 541) and severe (5,000 mi). Standard first appears at 30,000 mi.
- Differential gear oil (front) capacity: was labeled 'rear' in original -> corrected to 'front'. Per page 564 table, Front row: Non-XD 2-5/8 pt, XD 3-1/4 pt; Rear row: Non-XD 4-7/8 pt, XD 5-1/2 pt. The original had front/rear labels swapped.
- Differential gear oil (rear) capacity: was labeled 'front' in original -> corrected to 'rear'. Per page 564 table.
- Steering stopper cap lubrication: interval_miles 10000 -> 5000 to reflect it appears at nearly every checkpoint in both schedules.
- Intelligent Key battery inspect: added as separate entry at 22,500 mi/18 mo per page 540, was only mentioned in notes of the replace entry.
- In-cabin microfilter: removed mention of 75,000 mi from notes. Page 551 shows 75,000 mi/90 mo has no standard maintenance (standard says 'Not Applicable. Proceed to next interval'). The in-cabin microfilter at that checkpoint appears on the preceding page for a different mileage.

## 2024 Z

- Brake pads and rotors: split 'both' schedule entry into separate standard (10000mi/12mo) and severe (5000mi/6mo) entries. Pages 370-381 show standard schedule lists brake pads at every 10k interval, severe at every 5k interval.
- Propeller shaft: split 'both' schedule entry into separate standard (10000mi/12mo) and severe (5000mi/6mo) entries. Page 370 shows propeller shaft as 'Essential' under standard 10k maintenance.
- Exhaust system: split 'both' schedule entry into separate standard (20000mi/24mo) and severe (5000mi/6mo) entries. Pages 371, 373, 375, 377, 379, 381 show exhaust system inspection under standard at 20k intervals; severe at every 5k.
- Steering gear and linkage: split 'both' schedule entry into separate standard (20000mi/24mo) and severe (5000mi/6mo) entries. Same pages as exhaust system.
- Axle and suspension parts: split 'both' schedule entry into separate standard (20000mi/24mo) and severe (5000mi/6mo) entries. Same pages as exhaust system.
- Engine drive belts: interval_miles 60000 -> 10000, interval_months 72 -> 12, added first_at_miles 60000, first_at_months 72. Pages 375-381 show engine drive belts inspected at 60k, 70k, 80k, 90k, 100k, 110k, 120k — first at 60k then every 10k.
- Spark plugs: interval_miles 105000 -> null, interval_months 126 -> null, added first_at_miles 105000, first_at_months 126. Page 380 shows spark plugs replaced only at 105k; no repeat within 120k schedule.
- Engine coolant: interval_miles was 105000 -> corrected to 75000, interval_months was 84 -> corrected to 60. Page 380 footnote (1) states first replacement at 105k/84mo, then every 75k/60mo.
- Engine coolant fluid capacity: corrected NISMO capacity from not listed to '11 qt with reservoir' and reservoir from '1/2 qt' to '5/8 qt' per page 384 table.
- Intercooler coolant fluid capacity: corrected reservoir from '1/8 qt' to '1/4 qt' per page 384 table.
- Intelligent Key battery replace interval: confirmed 30000mi/36mo from schedule (30k, 45k, 60k, 75k, 90k, 105k, 120k on pages 372-381). Note: 45k and 75k are listed as 'Replace intelligent Key battery' confirming the interval is actually every 15,000 miles for replacement, not 30,000. However, looking more carefully: 15k=inspect, 30k=replace, 45k=replace, 60k=replace, 75k=replace, 90k=replace, 105k=replace, 120k=replace. The pattern from 30k onward is every 15k. Correcting replace interval to 15000mi/18mo with first_at_miles=30000/first_at_months=36.
- Intelligent Key battery: Re-examining pages: 15k=inspect only, 30k=replace, 45k=replace (page 374), 60k=replace (page 375), 75k=replace (page 377), 90k=replace (page 378), 105k=replace (page 380), 120k=replace (page 381). Replace occurs at 30k then every 15k. Updated replace entry: interval_miles=15000, interval_months=18, first_at_miles=30000, first_at_months=36.
- Engine coolant: added note that it is marked '*' (recommended, not warranty-required) per page 367.
- Extraction caveat 3: updated to reflect correct repeat interval of 10k miles after first at 60k.
- Extraction caveat 14: added NISMO engine coolant capacity difference (11 qt).

## 2025 Altima

- Intelligent Key battery replace: interval_miles 30000 -> 15000, interval_months 36 -> 18; pages 507 (30k), 509 (45k), 511 (60k), 512 (75k), 514 (90k), 515 (105k), 517 (120k) show replacement every 15k after first at 30k. Original noted 50k replacement which is not supported; 45k is correct per page 509.
- Engine coolant replace: interval_miles 105000 -> 75000, interval_months 84 -> 60; page 516 states 'After first replacement, replace every 75,000 miles (120,000 km) or 60 months.' The repeat interval is 75k/60mo, not 105k/84mo. first_at_miles=105000 and first_at_months=84 remain correct.
- CVT fluid inspect: interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show CVT fluid inspection at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k — every 10k starting at 20k.
- Brake lines and cables inspect: interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at 20k, 30k (p507), 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k — every 10k.
- Brake pads and rotors inspect (standard): interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at every 10k milestone from 20k onward.
- Drive shaft boots inspect (standard): interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k.
- Propeller shaft inspect (standard): interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k.
- Differential gear oil inspect: interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k.
- Transfer fluid inspect: interval_miles 20000 -> 10000, interval_months 24 -> 12, first_at_miles=20000, first_at_months=24; pages show inspection at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k.
- Engine drive belts inspect: interval_miles 40000 -> 10000, interval_months 48 -> 12, added first_at_miles=40000, first_at_months=48; pages show first at 40k then every 10k (50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k).
- Brake fluid replace (severe): notes corrected; pages show brake fluid replacement at every severe milestone (15k, 20k, 25k, 30k, 35k, 40k, etc.) — appears every 5k, not every 10k as originally noted. Interval kept at 10000/12 as best approximation but notes updated.
- Removed pages 177, 546, 549 from source_pages as they contain no maintenance data.
- extraction_caveats: updated caveat 4 to correct Intelligent Key battery pattern (30k, 45k, 60k, 75k, 90k, 105k, 120k not 30k, 50k, 75k, 90k, 105k, 120k); added caveats about corrected intervals for inspection items.

## 2025 Armada

- Engine drive belt: interval_miles 60000 -> 10000, first_at_miles null -> 60000, first_at_months null -> 72; the item first appears at 60,000 mi/72 mo then repeats every 10,000 mi/12 mo (pages 587-593 show it at 60k, 70k, 80k, 90k, 100k, 110k, 120k)
- Engine coolant: interval_miles 105000 -> 75000, interval_months 84 -> 60; the first_at values were already correct at 105000/84, but the repeat interval is 75,000 mi/60 mo per footnote on page 592
- extraction_caveats caveat 5: updated to reflect engine drive belt first at 60k then every 10k (was ambiguously worded before)

## 2025 Frontier

- Intelligent Key battery: interval_miles 45000 -> 22500, interval_months 36 -> 18, first_at_miles null -> null, first_at_months null -> null. Page 494 shows first occurrence at 22,500 mi/18 mo (standard). Subsequent standard occurrences at 67,500 mi/54 mo (p500), 90,000 mi/72 mo (p503), 112,500 mi/90 mo (p506) — pattern is every 22,500 mi/18 mo. Notes updated accordingly.
- Intelligent Key battery: schedule 'standard' is correct; the item only appears under standard maintenance columns, not severe.
- Automatic transmission fluid (replace, severe): interval_miles 30000 -> 30000, interval_months 24 -> 24 — confirmed correct. ATF replace appears at 30k/60k/90k severe (pp495,499,503). However this item was recorded with schedule 'standard' which is wrong — it should be 'severe'. Changing schedule from standard to severe.
- Tire rotation: notes corrected. Looking at pages: tire rotation appears at 7,500/15,000/30,000/37,500/45,000/52,500/60,000/67,500/75,000/82,500/90,000/97,500/105,000/112,500/120,000 mi — this is every 7,500 mi after the first. The interval is 7500 mi, not 15000 mi as stated in notes.
- In-cabin microfilter: interval_miles 15000 -> 15000, interval_months 12 -> 12. Appears at 15k/30k/45k/60k/75k/90k/105k/120k — every 15,000 mi. Confirmed correct.
- Engine drive belts: interval_miles 60000 -> 60000, interval_months 48 -> 48. First appears at 60k (p499), then 75k, 90k, 120k. The repeat is not perfectly uniform but first occurrence is 60k. Confirmed.
- Brake fluid (severe): interval_miles 10000 -> 10000, interval_months 12 -> 12. Severe brake fluid replace appears at 10k(p493), 20k(p494), 30k(p496), 40k(p497), 50k(p498), 60k(p500), 70k(p501), 80k(p502), 90k(p504), 100k(p505), 110k(p506). Every 10,000 mi. Confirmed correct.
- Automatic transmission fluid (replace): was recorded with schedule 'standard' but the ATF replacement only appears under 'Severe use maintenance' sections (pp495,499,503). Corrected to schedule 'severe'.
- Spark plugs: noted as (6) on p505 — likely referring to 6 spark plugs. interval 105000/84 confirmed.
- Engine coolant: first_at_miles 105000, first_at_months 84 confirmed from p505 note (3). After first replacement, every 75000 mi/60 mo. Confirmed.
- Propeller shaft grease standard: interval 15000/12 confirmed from p493 (15k standard). Also at 30k/45k/60k/75k/90k/105k/120k standard.
- Transfer fluid (inspect, standard): confirmed at 15k/30k/45k/60k/75k/90k/105k/120k.
- Differential gear oil (inspect, standard): confirmed at 15k/30k/45k/60k/75k/90k/105k/120k.
- Severe oil/filter: 5000/6 confirmed from p492 severe section.
- Severe differential gear oil replace: 20000/24 confirmed from p494 (20k severe). Also 40k/60k/80k/100k.
- Severe transfer fluid replace: 20000/24 confirmed from p494 (20k severe). Also 40k/60k/80k/100k.

## 2025 Kicks Play

- Engine coolant interval_miles: 105000 -> 75000 (the 105,000 is the first_at_miles; the repeat interval is 75,000 mi/60 months per page 496 footnote)
- Engine coolant interval_months: 84 -> 60 (repeat interval is 60 months per page 496 footnote)
- Intelligent Key battery interval_miles: 45000 -> 22500, first_at_miles: null -> 45000 (pages 487/490/493/497 show replacements at 45k/67.5k/90k/112.5k = every 22,500 mi after first at 45k)
- Intelligent Key battery notes: removed erroneous mention of inspection at 22,500 mi (page 484 shows 22,500 mi has Intelligent Key battery as inspect only, not replace; replacements are at 45k/67.5k/90k/112.5k)
- Steering gear and linkage: split from schedule 'both' with interval 7500 into two entries — standard at 30,000 mi/24 months (appears at 30k/60k/90k/120k per pages 485/489/493/497) and severe at 5,000 mi/6 months (pages 482-497 severe columns)
- Axle and suspension parts: split from schedule 'both' with interval 7500 into two entries — standard at 30,000 mi/24 months (appears at 30k/60k/90k/120k per pages 485/489/493/497) and severe at 5,000 mi/6 months
- Drive shaft boots: split from schedule 'both' with interval 7500 into two entries — standard at 15,000 mi/12 months (appears at 15k/30k/45k/60k/75k/90k/105k/120k per pages 483-497) and severe at 5,000 mi/6 months
- Exhaust system: split from schedule 'both' with interval 7500 into two entries — standard at 30,000 mi/24 months (appears at 30k/60k/90k/120k per pages 485/489/493/497) and severe at 5,000 mi/6 months
- Engine drive belts interval_miles: 60000 -> 15000, added first_at_miles: 60000, first_at_months: 48 (first inspection at 60k then every 15k: 60k/75k/90k/105k/120k per pages 489/491/493/495/497)
- Brake fluid severe notes: removed '90,000' from the listed mileages (90k severe column on page 494 does not list brake fluid replacement; the severe brake fluid replacements are at 10k/20k/40k/50k/70k/80k/100k/110k)
- source_pages: removed pages 165, 524, 525, 526, 527 (no maintenance schedule data on those pages)
- Intelligent Key battery applies_to: HR16DE -> all (not engine-specific item)
- 22,500 mi standard schedule (page 484): Intelligent Key battery is listed as inspection only, not replacement — corrected notes accordingly

## 2025 Kicks

- maintenance_items[Intelligent Key battery replace].interval_miles: 30000 -> 15000; pages 634 (30k), 636 (45k), 638 (60k), 639 (75k), 641 (90k), 643 (105k) show replacement every 15,000 miles / 18 months
- maintenance_items[Engine coolant replace].interval_miles: 105000 -> 75000; page 643 footnote (1) states 'After first replacement, replace every 75,000 miles (120,000 km) or 60 months'; the repeat interval is 75k/60mo, first_at is 105k/84mo
- maintenance_items[Engine coolant replace].interval_months: 84 -> 60; page 643 footnote (1) states repeat interval is 60 months after first replacement at 84 months
- maintenance_items[Brake fluid replace standard].interval_miles: 60000 -> 20000; pages show standard brake fluid replacement at 20k (p633), 40k (p635), 60k (p638), 80k (p640), 100k (p642), 120k (p644) — every 20,000 miles / 24 months
- maintenance_items[Brake fluid replace standard].interval_months: 72 -> 24; consistent with 20k mile / 24 month pattern across standard schedule pages
- maintenance_items[Brake fluid replace severe].interval_miles: 15000 -> 5000; severe schedule pages show brake fluid replacement at every 5,000-mile severe service interval (p633 20k severe, p634 25k severe, p635 30k severe, p636 40k severe, etc.)
- maintenance_items[Brake fluid replace severe].interval_months: 18 -> 6; consistent with every 5,000-mile / 6-month severe interval
- maintenance_items[Fuel tank vapor vent system inspect].notes: corrected — pages show inspection at 20k, 40k, 60k, 80k, 100k, 120k (p633, p635, p638, p640, p642, p644); original incorrectly omitted 60k
- maintenance_items[CVT fluid inspect].notes: corrected — pages show CVT fluid inspection at 20k, 30k, 40k, 50k, 70k, 80k, 90k, 100k, 110k (p633, p634, p635, p637, p639, p640, p641, p642, p643); original incorrectly omitted 40k
- maintenance_items[Transfer fluid inspect standard].notes: corrected — pages show transfer fluid inspection at 20k, 30k, 50k, 60k, 70k, 80k, 90k, 100k, 110k, 120k; original incorrectly omitted 60k and 120k
- maintenance_items[Air cleaner filter replace severe]: removed — no separate severe-schedule air cleaner filter replacement found in pages; air cleaner filter replacement appears only in standard schedule at 40k, 80k, 120k
- maintenance_items[Engine drive belts inspect].first_at_miles: null -> 40000; first_at_months: null -> 48; pages show engine drive belt inspection starting at 40k (p635), not before
- severe_conditions: removed third bullet about 'Conditions requiring more frequent brake pad/rotor...' as it was redundant/fabricated detail not directly from pages
- source_pages: removed 195, 676, 677, 678, 679 — these are index/window pages not relevant to maintenance data

## 2025 Leaf

- Reduction gear fluid capacity: '1-1/4 qt' -> '1-1/2 qt', page 574 shows US Measure as '1-1/2 qt'
- Intelligent Key battery replace interval_miles: 45000 -> 22500 with first_at_miles: null -> 45000 and first_at_months: null -> 36, page 565/567/569/570 show replacements at 45k/67.5k/90k/112.5k = every 22,500 mi starting at 45,000
- Cooling system coolant specification: removed '50/50 mix providing protection to −34°F (−37°C)' from specification field — page 574 recommended fluids column only says 'Pre-diluted Genuine NISSAN Long Life Antifreeze/Coolant (blue) or equivalent'; the temperature detail is from page 523 general text, not the fluids table
- Windshield washer fluid specification: 'Genuine NISSAN Windshield Washer Cleaner & Antifreeze fluid or equivalent (Concentrate)' -> 'Genuine NISSAN Windshield Washer Concentrate Cleaner & Antifreeze fluid or equivalent', corrected word order per page 574
- Intelligent Key battery inspect notes updated to clarify it appears only once at 22,500 mi (page 564), not a repeating interval

## 2025 Murano

- Brake lines and cables: schedule changed from 'standard' to 'both' — per pages 533/535, severe schedule also inspects brake lines at 3,750 mi intervals (listed under severe at 7,500 mi as part of off-road check on p.531); however, reviewing more carefully, brake lines & cables only appear in standard schedule columns (7,500, 15,000, 22,500, etc.) and NOT in severe-use sections. Keeping as 'standard'. No change needed actually.
- Steering gear and linkage: standard interval corrected from 7,500/12 to 15,000/24 — per pages 533-549, this item first appears in standard schedule at 15,000 mi/24 mo (p.534) and repeats at 30,000, 45,000, etc. every 15,000 mi. The JSON had interval_miles=7500 which is wrong for standard.
- Exhaust system: standard interval corrected from 7,500/12 to 15,000/24 — per pages 533-549, exhaust system first appears in standard schedule at 15,000 mi/24 mo (p.534) and repeats every 15,000 mi.
- Engine drive belts: first_at_miles added as 30000, first_at_months added as 48, interval changed from 30000/48 to 7500/12 — per pages 536-549, engine drive belts first appear at 30,000 mi/48 mo then appear at every 7,500 mi standard interval thereafter (37,500, 45,000, 52,500, etc.)
- Brake fluid: first_at_miles set to 7500, first_at_months set to 12 — per p.534, brake fluid replace first appears at 7,500 mi/12 mo (under severe essential), then at 15,000 mi/24 mo standard. Reviewing again: at 7,500 mi severe has 'Replace brake fluid' (p.534). Standard first replace is at 15,000 mi/24 mo. The JSON had interval 15000/24 for 'both' which is the standard repeat. Severe also replaces at 7,500 (first), then 15,000, etc. Need to separate or note.
- Intelligent Key battery: action changed from 'replace' to 'inspect' — per p.534, at 11,250 mi the Intelligent Key battery is listed under 'Inspections' not 'Essential/Replace'. At 22,500 (p.535) it says 'Replace Intelligent Key battery'. So first occurrence at 11,250 is inspect, then replace at 22,500. Reviewing p.534 more carefully: '11,250 miles... Standard maintenance: Inspections: • Intelligent Key battery. Essential: • Replace in-cabin microfilter'. So IK battery is inspected at 11,250, then at 22,500 it's replaced. The JSON has it as replace at 11,250 which is wrong.
- Automatic transmission fluid: interval_months corrected — per p.531, replace every 90,000 miles or 144 months. The JSON has 144 months which matches. No change needed.
- Engine coolant: interval_miles for repeat set to 75000, interval_months for repeat set to 60 — per p.548 footnote (3), first replacement at 105,000 mi/168 mo, then every 75,000 mi/60 mo. The JSON has interval_miles=105000 and interval_months=168 which represents the first interval, not the repeat. Should be interval_miles=75000, interval_months=60 with first_at_miles=105000, first_at_months=168.

## 2025 Pathfinder

- Tire rotation applies_to: 'VQ35DD' -> 'all' — tire rotation is a general maintenance item not engine-specific, per pages 599/601
- Brake pads and rotors: split into separate standard and severe entries. Original had schedule='both' with interval 5k/6mo which was the severe interval. Standard schedule shows brake pads at every 10k milestone (10k, 20k, 30k, etc. per pages 601-611). Severe at every 5k (pages 601 onward).
- Exhaust system: split into separate standard and severe entries. Standard interval corrected from 10000/12 to 20000/24 — standard schedule shows exhaust at 20k, 40k, 60k, 80k, 100k (pages 602, 604, 606, 608, 610), NOT at 10k or 30k. Severe remains 5000/6.
- Drive shaft boots: split into separate standard and severe entries. Standard interval 10000/12 is correct (appears at 10k, 20k, 30k, etc.). Severe 5000/6 correct. Original had schedule='both' with only 5k interval.
- Propeller shaft: split into separate standard and severe entries. Standard 10000/12 correct. Severe 5000/6 correct. Original had schedule='both' with only 5k interval.
- Steering gear and linkage: standard interval corrected from 10000/12 to 20000/24 — standard schedule shows this at 20k, 40k, 60k, 80k, 100k (pages 602, 604, 606, 608, 610), NOT at 10k or 30k. Split into standard and severe entries.
- Axle and suspension parts: standard interval corrected from 10000/12 to 20000/24 — same pattern as steering gear. Split into standard and severe entries.
- Brake fluid standard: interval corrected. Per schedule pages, standard brake fluid replacement appears at 10k (p601-602), 20k (p602), 30k (p603-604), 40k (p604), 50k (p605-606), 60k (p606), 70k (p607-608), 80k (p608), 90k (p609-610), 100k (p610). This is every 10,000 mi/12 mo, not first at 10k then 20k repeat. Original notes were incorrect.
- Brake fluid severe: added separate severe entry at 10000/12 — severe schedule also shows brake fluid replacement at 10k (p602), 20k (p603), 30k (p604), 40k (p605), 50k (p606), 60k (p607), 70k (p608), 80k (p609), 90k (p610), 100k (p611). Original had it as 'both' with confused intervals.
- In-cabin microfilter: interval_miles corrected from 15000 to 30000, interval_months from 18 to 36, with first_at_miles=15000, first_at_months=18. Schedule shows 15k, 30k, 60k, 90k, 105k (pages 602, 603, 606, 609, 611). First at 15k then approximately every 30k.
- Intelligent Key battery: added first_at_miles=15000, first_at_months=18. Schedule shows inspection at 15k (p602), then replacement at 30k, 45k, 60k, 75k, 90k, 105k (pages 603, 605, 606, 608, 609, 611). First at 15k then every 30k.
- Engine drive belts: interval_miles corrected from 40000 to 10000, interval_months from 48 to 12, with first_at_miles=40000, first_at_months=48. Schedule shows 40k, 50k, 60k, 70k, 80k, 90k, 100k, 110k — first at 40k then every 10k (pages 604-611).
- Automatic transmission fluid: interval_miles changed from 90000 to null, first_at_miles=90000, first_at_months=108. Only one occurrence in schedule at 90k (page 609). No repeat shown within 120k range.
- Spark plugs: interval_miles changed from 105000 to null, first_at_miles=105000, first_at_months=126. Only one occurrence in schedule at 105k (page 611). No repeat shown within 120k range.
- Engine coolant: interval_miles corrected from 105000 to 75000, interval_months from 84 to 60. First at 105k/84mo, then every 75k/60mo per page 611 note.
- source_pages: removed page 103 (table of contents only, no maintenance data) and page 657 (index page, no maintenance data)

## 2025 Rogue

- Tire rotation: interval_miles 7500 -> 3750, interval_months 12 -> 6, schedule 'standard' -> 'both'. The schedule shows tire rotation at every 3,750-mile/6-month column under standard maintenance (pages 559-570). It appears at 3,750, 7,500, 11,250, 15,000, etc. The severe columns do NOT list tire rotation separately, but it is already covered under standard at every 3,750. Changed to 'both' since it appears at every interval regardless.
- Tire rotation: Reverted schedule to 'standard' since tire rotation only appears under 'Standard maintenance: Essentials' in every column (pages 559-570), never under 'Severe use maintenance'. Interval corrected to 3750 miles / 6 months.
- Brake fluid: interval_miles 15000 -> 15000 confirmed. First appears at 15,000 miles under standard (page 560). Repeats every 15,000 miles. No first_at correction needed.
- In-cabin microfilter: first_at_miles 11250, first_at_months 18 confirmed. Appears at 11,250 (page 560), then 22,500 (page 561), 33,750 (page 563), 45,000 (page 564), etc. The repeat interval is 11,250 miles / 18 months, not 22,500/36. Corrected interval_miles 22500 -> 11250, interval_months 36 -> 18, removed first_at_miles and first_at_months since the interval is consistent at 11,250/18.
- Intelligent Key battery: first_at_miles 11250 (inspect), first replace at 22,500. Looking at pages: 11,250 = inspect (page 560), 22,500 = replace (page 561), 33,750 = replace (page 563), 45,000 = replace (page 564). The replace interval is 11,250 miles / 18 months after first replace at 22,500. Corrected interval_miles 22500 -> 11250, interval_months 36 -> 18. first_at_miles stays 22500 for replace action, first_at_months stays 36.
- Intelligent Key battery inspect: first_at_miles 11250, first_at_months 18 confirmed from page 560. But there's only one inspect at 11,250 then it switches to replace. This is a one-time inspect, then replace every 11,250 after 22,500. Keeping as two separate entries.
- Engine drive belts: interval_miles 30000 -> 15000, interval_months 48 -> 24. First appears at 30,000 (page 562), then 37,500 (page 563), 45,000 (page 564), 52,500 (page 565), 60,000 (page 566), etc. So first_at_miles = 30000, first_at_months = 48, then repeat every 7,500 miles / 12 months. Wait - checking more carefully: 30k, 37.5k, 45k, 52.5k, 60k, 67.5k, 75k, 82.5k, 90k. That's every 7,500 miles after first at 30,000. Corrected interval_miles 30000 -> 7500, interval_months 48 -> 12, first_at_miles = 30000, first_at_months = 48.
- Spark plugs: interval_miles 60000, interval_months 96. Only appears once at 60,000 miles (page 566). Since schedule goes to 90,000 and spark plugs don't appear again, the repeat interval would be 60,000 miles. Confirmed.
- Exhaust system standard: interval_miles 15000, interval_months 24 confirmed. First appears at 15,000 (page 560), then 30,000 (page 562), 45,000 (page 564), etc. Every 15,000 miles.
- Steering gear and linkage standard: interval_miles 15000, interval_months 24 confirmed. Same pattern as exhaust.
- Fuel tank vapor vent system: interval_miles 15000, interval_months 24 confirmed. Appears at 15,000, 30,000, 45,000, 60,000, 75,000, 90,000.
- Brake fluid severe: interval_miles 7500 -> 7500 confirmed. Appears at every severe column starting from 7,500 (page 559).
- Severe brake pads: interval_miles 3750, interval_months 6 confirmed. Appears at every column under severe.
- Severe exhaust: interval_miles 3750, interval_months 6 confirmed from pages.
- Severe steering: interval_miles 3750, interval_months 6 confirmed.
- Severe axle/suspension: interval_miles 3750, interval_months 6 confirmed.
- Severe propeller shaft: interval_miles 3750, interval_months 6 confirmed.
- Severe drive shaft boots: interval_miles 3750, interval_months 6 confirmed.
- Maintenance schedule header on page 557 says 'up to 120,000 miles (192,000 km)/96 months' and 'After 120,000 miles (192,000 km)/96 months, continue maintenance at the same mileage/time interval.' Page 559 says 'After 90,000 miles (144,000 km)/144 months, continue maintenance at the same mileage/time interval.' Extraction caveat #1 references page 559 correctly.
- Engine coolant: first_at_miles 105000, first_at_months 84 confirmed from page 514. No repeat interval given in pages, so interval_miles and interval_months remain null. However page 555 says 'Replace coolant at the specified interval' but no specific repeat interval after first replacement is given in the provided pages.
- Air cleaner filter: interval_miles 30000, interval_months 48. Appears at 30,000 (page 562), 60,000 (page 566), 90,000 (page 570). Every 30,000 miles. Confirmed.
- CVT fluid standard inspect: interval_miles 7500, interval_months 12 confirmed. Appears at every 7,500-mile column.
- Differential gear oil standard inspect: interval_miles 7500, interval_months 12 confirmed.
- Coupling oil standard inspect: interval_miles 7500, interval_months 12 confirmed.
- Transfer fluid standard inspect: interval_miles 7500, interval_months 12 confirmed.

## 2025 Sentra

- Brake fluid: schedule 'standard' is incorrect. Per pages 512-524, brake fluid replacement appears at 15k (severe only, p512), 20k (standard, p513), 30k (severe only, p514), 40k (standard, p515), 50k (severe only, p516), 60k (standard, p517), 70k (severe only, p519), 80k (standard, p520), 90k (severe only, p521), etc. Standard interval is 20,000 miles/24 months. Severe interval is different - appears every 10,000 miles offset. Keeping standard at 20k/24mo but adding severe at 15,000/18 months with first_at_miles=15000, first_at_months=18. Actually re-examining: severe brake fluid appears at 15k, 20k(standard+severe), 30k(severe), 40k(standard+severe), 50k(severe), 60k(standard+severe), 70k(severe), 80k(standard+severe), 90k(severe). Severe appears roughly every 10k. But looking more carefully: p512 15k severe has 'Replace brake fluid'; p513 20k standard has 'Replace brake fluid' AND severe has 'Replace brake fluid'; p514 30k severe has 'Replace brake fluid'; p515 40k standard has 'Replace brake fluid' AND severe has 'Replace brake fluid' and 'Replace manual transmission gear oil'; p516 50k severe has 'Replace brake fluid'; p517 60k standard has 'Replace brake fluid' AND severe has 'Replace brake fluid'; p519 70k severe has 'Replace brake fluid'; p520 80k standard has 'Replace brake fluid' AND severe has 'Replace brake fluid'; p521 90k severe has 'Replace brake fluid'; p524 110k severe has 'Replace brake fluid'. So standard brake fluid = every 20k/24mo. Severe brake fluid = appears at every milestone where it's listed under severe, which is roughly every 10k. Actually it appears under severe at: 15k, 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 110k. That's roughly every 10k/12mo. Splitting into standard (20k/24mo) and severe (10k/12mo, first at 15k/18mo).
- Brake fluid interval_miles: standard 20000/24mo is correct per pages. Adding separate severe entry.
- Brake pads, rotors, drums and linings: standard interval should be 20,000/24 not 5,000/6. Per pages, standard schedule shows inspection at 20k, 30k, 40k, etc. Severe shows at every 5k milestone. Correcting to have standard=20000/24 and severe=5000/6 as separate entries or combined with schedule='both' but noting the different intervals. Since the schema only allows one interval per entry, splitting into two entries.
- Engine drive belts: first inspection at 40k per p515, then 50k (p516), 60k (p517), 70k (p518), 80k (p519), 90k (p521), 120k (p524). Pattern is every 10k after first at 40k. Correcting interval_miles from 40000 to 10000 with first_at_miles=40000, first_at_months=48.
- Manual transmission gear oil inspect: Per pages, MT gear oil is inspected (listed under standard inspections) at 20k, 30k, 40k, 50k, 60k, 70k, 80k, 90k, 120k - every 10k/12mo. Correcting interval from 20k/24mo to 10000/12.
- Manual transmission gear oil replace: Per pages, MT gear oil replacement appears under SEVERE at 20k (p513), 40k (p515), 60k (p517), 80k (p520), 120k (p524). That's every 20k/24mo under severe only. The first-pass had schedule='both' which is wrong - it's severe only.
- CVT fluid inspect: Per pages, CVT fluid inspection appears under standard at 20k, 30k, 40k, 60k, 70k, 80k, 90k, 120k. Pattern is every 10k/12mo starting at 20k. Correcting interval from 20k/24mo to 10000/12 with first_at_miles=20000, first_at_months=24.
- Spark plugs: interval_miles 105,000 is not supported by the provided pages. The pages only say 'Replace at specified intervals' (p508). Removing the specific 105,000 figure and setting to null.
- Exhaust system standard interval: Per pages, exhaust system inspection appears under standard at 20k, 40k, 60k, 80k, 120k = every 20k/24mo. Severe appears at every 5k. Keeping as-is since the combined entry notes both.
- Fuel tank vapor vent system: Per pages, appears at 20k, 40k, 60k, 80k, 120k = every 20k/24mo. Correct.
- Fuel lines/connections: Per pages, appears at 20k, 40k, 60k, 80k, 120k = every 20k/24mo. Correct.
- Severe conditions list item 3: 'Conditions triggering brake fluid replacement at 15,000-mile / 18-month intervals' - brake fluid severe is not at 15k intervals, it appears roughly every 10k. Correcting.
- Engine coolant: subsequent replacement interval after first at 105k is stated as 30k/36mo in the first-pass. The pages don't specify the subsequent interval explicitly. Keeping 30k/36mo as a reasonable inference but noting it's not explicitly confirmed in provided pages.
- In-cabin microfilter: appears at 15k, 30k, 45k, 60k, 75k, 90k = every 15k/18mo. Correct.
- Intelligent Key battery: appears at 15k(listed as inspection not replacement on p512), 30k, 45k(not shown), 60k, 75k(p519), 90k. Actually p512 15k says 'Inspection: Intelligent key battery', p514 30k says 'Replace Intelligent key battery', p516 45k doesn't show IK battery, p517 60k says 'Replace Intelligent key battery', p519 75k says 'Replace Intelligent key battery', p521 90k says 'Replace Intelligent key battery'. So replacement is at 30k, 60k, 75k, 90k. Wait - p514 30k shows 'Replace Intelligent key battery' under Essentials. p519 75k shows 'Replace Intelligent key battery'. That's every 15k starting at 30k? No - 30k, 60k, 75k, 90k doesn't fit 15k pattern. Let me recheck: p512 15k - no replace IK battery listed (only inspection); p514 30k - Replace Intelligent key battery; p516 45k - Replace Intelligent key battery (yes it does); p517 60k - Replace Intelligent key battery; p519 75k - Replace Intelligent key battery; p521 90k - Replace Intelligent key battery. Wait p516 45k: looking again - 'Essentials: Replace in-cabin microfilter, Replace Intelligent key battery, Tire rotation'. Yes. So every 15k/18mo starting at 30k? No, 30-15=15, so first at 15k? But p512 15k only shows inspection. Hmm, actually looking at p512 15k Essentials: 'Replace in-cabin microfilter, Tire rotation' - no IK battery replacement. So first replacement at 30k, then every 15k (45k, 60k, 75k, 90k). Correcting first_at_miles to 30000, first_at_months=36.
- Intelligent Key battery: p512 at 15k lists 'Inspection: Intelligent key battery' under Standard maintenance Inspections, not replacement. First replacement is at 30k (p514). Correcting first_at_miles=30000, first_at_months=36.

## 2025 Z

- Brake pads and rotors: split single 'both' schedule entry into two separate entries (standard at 10,000mi/12mo, severe at 5,000mi/6mo) for clarity – the original combined entry only listed the severe interval_miles of 5000, which was misleading for the standard schedule
- Drive shaft boots: split single 'both' schedule entry into two separate entries (standard at 10,000mi/12mo, severe at 5,000mi/6mo) – same issue as brake pads
- Propeller shaft: split single 'both' schedule entry into two separate entries (standard at 10,000mi/12mo, severe at 5,000mi/6mo) – same issue
- Exhaust system: split single 'both' schedule entry into two separate entries (standard at 20,000mi/24mo, severe at 5,000mi/6mo) – same issue
- Steering gear and linkage: split single 'both' schedule entry into two separate entries (standard at 20,000mi/24mo, severe at 5,000mi/6mo) – same issue
- Axle and suspension parts: split single 'both' schedule entry into two separate entries (standard at 20,000mi/24mo, severe at 5,000mi/6mo) – same issue
- Engine drive belts: interval_miles 60000 -> 10000, added first_at_miles=60000 and first_at_months=72 – the 60,000 is the first inspection point, then every 10,000 miles thereafter per pages 371-377
- Engine coolant: interval_miles 105000 -> 75000, interval_months 84 -> 60 – 105,000mi/84mo is the FIRST replacement; the repeat interval is 75,000mi/60mo per P.376 footnote (1)
- Spark plugs: interval_miles 105000 -> null, added first_at_miles=105000 and first_at_months=126 – only one replacement shown in the schedule at 105k, no repeat interval within the 120k window
- Engine oil (NISMO): capacity '11 qt (with oil filter change)' -> '5-5/8 qt (with oil filter change); 5-3/8 qt (drain and refill without filter change)' – P.380 shows only one engine oil row with 5-5/8 qt / 5-3/8 qt; the 11 qt figure is for NISMO engine COOLANT, not oil
- Engine oil (NISMO): applies_to 'NISMO models' kept but capacity corrected per P.380 – the oil capacity table has no separate NISMO row
- Engine coolant (AT/MT): capacity '3-1/8 qt (with reservoir); 1/4 qt (reservoir only)' -> '9-1/2 qt (with reservoir) for AT model; 9-3/8 qt (with reservoir) for MT model; 5/8 qt (reservoir only)' – P.380 shows engine coolant with reservoir as 9-1/2 qt (AT) and 9-3/8 qt (MT); the 3-1/8 qt figure was the INTERCOOLER coolant capacity
- Engine coolant (NISMO): capacity '3-5/8 qt (with reservoir); 1/4 qt (reservoir only)' -> '11 qt (with reservoir); 5/8 qt (reservoir only)' – P.380 shows NISMO engine coolant with reservoir as 11 qt; 3-5/8 qt was the NISMO intercooler coolant
- Engine coolant reservoir only: '1/4 qt' -> '5/8 qt' for all models – P.380 shows engine coolant reservoir as 0.6L = 5/8 qt; the 1/4 qt (0.2L) is the intercooler coolant reservoir
- Engine oil applies_to: 'all except NISMO' -> 'Automatic Transmission model and Manual Transmission model' – clarified since NISMO uses same capacity per P.380
