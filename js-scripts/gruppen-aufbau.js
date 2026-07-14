// ============================================================================
// GRUPPEN-AUFBAU  (ein Skript unter "common", Typ "Javascript")
//
// Liest die Gruppen-Konfiguration aus einer flachen JSON-Tabelle im
// Dateispeicher:
//   0_userdata.0 : configuration.read.by.scripts/gruppen.json
//
// Baut daraus pro Gruppe eine von drei Varianten:
//   A = zwei Szenen als "Taster" (scene.0.<gruppe>_auf / _zu, feste Werte)
//   B = eine virtuelle Gruppe    (scene.0.<gruppe>, virtualGroup, stufenlos)
//   C = Alias mit JS-Fan-out     (alias.0.Gruppen.<gruppe> + 0_userdata-Halter)
//
// Dieses Skript enthaelt KEINE Konfiguration und wird bei normaler Nutzung
// nicht angefasst.
//
// Idempotent (delete-and-rebuild): Bei jedem Lauf werden zuerst ALLE frueher
// von diesem Skript erzeugten Objekte geloescht und danach neu angelegt.
// Erkennungs-Marker ist native.gruppenAufbau === true. Bewusst NICHT
// common.custom: dieses Feld ist vom js-controller fuer Einstellungen von
// Adapter-Instanzen reserviert (Schluessel wie "history.0"), fremde
// Schluessel dort koennen verworfen werden. Objekte ohne Marker (fremde
// Szenen, fremde States unter den Gruppen-Ordnern) werden nie angetastet.
//
// Enums (Raum/Funktion) werden nie geloescht, nur die eigenen Mitglieds-IDs
// darin bereinigt bzw. neu eingetragen. Fehlt ein Enum, wird es mit Warnung
// neu angelegt, denn ohne Enum-Zuweisung nimmt der Devices-Adapter die
// Objekte nicht in seine Auto-GUI auf.
// ============================================================================

const FILE_ADAPTER = '0_userdata.0';
const FILE_GRUPPEN = 'configuration.read.by.scripts/gruppen.json';

main();

async function main() {
    let gruppen;
    try {
        gruppen = JSON.parse((await readFileAsync(FILE_ADAPTER, FILE_GRUPPEN)).toString());
    } catch (err) {
        log(`Konnte JSON-Konfig nicht lesen/parsen (liegt gruppen.json unter ${FILE_ADAPTER}/configuration.read.by.scripts/?): ${err}`, 'error');
        return;
    }

    // Szenen-Adapter pruefen: fuer Variante A/B noetig. Nur warnen, nicht installieren.
    const brauchtSzenen = gruppen.some((g) => g.variante === 'A' || g.variante === 'B');
    if (brauchtSzenen && !(await getObjectAsync('system.adapter.scenes.0'))) {
        log('Szenen-Adapter (system.adapter.scenes.0) nicht gefunden. Varianten A/B werden angelegt, aber nichts fuehrt sie aus. Bitte iobroker.scenes installieren.', 'warn');
    }

    // 1) Alles Eigene loeschen, 2) Enum-Reste bereinigen, 3) neu aufbauen
    const geloescht = await aufraeumen();
    await enumsBereinigen(geloescht);

    const benutzteNamen = new Set();
    for (const g of gruppen) {
        if (!g.gruppe || !['A', 'B', 'C'].includes(g.variante)) {
            log(`Eintrag ohne gueltigen "gruppe"-Namen oder "variante" (A/B/C): ${JSON.stringify(g)}. Uebersprungen.`, 'error');
            continue;
        }
        if (benutzteNamen.has(g.gruppe)) {
            log(`Gruppe "${g.gruppe}" ist doppelt in gruppen.json. Zweiter Eintrag uebersprungen.`, 'error');
            continue;
        }
        benutzteNamen.add(g.gruppe);

        // Enum-Zuweisung ist Pflicht, sonst taucht die Gruppe nie in der Auto-GUI auf
        if (!g.raum || !g.funktion) {
            log(`Gruppe "${g.gruppe}": "raum" und "funktion" sind Pflicht (Devices-Adapter braucht die Enums). Uebersprungen.`, 'error');
            continue;
        }

        const mitglieder = await pruefeMitglieder(g);
        if (mitglieder.length === 0) {
            log(`Gruppe "${g.gruppe}": kein einziges Mitglied vorhanden. Uebersprungen.`, 'error');
            continue;
        }

        if (g.variante === 'A') await baueVarianteA(g, mitglieder);
        if (g.variante === 'B') await baueVarianteB(g, mitglieder);
        if (g.variante === 'C') await baueVarianteC(g, mitglieder);
    }

    log('gruppen-aufbau fertig.', 'info');
}

// ---------------------------------------------------------------------------
// Aufraeumen: alle frueher von diesem Skript erzeugten Objekte loeschen.
// Liefert die Menge der geloeschten IDs (fuer die Enum-Bereinigung).
// ---------------------------------------------------------------------------
async function aufraeumen() {
    const geloescht = new Set();

    // Eigene Szenen (Variante A und B)
    for (const id of sammleIds("state[id=scene.0.*]")) {
        if (await hatMarker(id)) {
            await deleteObjectAsync(id);
            geloescht.add(id);
            log(`Alte Szene entfernt: ${id}`, 'info');
        }
    }

    // Eigene Alias-Kanaele (Variante C), rekursiv inkl. LEVEL-State
    for (const id of sammleIds("channel[id=alias.0.Gruppen.*]")) {
        if (await hatMarker(id)) {
            await deleteObjectAsync(id, true);
            geloescht.add(id);
            geloescht.add(`${id}.LEVEL`);
            log(`Alter Gruppen-Alias entfernt: ${id}`, 'info');
        }
    }

    // Eigene Halter-States (Variante C). Die Ordner-Objekte selbst bleiben
    // stehen, sie koennten fremde States enthalten.
    for (const id of sammleIds("state[id=0_userdata.0.Gruppen.*]")) {
        if (await hatMarker(id)) {
            await deleteObjectAsync(id);
            geloescht.add(id);
            log(`Alter Halter-State entfernt: ${id}`, 'info');
        }
    }

    return geloescht;
}

function sammleIds(selektor) {
    const ids = [];
    $(selektor).each((id) => ids.push(id));
    return ids;
}

async function hatMarker(id) {
    const obj = await getObjectAsync(id);
    return !!(obj && obj.native && obj.native.gruppenAufbau === true);
}

// Geloeschte IDs aus allen Raum-/Funktions-Enums entfernen
async function enumsBereinigen(geloescht) {
    if (geloescht.size === 0) return;
    for (const art of ['rooms', 'functions']) {
        for (const e of getEnums(art)) {
            const obj = await getObjectAsync(e.id);
            if (!obj || !obj.common || !Array.isArray(obj.common.members)) continue;
            const rest = obj.common.members.filter((m) => !geloescht.has(m));
            if (rest.length !== obj.common.members.length) {
                obj.common.members = rest;
                await setObjectAsync(e.id, obj);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Mitglieder pruefen: fehlende IDs nur mit Warnung ueberspringen, nie abbrechen
// ---------------------------------------------------------------------------
async function pruefeMitglieder(g) {
    const vorhanden = [];
    for (const id of g.mitglieder || []) {
        if (await getObjectAsync(id)) {
            vorhanden.push(id);
        } else {
            log(`Gruppe "${g.gruppe}": Mitglied ${id} existiert nicht und wird uebersprungen.`, 'warn');
        }
    }
    return vorhanden;
}

// ---------------------------------------------------------------------------
// Variante A: zwei Szenen als Taster (feste Werte fuer "zu" und "auf")
// ---------------------------------------------------------------------------
async function baueVarianteA(g, mitglieder) {
    if (g.wertZu === null || g.wertZu === undefined || g.wertAuf === null || g.wertAuf === undefined) {
        log(`Gruppe "${g.gruppe}" (Variante A): "wertZu" und "wertAuf" sind Pflicht. Uebersprungen.`, 'error');
        return;
    }

    const taster = [
        { suffix: '_zu', beschriftung: 'zu', wert: g.wertZu },
        { suffix: '_auf', beschriftung: 'auf', wert: g.wertAuf },
    ];

    for (const t of taster) {
        const id = `scene.0.${g.gruppe}${t.suffix}`;
        await setObjectAsync(id, {
            type: 'state',
            common: {
                name: `${g.name || g.gruppe} ${t.beschriftung}`,
                type: 'boolean',
                role: 'scene.state',
                enabled: true,
                read: true,
                write: true,
                def: false,
                engine: 'system.adapter.scenes.0',
            },
            native: {
                gruppenAufbau: true,
                onTrue: { trigger: {}, cron: null, astro: null },
                onFalse: { enabled: false, trigger: {}, cron: null, astro: null },
                easy: true,
                burstInterval: 0,
                virtualGroup: false,
                members: mitglieder.map((m) => ({
                    id: m,
                    setIfTrue: t.wert,
                    setIfFalse: null,
                    stopAllDelays: true,
                    desc: null,
                    disabled: false,
                    delay: 0,
                })),
            },
        });
        await enumZuweisen('rooms', g.raum, id, g.gruppe);
        await enumZuweisen('functions', g.funktion, id, g.gruppe);
    }
    log(`Gruppe "${g.gruppe}" (Variante A) angelegt: scene.0.${g.gruppe}_zu / _auf.`, 'info');
}

// ---------------------------------------------------------------------------
// Variante B: eine virtuelle Gruppe (Wert wird 1:1 auf alle Mitglieder kopiert)
// ---------------------------------------------------------------------------
async function baueVarianteB(g, mitglieder) {
    const id = `scene.0.${g.gruppe}`;
    await setObjectAsync(id, {
        type: 'state',
        common: {
            name: g.name || g.gruppe,
            type: 'mixed',
            role: 'level.blind',
            enabled: true,
            read: true,
            write: true,
            engine: 'system.adapter.scenes.0',
        },
        native: {
            gruppenAufbau: true,
            onTrue: { trigger: {}, cron: null, astro: null },
            onFalse: { enabled: false, trigger: {}, cron: null, astro: null },
            easy: true,
            burstInterval: 0,
            virtualGroup: true,
            members: mitglieder.map((m) => ({
                id: m,
                setIfTrue: null,
                setIfFalse: null,
                stopAllDelays: true,
                desc: null,
                disabled: false,
                delay: 0,
            })),
        },
    });
    await enumZuweisen('rooms', g.raum, id, g.gruppe);
    await enumZuweisen('functions', g.funktion, id, g.gruppe);
    log(`Gruppe "${g.gruppe}" (Variante B) angelegt: ${id}.`, 'info');
}

// ---------------------------------------------------------------------------
// Variante C: 0_userdata-Halter + Alias mit level.blind + JS-Fan-out-Trigger
// ---------------------------------------------------------------------------
async function baueVarianteC(g, mitglieder) {
    const sollId = `0_userdata.0.Gruppen.${g.gruppe}_soll`;
    const aliasId = `alias.0.Gruppen.${g.gruppe}`;

    // Ordner sicherstellen (ohne Marker, werden beim Aufraeumen nie geloescht)
    await ordnerSicherstellen('0_userdata.0.Gruppen');
    await ordnerSicherstellen('alias.0.Gruppen');

    // Halter-State: traegt den Gruppen-Sollwert
    await setObjectAsync(sollId, {
        type: 'state',
        common: {
            name: `${g.name || g.gruppe} Sollwert`,
            type: 'number',
            role: 'level.blind',
            unit: '%',
            min: 0,
            max: 100,
            read: true,
            write: true,
        },
        native: { gruppenAufbau: true },
    });

    // Alias-Kanal: erscheint im Devices-Adapter als "echte" Jalousie
    await setObjectAsync(aliasId, {
        type: 'channel',
        common: { name: g.name || g.gruppe, role: 'blind' },
        native: { gruppenAufbau: true },
    });
    await setObjectAsync(`${aliasId}.LEVEL`, {
        type: 'state',
        common: {
            name: 'LEVEL',
            type: 'number',
            role: 'level.blind',
            unit: '%',
            min: 0,
            max: 100,
            read: true,
            write: true,
            alias: { id: { read: sollId, write: sollId } },
        },
        native: { gruppenAufbau: true },
    });

    // Fan-out: jede Schreib-Aktion (ack=false) auf den Halter geht an alle
    // Mitglieder. Danach wird der Halter mit ack=true bestaetigt, damit die
    // GUI den Wert als uebernommen anzeigt (und der Trigger nicht erneut zieht).
    on({ id: sollId, change: 'any', ack: false }, async (obj) => {
        const wert = obj.state.val;
        for (const m of mitglieder) {
            await setStateAsync(m, wert, false);
        }
        await setStateAsync(sollId, wert, true);
    });

    await enumZuweisen('rooms', g.raum, aliasId, g.gruppe);
    await enumZuweisen('functions', g.funktion, aliasId, g.gruppe);
    log(`Gruppe "${g.gruppe}" (Variante C) angelegt: ${aliasId} -> ${sollId} -> ${mitglieder.length} Mitglieder.`, 'info');
}

async function ordnerSicherstellen(id) {
    if (!(await getObjectAsync(id))) {
        await setObjectAsync(id, { type: 'folder', common: { name: 'Gruppen' }, native: {} });
    }
}

// ---------------------------------------------------------------------------
// Enum-Zuweisung: erst exakte ID, dann Namens-Treffer, sonst neu anlegen.
// Enums werden nie geloescht, nur Mitglieder gepflegt.
// ---------------------------------------------------------------------------
async function enumZuweisen(art, gesucht, objektId, gruppe) {
    const alle = getEnums(art);
    let ziel = alle.find((e) => e.id === `enum.${art}.${gesucht}`);
    if (!ziel) {
        ziel = alle.find((e) => enumName(e.name).toLowerCase() === String(gesucht).toLowerCase());
    }

    if (!ziel) {
        const neuId = `enum.${art}.${String(gesucht).replace(/[^\w]/g, '_')}`;
        await setObjectAsync(neuId, {
            type: 'enum',
            common: { name: gesucht, members: [objektId] },
            native: {},
        });
        log(`Gruppe "${gruppe}": Enum "${gesucht}" (${art}) gab es nicht und wurde neu angelegt: ${neuId}.`, 'warn');
        return;
    }

    const obj = await getObjectAsync(ziel.id);
    if (!obj.common.members) obj.common.members = [];
    if (!obj.common.members.includes(objektId)) {
        obj.common.members.push(objektId);
        await setObjectAsync(ziel.id, obj);
    }
}

// Enum-Namen koennen mehrsprachige Objekte sein ({de: ..., en: ...})
function enumName(n) {
    if (n && typeof n === 'object') return n.de || n.en || '';
    return n || '';
}
