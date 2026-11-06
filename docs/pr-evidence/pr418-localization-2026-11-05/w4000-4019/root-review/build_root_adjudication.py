import json
from pathlib import Path

root = Path(__file__).parent.parent
cross = root / "cross-review" / "recommendations.jsonl"
current_file = root / "candidate-free" / "current-target-cells.jsonl"
out = Path(__file__).parent / "root-adjudication.jsonl"

agent_targets = {
    "es": "Habilitar el agente de notificaciones",
    "zh-Hans": "启用通知代理服务",
    "hi": "अधिसूचना एजेंट को सक्षम करें",
    "de": "Benachrichtigungsagent aktivieren",
    "ja": "通知エージェントを有効にする",
    "fr": "Activer l’agent de notification",
    "pt-BR": "Ativar agente de notificação",
    "ar": "تفعيل خدمة الإشعارات",
    "ko": "알림 에이전트 활성화",
    "zh-Hant": "啟用通知代理服務",
    "vi": "Bật dịch vụ thông báo",
    "id": "Aktifkan agen pemberitahuan",
}

rows = [json.loads(line) for line in cross.read_text(encoding="utf-8").splitlines() if line]
current = {r["cellId"]: r for r in map(json.loads, current_file.read_text(encoding="utf-8").splitlines())}
if len(rows) != 240 or len(current) != 240:
    raise SystemExit(f"expected 240 cross and current-target rows, got {len(rows)} and {len(current)}")
seen = set()
for row in rows:
    cell = row["cellId"]
    if cell in seen or cell not in current:
        raise SystemExit(f"duplicate or missing cell: {cell}")
    seen.add(cell)
    target = current[cell]
    if target["sourceId"] != row["sourceId"] or target["locale"] != row["locale"]:
        raise SystemExit(f"current-target identity mismatch: {cell}")
    if row["decision"] == "hold":
        row["currentTarget"] = target["currentTarget"]
        row["currentTargetSha256"] = target["currentTargetSha256"]
        locale = row["locale"]
        if not cell.startswith("components.Settings.Notifications.agentenabled::") or locale not in agent_targets:
            raise SystemExit(f"unexpected hold: {cell}")
        row["rootDisposition"] = "correction"
        row["rootTarget"] = agent_targets[locale]
        row["rootConfidence"] = "moderate"
        row["rootRationale"] = (
            "Root resolved the text-free hold using the exact notification-settings checkbox caller and the same page’s "
            "components.Settings.notificationAgentSettingsDescription, which names these configurable elements as "
            "notification agents or services. Wording follows that established locale context."
        )
        row["rootOverride"] = "context-resolved-agent"
    elif row.get("currentTarget") == row.get("recommendedTarget"):
        row["rootDisposition"] = "accept-current"
        row["rootTarget"] = row["currentTarget"]
        row["rootConfidence"] = row.get("confidence")
        row["rootRationale"] = "Both review lanes and cross-review accept the exact current target; preserve it."
        row["rootOverride"] = None
    else:
        row["rootDisposition"] = "correction" if (
            row.get("primaryDisposition") == "CORRECTION" or row.get("blindDisposition") == "correction"
        ) else "refinement"
        row["rootTarget"] = row["recommendedTarget"]
        row["rootConfidence"] = row.get("confidence")
        row["rootRationale"] = row.get("rationale")
        row["rootOverride"] = None

if len([r for r in rows if r["rootDisposition"] == "accept-current"]) != 178:
    raise SystemExit("unexpected accept-current count")
if len([r for r in rows if r.get("rootOverride") == "context-resolved-agent"]) != 12:
    raise SystemExit("expected 12 context-resolved Agent rows")
if len([r for r in rows if r["rootTarget"] != r.get("currentTarget")]) != 62:
    raise SystemExit("expected 62 final target changes/additions")
out.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8")
print(f"wrote {len(rows)} root dispositions, {sum(r['rootTarget'] != r.get('currentTarget') for r in rows)} target changes, {sum(bool(r.get('rootOverride')) for r in rows)} explicit context overrides")
