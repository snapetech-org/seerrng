---
title: Email
description: Configure email notifications for your users.
sidebar_position: 1
---

# Email

## Configuration

:::info
If the [Application URL](/using-seerr/settings/general#application-title) setting is configured in **Settings → General**, Seerr will explicitly set the origin server hostname when connecting to the SMTP host.
:::

### Embed Poster (optional)

When enabled, the email includes the notification image when one is available, such as the requested title's poster.

### Use Public Seerr Logo Instead of Instance Logo (optional)

When enabled, emails use the public Seerr logo hosted on GitHub instead of the logo at your configured Application URL. This lets email clients display a logo when your Seerr instance is not reachable from outside your network. It does not use your instance's custom logo.

### Require User Email

When enabled, users will be required to provide a valid email address in their user settings. This is useful if you want to ensure all users can receive email notifications.

### Sender Name (optional)

Configure a friendly name for the email sender (e.g., "Seerr").

### Sender Address

Set this to the email address you would like to appear in the "from" field of the email message.

Depending on your email provider, this may need to be an address you own. For example, Gmail requires this to be your actual email address.

### SMTP Host

Set this to the hostname or IP address of your SMTP server.

### SMTP Port

Set this to a supported port number for your SMTP host. `465` and `587` are commonly used.

### Encryption Method

In most cases, [Use Implicit TLS](https://tools.ietf.org/html/rfc8314) should be selected for port 465, and [Use STARTTLS](https://en.wikipedia.org/wiki/Opportunistic_TLS) if available for port 587. Please refer to your email provider's documentations for details on how to configure this setting.

The default value for this setting is **Use STARTTLS if available**.

### Allow Self-Signed Certificates (optional)

Enabling this disables TLS certificate verification for the SMTP connection. It can allow self-signed, invalid, or otherwise untrusted certificates, so only enable it for an SMTP server you trust.

### SMTP Username & Password

:::info
If your account has two-factor authentication enabled, you may need to create an application password instead of using your account password.
:::
Configure these values as appropriate to authenticate with your SMTP host.

### PGP Private Key & Password (optional)

Configure these values to enable encrypting and signing of email messages using [OpenPGP](https://www.openpgp.org/). Note that individual users must also have their **PGP public keys** configured in their user settings in order for PGP encryption to be used in messages addressed to them.

When configuring the PGP keys, be sure to keep the entire contents of the key intact. For example, private keys always begin with `-----BEGIN PGP PRIVATE KEY BLOCK-----` and end with `-----END PGP PRIVATE KEY BLOCK-----`.
