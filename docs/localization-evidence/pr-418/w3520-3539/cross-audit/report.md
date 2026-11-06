# SeerrNG PR #418 W3520–W3539 cross-audit reconciliation

Pinned head `265171657d48ef56ee81cc1c6a5c3d07abe5d07e` / tree `402984893883cf7afd106cd208f6027d7410f2fb`. This is a read-only audit of the corrected candidate-free input, root primary ledger and sealed independent blind ledger.

- Candidate-free manifest JSON SHA256: `9e032c395028881ffe5273ae0d7d13668dd26e9cc7cd4b321a68d2cfee95dd63`
- Candidate-free checksum-list SHA256: `2c13436eb5d119231ce92a5ca8add130df8714a82a9b5243f22e24262957bb6d`
- Primary packet checksum-list SHA256: `225c152bc63d8140ffb80d59fef7db8bf88053601fd8d3e613e97ffeca2d1471`
- Blind review packet checksum-list SHA256: `7efeee5cec4b85e3699aa12f6bdde5cf6d3f982df8b2c16eb0c9fcc934abad00`

All 240 cells reconciled: 210 both accept current; 9 share a proposed target; 21 target disagreements were adjudicated (15 use primary targets, 6 use blind targets). Final proposed target changes: 30; holds: 0; placeholder mismatches: 0.

## Adjudicated target disagreements

### 3522 / es — Select a certification

- Current: Seleccione una certificación
- Primary: correction → Seleccione una clasificación
- Blind: accept-current → Seleccione una certificación
- Cross-audit: correction → Seleccione una clasificación
- Caller: components.Selector.CertificationSelector (w3520-3522-definition-08, w3520-3522-caller-09)
- Rationale: The pinned CertificationSelector placeholder is adjacent to min/max rating controls. In this content-rating context, clasificación is the natural Spanish name for the rating category; certificación can suggest a certificate.

### 3522 / fr — Select a certification

- Current: Sélectionner une certification
- Primary: correction → Sélectionner une classification
- Blind: accept-current → Sélectionner une certification
- Cross-audit: correction → Sélectionner une classification
- Caller: components.Selector.CertificationSelector (w3520-3522-definition-08, w3520-3522-caller-09)
- Rationale: The pinned CertificationSelector placeholder is adjacent to min/max rating controls. In this content-rating context, classification is the natural French name for the rating category; certification can suggest a formal certificate.

### 3522 / id — Select a certification

- Current: Pilih sertifikasi
- Primary: correction → Pilih klasifikasi usia
- Blind: accept-current → Pilih sertifikasi
- Cross-audit: correction → Pilih klasifikasi usia
- Caller: components.Selector.CertificationSelector (w3520-3522-definition-08, w3520-3522-caller-09)
- Rationale: The pinned CertificationSelector and rating controls show that the choice is an age-rating category. Klasifikasi usia expresses that category more clearly than sertifikasi.

### 3522 / vi — Select a certification

- Current: Chọn một chứng nhận
- Primary: correction → Chọn phân loại độ tuổi
- Blind: accept-current → Chọn một chứng nhận
- Cross-audit: correction → Chọn phân loại độ tuổi
- Caller: components.Selector.CertificationSelector (w3520-3522-definition-08, w3520-3522-caller-09)
- Rationale: The pinned CertificationSelector and rating controls show that the choice is an age-rating category. Phân loại độ tuổi is clearer than chứng nhận, which means a certificate.

### 3525 / ar — All available providers are already selected.

- Current: وقد تم بالفعل اختيار جميع مقدمي الخدمات المتاحة.
- Primary: correction → تم اختيار جميع مزوّدي الخدمة المتاحين بالفعل.
- Blind: correction → تم بالفعل اختيار جميع مزودي الخدمة المتاحين.
- Cross-audit: correction → تم اختيار جميع مزوّدي الخدمة المتاحين بالفعل.
- Caller: components.Selector (w3520-3525-definition-14, w3520-3525-caller-15)
- Rationale: Both proposals fix the current adjective agreement. The primary phrasing pairs the masculine plural مزوّدي with المتاحين and retains service-provider specificity.

### 3525 / zh_Hans — All available providers are already selected.

- Current: 所有可用的提供者已经选中。
- Primary: refinement → 所有可用的服务提供商均已选中。
- Blind: refinement → 所有可用的提供商都已选中。
- Cross-audit: refinement → 所有可用的服务提供商均已选中。
- Caller: components.Selector (w3520-3525-definition-14, w3520-3525-caller-15)
- Rationale: This is a list of streaming providers. 服务提供商 names that service-provider concept more precisely than the generic 提供商.

### 3527 / de — Canceled

- Current: Abgebrochen
- Primary: accept-current → Abgebrochen
- Blind: correction → Abgesetzt
- Cross-audit: correction → Abgesetzt
- Caller: components.Selector (w3520-3527-definition-20, w3520-3527-caller-21)
- Rationale: The exact caller places Canceled beside Planned, Returning Series and Ended in a television-series status selector. Abgesetzt is the conventional German status for a canceled show; Abgebrochen suggests an interrupted action.

### 3527 / ja — Canceled

- Current: キャンセルされました
- Primary: accept-current → キャンセルされました
- Blind: correction → 打ち切り
- Cross-audit: correction → 打ち切り
- Caller: components.Selector (w3520-3527-definition-20, w3520-3527-caller-21)
- Rationale: The exact caller places Canceled beside other television-series lifecycle statuses. 打ち切り describes a series being canceled; キャンセルされました reads as cancellation of an action.

### 3528 / id — Clear All

- Current: Hapus Semua
- Primary: accept-current → Hapus Semua
- Blind: correction → Hapus semua pilihan
- Cross-audit: correction → Hapus semua pilihan
- Caller: components.Selector (w3520-3528-definition-22, w3520-3528-caller-23)
- Rationale: The caller clears the selected-provider array. Hapus semua pilihan says to clear selections; Hapus Semua can imply deleting all providers.

### 3528 / vi — Clear All

- Current: Xoá tất cả
- Primary: accept-current → Xoá tất cả
- Blind: correction → Bỏ chọn tất cả
- Cross-audit: correction → Bỏ chọn tất cả
- Caller: components.Selector (w3520-3528-definition-22, w3520-3528-caller-23)
- Rationale: The caller clears the selected-provider array. Bỏ chọn tất cả means deselect all; Xoá tất cả can imply deleting the providers.

### 3529 / ja — Ended

- Current: 完了
- Primary: correction → 放送終了
- Blind: accept-current → 完了
- Cross-audit: correction → 放送終了
- Caller: components.Selector (w3520-3529-definition-24, w3520-3529-caller-25)
- Rationale: The exact caller lists Ended as a television-series lifecycle status. 放送終了 states that broadcast has ended; 完了 is generic completion.

### 3531 / id — No providers are available in this region.

- Current: Tidak ada penyedia tersedia di daerah ini.
- Primary: correction → Tidak ada penyedia yang tersedia di wilayah ini.
- Blind: accept-current → Tidak ada penyedia tersedia di daerah ini.
- Cross-audit: correction → Tidak ada penyedia yang tersedia di wilayah ini.
- Caller: components.Selector (w3520-3531-definition-28, w3520-3531-caller-29)
- Rationale: The current sentence lacks the relative marker yang and sounds clipped. The primary proposal is grammatical Indonesian for no providers being available in the region.

### 3532 / vi — No providers are currently selected.

- Current: Chưa chọn nhà cung cấp.
- Primary: refinement → Hiện chưa có nhà cung cấp nào được chọn.
- Blind: accept-current → Chưa chọn nhà cung cấp.
- Cross-audit: refinement → Hiện chưa có nhà cung cấp nào được chọn.
- Caller: components.Selector (w3520-3532-definition-30, w3520-3532-caller-31)
- Rationale: The direct caller uses this as the disabled reason when no providers are selected. Hiện chưa có nhà cung cấp nào được chọn explicitly expresses the current empty selection.

### 3532 / zh_Hans — No providers are currently selected.

- Current: 目前没有选择提供者 。
- Primary: correction → 目前未选择任何服务提供商。
- Blind: correction → 目前尚未选择任何提供者。
- Cross-audit: correction → 目前未选择任何服务提供商。
- Caller: components.Selector (w3520-3532-definition-30, w3520-3532-caller-31)
- Rationale: The direct caller describes an empty selection among streaming providers. 服务提供商 is more precise than generic 提供者, and the proposal removes the current spacing error.

### 3532 / zh_Hant — No providers are currently selected.

- Current: 目前沒有選擇提供者 。
- Primary: correction → 目前未選擇任何服務提供者。
- Blind: correction → 目前尚未選擇任何提供者。
- Cross-audit: correction → 目前未選擇任何服務提供者。
- Caller: components.Selector (w3520-3532-definition-30, w3520-3532-caller-31)
- Rationale: The direct caller describes an empty selection among streaming providers. 服務提供商 is more precise than generic 提供者, and the proposal removes the current spacing error.

### 3535 / fr — Planned

- Current: Planifié(e)
- Primary: accept-current → Planifié(e)
- Blind: refinement → Planifiée
- Cross-audit: refinement → Planifiée
- Caller: components.Selector (w3520-3535-definition-37, w3520-3535-caller-38)
- Rationale: The status list contains series states, so the implied noun série is feminine. Planifiée is grammatical French and avoids the parenthetical gender notation Planifié(e).

### 3535 / ja — Planned

- Current: 計画済み
- Primary: correction → 計画中
- Blind: accept-current → 計画済み
- Cross-audit: correction → 計画中
- Caller: components.Selector (w3520-3535-definition-37, w3520-3535-caller-38)
- Rationale: The exact caller lists Planned beside other television-series lifecycle states. 計画中 means the series is in the planned state; 計画済み can imply that planning itself is complete.

### 3535 / vi — Planned

- Current: Đã lên kế hoạch
- Primary: refinement → Dự kiến
- Blind: accept-current → Đã lên kế hoạch
- Cross-audit: refinement → Dự kiến
- Caller: components.Selector (w3520-3535-definition-37, w3520-3535-caller-38)
- Rationale: The exact caller uses this as a series lifecycle state. Dự kiến is a concise status label; Đã lên kế hoạch reads as a completed planning action.

### 3535 / zh_Hant — Planned

- Current: 计划
- Primary: correction → 計劃中
- Blind: accept-current → 计划
- Cross-audit: correction → 計劃中
- Caller: components.Selector (w3520-3535-definition-37, w3520-3535-caller-38)
- Rationale: The current value uses Simplified Chinese 计 in the Traditional locale. The primary proposal uses Traditional script and expresses the planned state.

### 3536 / fr — Returning Series

- Current: Série de retour
- Primary: correction → Série en cours
- Blind: accept-current → Série de retour
- Cross-audit: correction → Série en cours
- Caller: components.Selector (w3520-3536-definition-39, w3520-3536-caller-40)
- Rationale: The direct caller places Returning Series among series lifecycle states. Série en cours is the natural French status for an ongoing series; Série de retour is a literal calque.

### 3539 / ko — Select status...

- Current: 상태 선택 ...
- Primary: accept-current → 상태 선택 ...
- Blind: refinement → 상태 선택…
- Cross-audit: refinement → 상태 선택…
- Caller: components.Selector (w3520-3539-definition-45, w3520-3539-caller-46)
- Rationale: This is a selector placeholder. The no-space Unicode ellipsis in 상태 선택… is a cleaner compact label than a spaced three-period sequence.

## Disposition differences

- Rank 3522 / es: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Seleccione una clasificación (adjudicated-primary-target).
- Rank 3522 / fr: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Sélectionner une classification (adjudicated-primary-target).
- Rank 3522 / id: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Pilih klasifikasi usia (adjudicated-primary-target).
- Rank 3522 / vi: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Chọn phân loại độ tuổi (adjudicated-primary-target).
- Rank 3527 / de: primary `accept-current`; blind `correction`; targets differ; cross-audit `correction` → Abgesetzt (adjudicated-blind-target).
- Rank 3527 / ja: primary `accept-current`; blind `correction`; targets differ; cross-audit `correction` → 打ち切り (adjudicated-blind-target).
- Rank 3528 / id: primary `accept-current`; blind `correction`; targets differ; cross-audit `correction` → Hapus semua pilihan (adjudicated-blind-target).
- Rank 3528 / vi: primary `accept-current`; blind `correction`; targets differ; cross-audit `correction` → Bỏ chọn tất cả (adjudicated-blind-target).
- Rank 3529 / ja: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → 放送終了 (adjudicated-primary-target).
- Rank 3531 / id: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Tidak ada penyedia yang tersedia di wilayah ini. (adjudicated-primary-target).
- Rank 3532 / hi: primary `correction`; blind `refinement`; targets agree; cross-audit `correction` → वर्तमान में कोई प्रदाता चयनित नहीं है। (same-proposed-target).
- Rank 3532 / vi: primary `refinement`; blind `accept-current`; targets differ; cross-audit `refinement` → Hiện chưa có nhà cung cấp nào được chọn. (adjudicated-primary-target).
- Rank 3535 / fr: primary `accept-current`; blind `refinement`; targets differ; cross-audit `refinement` → Planifiée (adjudicated-blind-target).
- Rank 3535 / ja: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → 計画中 (adjudicated-primary-target).
- Rank 3535 / vi: primary `refinement`; blind `accept-current`; targets differ; cross-audit `refinement` → Dự kiến (adjudicated-primary-target).
- Rank 3535 / zh_Hant: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → 計劃中 (adjudicated-primary-target).
- Rank 3536 / fr: primary `correction`; blind `accept-current`; targets differ; cross-audit `correction` → Série en cours (adjudicated-primary-target).
- Rank 3539 / ko: primary `accept-current`; blind `refinement`; targets differ; cross-audit `refinement` → 상태 선택… (adjudicated-blind-target).
## Review limits

No source files or PR metadata were changed. No tests, builds, scans, CI, native-speaker approval, or browser review are included. The cross-audit does not approve application, merge, or release. The independent blind packet was read only from its sealed `review/` directory; the isolated unsealed draft was not used.
