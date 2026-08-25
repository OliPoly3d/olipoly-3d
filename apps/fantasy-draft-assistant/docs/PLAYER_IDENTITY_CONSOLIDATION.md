# Player Data Center identity consolidation

## Diagnosis

The reported 2,943 value was produced by summing every unmatched and ambiguous parsed row after reconciling each uploaded source independently. It therefore counted repeated appearances once per source and treated every unmatched required-source row, including ADP and bye supplementation and deep rankings, as activation-blocking. Supplemental ESPN, Clay, and Draft Sharks rows were also handled at row level. The ESPN injury parser already separates repeated headers, extraction noise, duplicates, and non-fantasy positions, but the activation gate discarded that classification except for a small position allow-list.

The nine original uploaded documents are not present in this repository, so their exact 2,943-row source distribution cannot be truthfully reconstructed offline. The corrected staging result exposes, for each uploaded source, parsed rows, unique source identities, matches, ambiguities, unmatched rows, duplicates, non-fantasy rows, outside-pool rows, blocking identities, active rows, informational rows, and usable coverage. Running the same nine files through the review screen is the required way to obtain the exact production-file breakdown without uploading or activating data.

## Draft-pool safety boundary

Believeland has 12 teams and 15 non-IR roster places (180 rostered players). RoboCop has 12 teams, 17 live roster rounds, and 36 keepers. The staging gate conservatively covers the top 360 FantasyPros PPR records, top 420 Half-PPR records, and top 240 IDP records. These ranges exceed the leagues' combined playable demand while retaining depth for keepers, offense, IDP, DST, kicker, replacement calculations, Cost of Waiting, recommendation expansion, free agents, and injury replacements. Deeper rows remain source provenance; they are not deleted and cannot affect recommendations unless safely matched.

## Classification and safety

Only an unresolved in-boundary FantasyPros PPR, Half-PPR, or IDP identity blocks activation. ADP and bye data supplement identities. ESPN Top 300, Mike Clay, ESPN injuries, and Draft Sharks are supplemental: safe matches may activate, while unresolved records are review-recommended or informational and remain excluded from effects. Non-fantasy positions, malformed data, duplicates, and out-of-pool records never create blocking review work.

Groups use normalized full name (including suffix), normalized NFL team, position family, provider identity where available, or an existing canonical ID. They never join on surname alone. Defensive families normalize DE/DT/DL and CB/S/DB while retaining each source row's provider position. A single manual resolution applies atomically to all compatible evidence in the group. Canonical creation remains unsupported in this local staging architecture; unresolved in-scope primary identities therefore remain blocking rather than receiving fragile generated IDs.
