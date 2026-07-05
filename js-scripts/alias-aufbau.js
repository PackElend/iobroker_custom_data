// ============================================================================
// ALIAS-AUFBAU  (ein Skript unter "common", Typ "Javascript")
//
// Liest die Konfiguration aus zwei JSON-Dateien im Dateispeicher:
//   0_userdata.0 : alias/vorlagen.json   (Vorlagen-Bibliothek, flache Tabelle)
//   0_userdata.0 : alias/mapping.json    ({ "modus": ..., "geraete": [...] })
//
// Modus (global in mapping.json):
//   "dummy" -> Aliase zeigen auf Dummy-States unter 0_userdata.0.dummy.*;
//              die Dummy-States werden bei Bedarf mit angelegt. Zum Testen
//              der Visualisierung im iobroker.devices-Adapter.
//   "echt"  -> Aliase zeigen auf die echten Z-Wave-States. Es werden KEINE
//              Dummy-States angelegt (vorhandene bleiben liegen).
//
// Upsert statt Delete-and-rebuild: Bestehende Alias-Objekte werden beim
// Modus-Wechsel NIE geloescht, es wird nur common.alias per extendObject()
// umgehaengt. Objekt-IDs, Enums, devices-Konfiguration und common.custom
// bleiben dadurch stabil. Mehrfache Laeufe im selben Modus schreiben nichts
// (Vergleich vor jedem extendObject).
//
// Script-verwaltete Objekte tragen den Marker common.custom.aliasAufbau=true.
// Nur getaggte Aliase, die nicht mehr in mapping.json stehen, werden
// aufgeraeumt. Manuell erstellte Objekte ohne Marker (und die Objekte von
// gruppen-aufbau.js, Marker native.gruppenAufbau) werden nie angefasst.
// ============================================================================

const FILE_ADAPTER = '0_userdata.0';
const FILE_VORLAGEN = 'alias/vorlagen.json';
const FILE_MAPPING = 'alias/mapping.json';

const DUMMY_WURZEL = '0_userdata.0.dummy';

// Optionale Aufraeumfunktion fuer die Dummy-States: bewusst NICHT automatisch.
// Bei Bedarf (sinnvoll erst im Modus "echt") auf true setzen, Skript einmal
// laufen lassen, danach wieder auf false stellen.
const DUMMIES_AUFRAEUMEN = false;

main();

async function main() {
    let vorlagenRows;
    let konfig;
    try {
        vorlagenRows = JSON.parse((await readFileAsync(FILE_ADAPTER, FILE_VORLAGEN)).toString());
        konfig = JSON.parse((await readFileAsync(FILE_ADAPTER, FILE_MAPPING)).toString());
    } catch (err) {
        log(`Konnte JSON-Konfig nicht lesen/parsen (liegen vorlagen.json/mapping.json unter ${FILE_ADAPTER}/alias/?): ${err}`, 'error');
        return;
    }

    const modus = konfig.modus;
    if (modus !== 'dummy' && modus !== 'echt') {
        log(`mapping.json: "modus" muss "dummy" oder "echt" sein (ist: ${JSON.stringify(modus)}). Abbruch.`, 'error');
        return;
    }
    const geraete = Array.isArray(konfig.geraete) ? konfig.geraete : [];

    if (DUMMIES_AUFRAEUMEN) {
        await dummiesAufraeumen();
    }

    const vorlagen = gruppiereVorlagen(vorlagenRows);

    for (const geraet of geraete) {
        await verarbeiteGeraet(geraet, vorlagen, modus);
    }

    await raeumeVerwaisteAliaseAuf(geraete);

    log(`alias-aufbau fertig (Modus: ${modus}).`, 'info');
}

// Flache Vorlagen-Zeilen -> { vorlageName: { channelRole, states: [...] } }
function gruppiereVorlagen(rows) {
    const out = {};
    for (const r of rows) {
        if (!out[r.vorlage]) {
            out[r.vorlage] = { channelRole: r.channelRole, states: [] };
        }
        out[r.vorlage].states.push(r);
    }
    return out;
}

async function verarbeiteGeraet(geraet, vorlagen, modus) {
    const def = vorlagen[geraet.vorlage];
    if (!def) {
        log(`Vorlage "${geraet.vorlage}" (fuer ${geraet.alias}) gibt es nicht in vorlagen.json. Geraet uebersprungen, bestehende Objekte bleiben unveraendert.`, 'error');
        return;
    }
    if (modus === 'dummy' && !geraet.zielDummy) {
        log(`${geraet.alias}: "zielDummy" fehlt in mapping.json. Geraet uebersprungen.`, 'error');
        return;
    }
    if (modus === 'echt' && !geraet.zielEcht) {
        log(`${geraet.alias}: "zielEcht" fehlt in mapping.json. Geraet uebersprungen.`, 'error');
        return;
    }

    // Im Dummy-Modus zuerst die Dummy-States sicherstellen, damit die
    // Alias-Ziele beim Upsert bereits existieren
    if (modus === 'dummy') {
        await dummyStatesSicherstellen(geraet, def);
    }

    await aliasUpsert(geraet, def, modus);
}

// ---------------------------------------------------------------------------
// Dummy-States: anlegen bzw. per extendObject angleichen, nie loeschen.
// Typ/Rolle/min/max/unit kommen aus der Vorlage, damit Dummy und echtes
// Geraet fuer den Type-Detector identisch aussehen. write ist immer true,
// damit sich in der Visualisierung auch Sensorwerte simulieren lassen.
// ---------------------------------------------------------------------------
async function dummyStatesSicherstellen(geraet, def) {
    await upsertObjekt(DUMMY_WURZEL, {
        type: 'folder',
        common: { name: 'Dummy-Geraete', custom: marker() },
        native: {},
    });
    await upsertObjekt(geraet.zielDummy, {
        type: 'channel',
        common: { name: `${geraet.alias} (Dummy)`, role: def.channelRole, custom: marker() },
        native: {},
    });

    for (const s of def.states) {
        const id = `${geraet.zielDummy}.${s.feld}`;
        const common = {
            name: s.feld,
            type: s.type,
            role: s.role,
            read: true,
            write: true,
            custom: marker(),
        };
        if (s.unit) common.unit = s.unit;
        if (istZahl(s.min)) common.min = Number(s.min);
        if (istZahl(s.max)) common.max = Number(s.max);

        const vorhanden = await getObjectAsync(id);
        if (!vorhanden) {
            await setObjectAsync(id, { type: 'state', common, native: {} });
            // Initialwert nur beim Erstanlegen (Jalousie-Level = 0,
            // Fenster = 0 = geschlossen), nicht bei jedem Lauf
            const init = istZahl(s.min) ? Number(s.min) : 0;
            await setStateAsync(id, init, true);
            log(`${id}: erstellt (Initialwert ${init}).`, 'info');
        } else if (commonWeichtAb(vorhanden.common, common)) {
            await extendObjectAsync(id, { common });
            log(`${id}: aktualisiert (an Vorlage angeglichen).`, 'info');
        }
    }
}

// ---------------------------------------------------------------------------
// Alias-Kanal + States: Upsert. Existiert das Objekt, wird nur bei
// Abweichung per extendObject angeglichen -- insbesondere das Ziel
// (common.alias) beim Modus-Wechsel. Objekt-IDs bleiben immer stabil.
// ---------------------------------------------------------------------------
async function aliasUpsert(geraet, def, modus) {
    const aliasId = `alias.0.${geraet.alias}`;

    await upsertObjekt(aliasId, {
        type: 'channel',
        common: { name: geraet.alias, role: def.channelRole, custom: marker() },
        native: {},
    });

    for (const s of def.states) {
        const stateId = `${aliasId}.${s.feld}`;

        // Ziel je Modus bestimmen. Getrennte Lese-/Schreib-Quellen sind ueber
        // die optionalen Vorlagen-Spalten "quelleLesen"/"quelleSchreiben"
        // abbildbar; sonst gilt "quelle" fuer beides.
        let zielLesen;
        let zielSchreiben;
        if (modus === 'dummy') {
            zielLesen = `${geraet.zielDummy}.${s.feld}`;
            zielSchreiben = zielLesen;
        } else {
            zielLesen = `${geraet.zielEcht}.${s.quelleLesen || s.quelle}`;
            zielSchreiben = `${geraet.zielEcht}.${s.quelleSchreiben || s.quelle}`;
        }

        // Im Echt-Modus muessen die Quellen existieren; sonst bleibt der
        // State unveraendert (er wird NICHT geloescht)
        if (modus === 'echt') {
            const fehlt = [];
            if (!(await getObjectAsync(zielLesen))) fehlt.push(zielLesen);
            if (zielSchreiben !== zielLesen && !(await getObjectAsync(zielSchreiben))) fehlt.push(zielSchreiben);
            if (fehlt.length) {
                log(`${stateId}: Quelle fehlt (${fehlt.join(', ')}). State bleibt unveraendert.`, s.pflicht ? 'error' : 'warn');
                continue;
            }
        }

        const aliasDef = {
            id: zielLesen === zielSchreiben ? zielLesen : { read: zielLesen, write: zielSchreiben },
        };
        // Wertumrechnung: nur echte Geraete brauchen sie (Z-Wave 0-99 -> %).
        // Dummy-States tragen bereits Alias-Werte. Bewusst "val" (Identitaet)
        // statt Weglassen, damit extendObject beim Wechsel echt -> dummy die
        // alte Umrechnung sicher ueberschreibt (extend kann keine Keys loeschen).
        if (s.lesen) aliasDef.read = modus === 'echt' ? s.lesen : 'val';
        if (s.schreiben) aliasDef.write = modus === 'echt' ? s.schreiben : 'val';

        // Rolle immer explizit aus der Vorlage: der Type-Detector des
        // devices-Adapters braucht praezise Rollen wie level.blind
        const common = {
            name: s.feld,
            role: s.role,
            type: s.type,
            read: s.read,
            write: s.write,
            alias: aliasDef,
            custom: marker(),
        };
        if (s.unit) common.unit = s.unit;
        if (istZahl(s.min)) common.min = Number(s.min);
        if (istZahl(s.max)) common.max = Number(s.max);

        const vorhanden = await getObjectAsync(stateId);
        if (!vorhanden) {
            await setObjectAsync(stateId, { type: 'state', common, native: {} });
            log(`${stateId}: erstellt (Ziel: ${zielText(aliasDef.id)}).`, 'info');
        } else if (!commonWeichtAb(vorhanden.common, common)) {
            log(`${stateId}: unveraendert.`, 'info');
        } else {
            const altZiel = zielText(vorhanden.common && vorhanden.common.alias && vorhanden.common.alias.id);
            await extendObjectAsync(stateId, { common });
            const neuZiel = zielText(aliasDef.id);
            if (altZiel !== neuZiel) {
                log(`${stateId}: Ziel geaendert (${altZiel} -> ${neuZiel}).`, 'info');
            } else {
                log(`${stateId}: aktualisiert (Rolle/Typ/Umrechnung angeglichen).`, 'info');
            }
        }
    }

    // Getaggte States am Kanal, deren Feld nicht mehr in der Vorlage steht,
    // entfernen (z.B. nach Umbenennung eines Feldes)
    const gueltig = new Set(def.states.map((s) => `${aliasId}.${s.feld}`));
    for (const id of sammleIds(`state[id=${aliasId}.*]`)) {
        if (gueltig.has(id)) continue;
        const obj = await getObjectAsync(id);
        if (hatMarker(obj)) {
            await deleteObjectAsync(id);
            log(`${id}: entfernt (Feld nicht mehr in Vorlage).`, 'info');
        }
    }
}

// ---------------------------------------------------------------------------
// Aufraeumen: nur getaggte Alias-Kanaele, die nicht mehr in mapping.json
// stehen. Objekte ohne Marker werden nie angefasst.
// ---------------------------------------------------------------------------
async function raeumeVerwaisteAliaseAuf(geraete) {
    const bekannt = new Set(geraete.map((g) => `alias.0.${g.alias}`));
    for (const id of sammleIds('channel[id=alias.0.*]')) {
        if (bekannt.has(id)) continue;
        const obj = await getObjectAsync(id);
        if (hatMarker(obj)) {
            await deleteObjectAsync(id, true);
            log(`${id}: entfernt (nicht mehr in mapping.json).`, 'info');
        }
    }
}

// Loescht ALLE getaggten Dummy-Objekte unter 0_userdata.0.dummy.*.
// Wird nur ausgefuehrt, wenn DUMMIES_AUFRAEUMEN oben auf true steht.
async function dummiesAufraeumen() {
    const ids = [
        ...sammleIds(`state[id=${DUMMY_WURZEL}.*]`),
        ...sammleIds(`channel[id=${DUMMY_WURZEL}.*]`),
    ];
    for (const id of ids) {
        const obj = await getObjectAsync(id);
        if (hatMarker(obj)) {
            await deleteObjectAsync(id, true);
            log(`${id}: Dummy entfernt.`, 'info');
        }
    }
    log('Dummy-Aufraeumen abgeschlossen. DUMMIES_AUFRAEUMEN wieder auf false stellen.', 'warn');
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

// Marker fuer script-verwaltete Objekte (js-controller verlangt fuer
// common.custom lediglich ein Objekt, keine bestimmten Schluessel)
function marker() {
    return { aliasAufbau: true };
}

function hatMarker(obj) {
    return !!(obj && obj.common && obj.common.custom && obj.common.custom.aliasAufbau === true);
}

// Nicht-State-Objekte (Ordner/Kanal) anlegen bzw. angleichen, nie loeschen
async function upsertObjekt(id, objDef) {
    const vorhanden = await getObjectAsync(id);
    if (!vorhanden) {
        await setObjectAsync(id, objDef);
        log(`${id}: erstellt.`, 'info');
    } else if (commonWeichtAb(vorhanden.common, objDef.common)) {
        await extendObjectAsync(id, { common: objDef.common });
        log(`${id}: aktualisiert.`, 'info');
    }
}

// Vergleicht nur die Felder, die dieses Skript verwaltet. Fremde
// common.custom-Eintraege (z.B. history.0) werden ignoriert und bleiben
// durch extendObject ohnehin erhalten. Schluessel-Reihenfolge ist egal.
function commonWeichtAb(ist, soll) {
    ist = ist || {};
    for (const key of Object.keys(soll)) {
        if (key === 'custom') {
            if (!(ist.custom && ist.custom.aliasAufbau === true)) return true;
            continue;
        }
        if (stabil(ist[key]) !== stabil(soll[key])) return true;
    }
    return false;
}

// JSON-Serialisierung mit sortierten Schluesseln (fuer stabile Vergleiche)
function stabil(x) {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
        const sortiert = {};
        for (const k of Object.keys(x).sort()) sortiert[k] = x[k];
        return JSON.stringify(sortiert);
    }
    return JSON.stringify(x);
}

// Ziel-Angabe (String oder {read, write}) lesbar machen
function zielText(id) {
    if (id === undefined || id === null) return '(kein Ziel)';
    if (typeof id === 'string') return id;
    return `lesen: ${id.read}, schreiben: ${id.write}`;
}

function istZahl(v) {
    return v !== '' && v !== null && v !== undefined && !isNaN(Number(v));
}

function sammleIds(selektor) {
    const ids = [];
    $(selektor).each((id) => ids.push(id));
    return ids;
}
