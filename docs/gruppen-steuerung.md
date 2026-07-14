---
title: Gruppen-Steuerung für den Devices-Adapter
sidebar_label: Gruppen-Steuerung
description: Mehrere Jalousien über eine gemeinsame Kachel in der Devices-Auto-GUI steuern — drei Varianten, pro Gruppe wählbar.
---

# Gruppen-Steuerung für den Devices-Adapter

Mehrere Jalousien (oder andere Aliase) lassen sich über eine gemeinsame
Kachel in der Auto-GUI des iobroker.devices-Adapters steuern. Die
Gruppen werden in `gruppen.json` definiert und von `gruppen-aufbau.js`
aufgebaut; pro Gruppe ist eine von drei Varianten wählbar.

## gruppen.json

Pro Gruppe ein Eintrag (flache Tabelle, wie `vorlagen.json`/`mapping.json`
in jsontable.app editierbar). Ablage im Dateispeicher unter
`0_userdata.0 : configuration.read.by.scripts/gruppen.json`:

```json
{
  "gruppe": "Jalousien_alle",
  "name": "Alle Jalousien",
  "variante": "A",
  "raum": "Zentrale",
  "funktion": "Jalousie",
  "wertZu": 100,
  "wertAuf": 0,
  "mitglieder": [
    "alias.0.scripted aliases.JalousieArbeitszimmer.SET",
    "alias.0.scripted aliases.JalousieSchlafzimmer.SET"
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `gruppe` | Technischer Name, wird Teil der Objekt-ID (keine Leer-/Sonderzeichen) |
| `name` | Anzeigename in der GUI |
| `variante` | `"A"`, `"B"` oder `"C"` (siehe unten) |
| `raum`, `funktion` | Enum-Zuweisung — **Pflicht**, sonst erscheint die Gruppe nicht in der Devices-Auto-GUI |
| `wertZu`, `wertAuf` | Nur Variante A: feste Zielwerte der beiden Taster; bei B/C `null` |
| `mitglieder` | Liste der Alias-State-IDs — in diesem Setup der `SET`-Datenpunkt der skriptgebauten Aliase, also `alias.0.scripted aliases.<gerät>.SET` |

Fehlende Mitglieds-IDs werden mit Warnung übersprungen, nicht abgebrochen.
Für Variante A/B muss der `iobroker.scenes`-Adapter installiert sein
(das Skript prüft das und warnt nur, es installiert nichts).

## Die drei Varianten

### Variante A — Szene als Taster

Zwei `scene.0.*`-Boolean-Objekte (`<gruppe>_zu`, `<gruppe>_auf`) mit
festen Zielwerten aus `wertZu`/`wertAuf`. Die Devices-GUI rendert je
eine Kachel mit Button.

**Richtig, wenn** „alles zu / alles auf" reicht: minimalste Objekte,
kein JS zur Laufzeit, kein Extra-State. **Grenze:** kein Slider, keine
Zwischenwerte.

### Variante B — virtuelle Gruppe

Ein `scene.0.<gruppe>`-Objekt mit `native.virtualGroup: true` und Rolle
`level.blind`. Ein geschriebener Wert (0–100) wird vom Szenen-Adapter
direkt auf alle Mitglieder kopiert — stufenlos, ohne JS.

**Richtig als Mittelweg:** Slider ohne Zusatz-Objekte. **Grenze:** das
`uncertain`-Verhalten (siehe unten).

### Variante C — Alias mit JS-Fan-out

Drei Bausteine: ein Halter-State `0_userdata.0.Gruppen.<gruppe>_soll`,
ein Alias-Kanal `alias.0.Gruppen.<gruppe>` mit `LEVEL`-State (Rolle
`level.blind`, read+write auf den Halter) und ein JS-Trigger, der jeden
geschriebenen Sollwert auf alle Mitglieder verteilt. Der Trigger reagiert
nur auf Schreib-Kommandos (`ack=false`) und bestätigt den Halter danach
selbst mit `ack=true`.

**Richtig, wenn** die Gruppe wie ein echtes Gerät wirken soll: die
Devices-GUI erkennt sie als vollwertige Jalousie mit Slider, auch für
andere Adapter (Matter, Alexa) nicht von einem Einzelgerät zu
unterscheiden. **Preis:** höchste Komplexität — und das Skript muss
dauerhaft laufen, sonst verteilt niemand die Werte. Der angezeigte Wert
ist der zuletzt geschriebene Sollwert, nicht die echte Position der
Mitglieder (es gibt bewusst keinen Rückkanal).

## Was zeigt die Devices-Auto-GUI?

- **A:** zwei Button-Kacheln („… zu", „… auf") im zugewiesenen Raum.
- **B:** eine Kachel mit Slider/Level; die Erkennung als Jalousie hängt
  an der Rolle `level.blind` des Szenen-Objekts.
- **C:** eine normale Jalousie-Kachel mit Slider.

## `uncertain`-Verhalten bei Variante B

Der Szenen-Adapter vergleicht laufend die Ist-Werte aller Mitglieder mit
dem Gruppenwert. Solange alle Mitglieder denselben Wert haben, zeigt die
Gruppe diesen Wert. Fährt jemand ein einzelnes Mitglied separat
(Einzel-Slider, Wandtaster), laufen die Werte auseinander und die Gruppe
gilt als *uncertain*: sie zeigt keinen verlässlichen gemeinsamen Wert
mehr, GUIs stellen das je nach Visualisierung als unbestimmt/leer dar.
Das ist kein Fehler, sondern die ehrliche Antwort auf „die Gruppe hat
gerade keinen einheitlichen Zustand". Der nächste Schreibvorgang auf die
Gruppe synchronisiert alle Mitglieder wieder.

## Delete-and-rebuild und Marker

Anders als der Alias-Aufbau (Upsert) arbeitet `gruppen-aufbau.js` mit
Delete-and-rebuild: Bei jedem Lauf werden zuerst alle Objekte mit dem
Marker `native.gruppenAufbau === true` unter `scene.0.*`,
`alias.0.Gruppen.*` und `0_userdata.0.Gruppen.*` gelöscht (inklusive
Bereinigung der Enum-Mitgliedschaften) und danach aus `gruppen.json`
neu aufgebaut. Das ist hier unkritisch, weil an den Gruppen-Objekten —
anders als an den Geräte-Aliasen — keine Devices-Konfiguration hängt,
die einen Löschvorgang nicht überleben würde.

- Von Hand angelegte Szenen und fremde States tragen den Marker nicht
  und bleiben unangetastet.
- Enums und die Ordner-Objekte (`…Gruppen`) werden nie gelöscht;
  fehlende Enums legt das Skript mit Warnung neu an (Auflösung: erst
  exakte ID wie `enum.rooms.Zentrale`, dann Namens-Vergleich).
- Die Objekte von `alias-aufbau.js` (Marker `common.custom.aliasAufbau`)
  sind davon vollständig getrennt.

## Arbeitsablauf

1. `gruppen.json` in den Dateispeicher nach
   `0_userdata.0/configuration.read.by.scripts/` hochladen.
2. `gruppen-aufbau.js` als Javascript-Skript unter `common` anlegen und
   starten. Bei Variante C muss das Skript dauerhaft laufen (nicht nur
   einmalig), sonst fehlt der Fan-out-Trigger.
3. Gruppe ändern oder entfernen: `gruppen.json` anpassen, Skript neu
   starten — verschwundene Gruppen werden mitsamt Enum-Einträgen
   aufgeräumt.

Hinweis zum Zusammenspiel mit dem Dummy-Modus: Die Mitglieder zeigen auf
die Alias-States, nicht auf die Geräte dahinter. Eine Gruppe funktioniert
daher in beiden Modi unverändert — im Dummy-Modus bewegt sie eben die
Dummy-States.
