# SeerrNG setup locale browser review

- Reviewed application code head: `9fecce15b52cbcf392a48c48597dd16eddf552b9`
- Reviewed application code tree: `0ede311c2d789644aa80b86e9367973d118ec82b`
- Route: `/setup` on a local development server built from that exact head
- Browser: isolated headed Chrome session on the dedicated Agentic VM
- Viewport: 1440 × 1000
- Scope: initial setup screen with its locale picker open, captured for English and all 12 target locales

The screenshots confirm the active locale, translated wizard labels and introductory copy, server-provider buttons, and the initial step layout. Arabic presents the wizard in right-to-left order. In Spanish, “Conectar servicios” wraps to two lines in its step segment without visible clipping or overlap. The contact sheet contains the 12 target locales; individual images are retained for readable inspection.

This was a visual review of the public initial setup route only. No account, server connection, provider configuration, or setup submission was performed. Other routes, modal states, narrow viewports, and assistive-technology behavior were not covered. The screenshots are machine-assisted review evidence and do not establish qualified native-speaker approval.

## Captures

`setup-en.png` is the English baseline. Target locale screenshots are `setup-es.png`, `setup-zh_Hans.png`, `setup-hi.png`, `setup-de.png`, `setup-ja.png`, `setup-fr.png`, `setup-pt_BR.png`, `setup-ar.png`, `setup-ko.png`, `setup-zh_Hant.png`, `setup-vi.png`, and `setup-id.png`. `setup-locales-contact.png` is the target-locale contact sheet.
