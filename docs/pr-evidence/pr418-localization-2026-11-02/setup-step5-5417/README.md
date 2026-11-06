# SeerrNG setup step 5 wording review

At exact PR #418 head `58697945e3d3fb44c37d49db0cc0f88e3af110cc` / tree `e3076937fe10b4dd3821ea573e8e5e21601fce7d`, the primary review and two independent cross-reviews covered `components.Setup.configureservices` (source position 5417, “Connect Services”) across all 12 direct locales. Three primary proposals were accepted: Vietnamese `Kết nối dịch vụ`, Simplified Chinese `连接服务`, and Traditional Chinese `連接服務`. Both independent reviewers also recommended Spanish `Conectar servicios`, and root adjudication accepted it for application.

The prior Spanish width review found the longer label wider than `Conectar` at its measurement size. The pinned caller has no `nowrap` or clipping style and may wrap, so width alone did not prove the label was clipped. The final pushed-head Agent VM review will verify its rendered fit; see `root-adjudication.json` and the two independent review packets.

The original finding came from a headed Agent VM setup-page pass: Vietnamese showed the unrelated English suffix “Name”. Qualified native-speaker review remains outstanding; no human approval is claimed. The two review packets and this adjudication are checksummed separately.
