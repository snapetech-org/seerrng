# SeerrNG Arabic setup description correction

At PR #418 input head/tree `e32e1748e780740ae447dc5ab91eda5b5a9a79bb` / `15b64698e3e9f835e2dbde87ee9822bf8abce6d7`, exact source and caller review found the Arabic value for `components.Setup.advancedSetupDescription` was ungrammatical. Independent review accepted the refined target `

> تخطَّ الإعدادات الافتراضية الموجهة وخيارات الخدمات. ستظل بحاجة إلى توصيل خادم الوسائط الخاص بك قبل اكتمال الإعداد.

It preserves skipping guided defaults and service choices and the requirement to connect the user's media server before setup completes. The source hash is `3328ec4efc40f35be20b9655b613e60e76e56011bae3a5bd3b620999d7567b81`; the old target hash is `f87fa1564c63d4aeef318e26032d4a89f57a03a0cdf4d33364385ff4109d4acc`; the new target hash is `5df014b6f5c51c63a3647dd59a598f8e15f424d0e9873bd5b3b5c6f4fe5e09b5`. Only this Arabic catalog cell changed.

The evidence retains two independent text reviews and one independent final-wording review. The isolated headed-browser screenshots show the Arabic RTL setup screen before and after; the new sentence fits in two lines. The preview API was isolated on an unbound port, so this is a focused visual and copy review of the setup screen only, not API-backed workflows or whole-application acceptance.

This is machine-assisted language review, not qualified native-speaker approval. No tests, builds, scans, CI jobs, workflow changes, releases, tags, or merges were made.
