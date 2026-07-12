# iobroker_custom_data

Git-versionierte Konfiguration und Skripte für skriptgetriebene Alias- und
Gruppen-Verwaltung in ioBroker (Docker/buanet, Z-Wave über zwavejs-Fork
"zwavews", Auto-GUI über iobroker.devices v3.0.2).

| Datei | Zweck |
|---|---|
| [userdata/vorlagen.json](userdata/vorlagen.json) | Alias-Templates (Rollen, Datenpunkt-Rollen, Einheiten) |
| [userdata/mapping.json](userdata/mapping.json) | Zuordnung Gerät → Vorlage inkl. globalem `modus` (`dummy`/`echt`) und Zielen `zielEcht`/`zielDummy` |
| [userdata/gruppen.json](userdata/gruppen.json) | Gruppen-Definitionen für die gemeinsame Steuerung |
| [js-scripts/alias-aufbau.js](js-scripts/alias-aufbau.js) | Baut Geräte-Aliase aus vorlagen+mapping (Upsert, Dummy-/Echt-Modus — siehe [Doku](docs/alias-dummy-modus.md)) |
| [js-scripts/gruppen-aufbau.js](js-scripts/gruppen-aufbau.js) | Baut Gruppen-Objekte aus gruppen.json (delete-and-rebuild — siehe [Doku](docs/gruppen-steuerung.md)) |

Die JSON-Dateien werden in den ioBroker-Dateispeicher unter
`0_userdata.0 : configuration.read.by.scripts/` hochgeladen (dort lesen die
Skripte sie per `readFileAsync`). Das Git-Repo ist die führende Quelle.

## Doku

- [Dummy-Modus für den Alias-Aufbau](docs/alias-dummy-modus.md) — Aliase
  wahlweise auf Dummy-States oder echte Z-Wave-Geräte zeigen lassen, ohne
  Objekte zu löschen (Upsert, stabiler Objekt-IDs).
- [Gruppen-Steuerung für den Devices-Adapter](docs/gruppen-steuerung.md) —
  mehrere Jalousien über eine gemeinsame GUI-Kachel steuern; drei Varianten
  (Szenen-Taster, virtuelle Gruppe, Alias mit JS-Fan-out), pro Gruppe wählbar.
