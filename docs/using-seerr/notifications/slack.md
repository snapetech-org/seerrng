---
title: Slack
description: Configure Slack notifications.
sidebar_position: 9
---

# Slack

## Configuration

### Webhook URL

Simply [create a webhook](https://my.slack.com/services/new/incoming-webhook/) and enter the URL in this field.

:::info
Please refer to the [Slack API documentation](https://api.slack.com/messaging/webhooks) for more details on configuring these notifications.
:::

### Embed Poster (optional)

When enabled, Seerr includes the notification image in the Slack message when an image is available.

### Notification Language

Sets the language for notifications sent to this Slack channel.

## Approve or decline requests from Slack

Request actions are optional. Enable **Enable request approval actions** in
SeerrNG's Slack notification settings, then create a Slack app in the same
workspace as the incoming webhook.

In the Slack app, open **Interactivity & Shortcuts** and set the Request URL to
`<your SeerrNG application URL>/api/v1/notifications/slack/actions`. Slack must
be able to reach this HTTPS URL. In SeerrNG, enter the workspace ID and the
app's **Signing Secret** from **Basic Information**.

Add one mapping per line in **Request manager mappings**:

```text
SLACK_USER_ID=SEERRNG_USER_ID
```

For example, `U012ABCDEF=12` maps Slack member `U012ABCDEF` to SeerrNG user
`12`. Each mapped SeerrNG user must have request management permission. SeerrNG
checks that permission again when a button is used, so a removed permission
takes effect immediately.

The buttons appear only on pending request notifications. A successful action
updates the request through SeerrNG's normal approval workflow and removes the
buttons from that Slack message.
