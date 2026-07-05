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
| [js-scripts/gruppen-aufbau.js](js-scripts/gruppen-aufbau.js) | Baut Gruppen-Objekte aus gruppen.json (delete-and-rebuild) |

Die JSON-Dateien werden in den ioBroker-Dateispeicher unter
`0_userdata.0 : alias/` hochgeladen (dort lesen die Skripte sie per
`readFileAsync`). Das Git-Repo ist die führende Quelle.

## Gruppen-Steuerung (gruppen.json + gruppen-aufbau.js)

Pro Gruppe ein Eintrag (flache Tabelle, wie vorlagen/mapping in
jsontable.app editierbar):

| Feld | Bedeutung |
|---|---|
| `gruppe` | Technischer Name, wird Teil der Objekt-ID (keine Leer-/Sonderzeichen) |
| `name` | Anzeigename in der GUI |
| `variante` | `"A"`, `"B"` oder `"C"` (siehe unten) |
| `raum`, `funktion` | Enum-Zuweisung — Pflicht, sonst erscheint die Gruppe nicht in der Devices-Auto-GUI |
| `wertZu`, `wertAuf` | Nur Variante A: feste Zielwerte der beiden Taster; bei B/C `null` |
| `mitglieder` | Liste der Alias-State-IDs (in diesem Setup der `SET`-Datenpunkt, z. B. `alias.0.ShellyWaveShutter.SET`) |

Fehlende Mitglieds-IDs werden mit Warnung übersprungen, nicht abgebrochen.
Voraussetzung für Variante A/B ist ein installierter `iobroker.scenes`-Adapter
(das Skript prüft das und warnt nur).

### Wann welche Variante?

**Variante A — Szene als Taster.** Zwei `scene.0.*`-Boolean-Objekte
(`<gruppe>_zu`, `<gruppe>_auf`). Die Devices-GUI rendert je eine Kachel mit
Button. Richtig, wenn "alles zu / alles auf" reicht: minimalste Objekte, kein
JS zur Laufzeit, kein Extra-State. Kein Slider, keine Zwischenwerte.

**Variante B — virtuelle Gruppe.** Ein `scene.0.<gruppe>`-Objekt mit
`virtualGroup: true` und Rolle `level.blind`. Ein geschriebener Wert (0–100)
wird vom Szenen-Adapter direkt auf alle Mitglieder kopiert — stufenlos, ohne
JS. Richtig als Mittelweg: Slider ohne Zusatz-Objekte. Einschränkung ist das
`uncertain`-Verhalten (siehe unten).

**Variante C — Alias mit JS-Fan-out.** Ein `0_userdata.0.Gruppen.<gruppe>_soll`-
Halter, ein `alias.0.Gruppen.<gruppe>`-Kanal mit `LEVEL`-State (Rolle
`level.blind`) und ein JS-Trigger, der jeden geschriebenen Sollwert auf alle
Mitglieder verteilt. Die Devices-GUI erkennt die Gruppe als vollwertige
Jalousie mit Slider — nicht von einem Einzelgerät zu unterscheiden. Richtig,
wenn die Gruppe wie ein echtes Gerät wirken soll (auch für andere Adapter wie
Matter/Alexa). Preis: höchste Komplexität, das Skript muss dauerhaft laufen,
sonst verteilt niemand die Werte.

### Was zeigt die Devices-Auto-GUI?

- **A:** zwei Button-Kacheln ("… zu", "… auf") im zugewiesenen Raum.
- **B:** eine Kachel mit Slider/Level; die Erkennung als Jalousie hängt an der
  Rolle `level.blind` des Szenen-Objekts.
- **C:** eine normale Jalousie-Kachel mit Slider; der angezeigte Wert ist der
  zuletzt geschriebene Gruppen-Sollwert (nicht die echte Position der
  Mitglieder — es gibt bewusst keinen Rückkanal).

### `uncertain`-Verhalten bei Variante B

Der Szenen-Adapter vergleicht laufend die Ist-Werte aller Mitglieder mit dem
Gruppenwert. Solange alle Mitglieder denselben Wert haben, zeigt die Gruppe
diesen Wert. Fährt jemand ein einzelnes Mitglied separat (Einzel-Slider,
Wandtaster), laufen die Werte auseinander und die Gruppe gilt als *uncertain*:
sie zeigt dann keinen verlässlichen gemeinsamen Wert mehr, GUIs stellen das
je nach Visualisierung als unbestimmt/leer dar. Das ist kein Fehler, sondern
die ehrliche Antwort auf "die Gruppe hat gerade keinen einheitlichen Zustand".
Der nächste Schreibvorgang auf die Gruppe synchronisiert alle Mitglieder
wieder und der Zustand wird wieder eindeutig.

### Delete-and-rebuild / Marker

`gruppen-aufbau.js` löscht bei jedem Lauf zuerst alle Objekte mit dem Marker
`native.gruppenAufbau === true` unter `scene.0.*`, `alias.0.Gruppen.*` und
`0_userdata.0.Gruppen.*` (inkl. Bereinigung der Enum-Mitgliedschaften) und
baut dann alles aus `gruppen.json` neu. Von Hand angelegte Szenen oder fremde
States in diesen Zweigen tragen den Marker nicht und bleiben unangetastet.
Enums und die Ordner-Objekte (`…Gruppen`) werden nie gelöscht; fehlende Enums
legt das Skript mit Warnung neu an.
