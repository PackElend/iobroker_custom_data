---
title: Dummy-Modus für den Alias-Aufbau
sidebar_label: Dummy-Modus
description: Aliase wahlweise auf Dummy-States oder echte Z-Wave-Geräte zeigen lassen, ohne Objekte zu löschen.
---

# Dummy-Modus für den Alias-Aufbau

Das Alias-System kann die Visualisierung im iobroker.devices-Adapter jetzt
zuerst mit Dummy-States testen und später **ohne Löschen der Aliase** auf
echte Z-Wave-Geräte umschalten. Die Objekt-IDs bleiben dabei stabil, sodass
devices-Konfiguration, Enums und Visualisierung erhalten bleiben.

## Was hat sich geändert?

### mapping.json: neuer Aufbau

Aus dem flachen Array wurde ein Objekt mit globalem `modus` und der
bisherigen Tabelle unter `geraete`:

```json
{
  "modus": "dummy",
  "geraete": [
    { "alias": "ShellyWaveShutter", "vorlage": "jalousie",
      "zielEcht": "zwavews.0.nodeID_006",
      "zielDummy": "0_userdata.0.dummy.ShellyWaveShutter" }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `modus` | `"dummy"` oder `"echt"` — gilt global für alle Geräte |
| `zielEcht` | Basis-ID des echten Geräts (bisheriges Feld `node`) |
| `zielDummy` | Basis-ID der Dummy-States unter `0_userdata.0.dummy.*` |

Die vollständigen State-IDs ergeben sich aus der Vorlage: im Echt-Modus
`<zielEcht>.<quelle>`, im Dummy-Modus `<zielDummy>.<feld>` (also z. B.
`0_userdata.0.dummy.ShellyWaveShutter.SET` — die Dummy-Struktur spiegelt
die Alias-Struktur). Getrennte Lese-/Schreib-Quellen sind über die
optionalen Vorlagen-Spalten `quelleLesen`/`quelleSchreiben` abbildbar;
beim Umschalten werden `alias.id.read` **und** `alias.id.write` immer
gemeinsam umgehängt.

### alias-aufbau.js: Upsert statt Delete-and-rebuild

- Existiert ein Alias-Objekt bereits, wird nur noch bei Abweichung per
  `extendObject()` angeglichen — beim Modus-Wechsel also ausschließlich
  `common.alias` umgehängt. Es wird **nie gelöscht und neu erzeugt**.
- Wertumrechnungen (`lesen`/`schreiben` aus der Vorlage, z. B. Z-Wave
  0–99 → 0–100 %) gelten nur im Echt-Modus. Im Dummy-Modus wird die
  Identität (`val`) gesetzt, weil Dummy-States bereits Alias-Werte tragen.
- Script-verwaltete Objekte tragen den Marker
  `common.custom.aliasAufbau = true`. Aufgeräumt (gelöscht) werden nur
  getaggte Aliase, die nicht mehr in `mapping.json` stehen; manuell
  erstellte Objekte ohne Marker bleiben grundsätzlich unberührt.
- Log pro Alias-State: `erstellt` / `Ziel geändert (alt → neu)` /
  `aktualisiert` / `unverändert`. Ein wiederholter Lauf im selben Modus
  meldet durchgehend `unverändert` und schreibt nichts.

### Dummy-States

- Werden **nur** im Modus `"dummy"` angelegt, unter
  `0_userdata.0.dummy.<gerät>.<feld>`.
- Typ, Rolle, `min`/`max` und `unit` kommen aus der Vorlage, damit Dummy
  und echtes Gerät für den Type-Detector identisch aussehen.
- `common.write` ist immer `true`, damit sich auch Sensorwerte (z. B. der
  Fenstergriff) in der Visualisierung simulieren lassen.
- Initialwerte gibt es nur beim Erstanlegen (Jalousie-Level = 0,
  Fenster = 0 = geschlossen), danach nie wieder.
- Beim Umschalten auf `"echt"` bleiben die Dummy-States liegen — sie
  stören nicht. Zum Entsorgen gibt es im Skript den Schalter
  `DUMMIES_AUFRAEUMEN` (auf `true` setzen, Skript einmal laufen lassen,
  wieder auf `false`); das passiert bewusst nie automatisch.

## Arbeitsablauf

1. `mapping.json` mit `"modus": "dummy"` hochladen, Skript starten →
   Dummy-States und Aliase entstehen, Aliase zeigen auf die Dummies.
2. Visualisierung im devices-Adapter einrichten und mit den Dummy-States
   testen (Slider, Fensterzustand usw.).
3. Umschalten: in `mapping.json` nur `"modus": "echt"` setzen, Skript
   erneut starten. Einziger Effekt: `common.alias` aller Alias-States
   zeigt jetzt auf die Z-Wave-States. IDs, Enums und `common.custom`
   bleiben unverändert.
