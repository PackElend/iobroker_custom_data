// ============================================================================
// LOGIK  (ein Skript unter "common", Typ "Javascript")
//
// Liest die Konfiguration aus zwei flachen JSON-Tabellen im Dateispeicher:
//   0_userdata.0 : alias/vorlagen.json   (Vorlagen-Bibliothek)
//   0_userdata.0 : alias/mapping.json    (welche Node -> welche Vorlage)
//
// Beide sind in jsontable.app als Tabelle editierbar. Dieses Skript enthält
// KEINE Konfiguration und wird bei normaler Nutzung nicht angefasst.
//
// Idempotent: baut bei jedem Lauf jeden Alias komplett neu (deleteObject +
// setObject). "Neu anlegen" und "anpassen" sind damit derselbe Vorgang.
// ============================================================================

const FILE_ADAPTER = '0_userdata.0';
const FILE_VORLAGEN = 'alias/vorlagen.json';
const FILE_MAPPING = 'alias/mapping.json';

main();

async function main() {
    let vorlagenRows;
    let mappingRows;
    try {
        vorlagenRows = JSON.parse((await readFileAsync(FILE_ADAPTER, FILE_VORLAGEN)).toString());
        mappingRows = JSON.parse((await readFileAsync(FILE_ADAPTER, FILE_MAPPING)).toString());
    } catch (err) {
        log(`Konnte JSON-Konfig nicht lesen/parsen (liegen vorlagen.json/mapping.json unter ${FILE_ADAPTER}/alias/?): ${err}`, 'error');
        return;
    }

    const vorlagen = gruppiereVorlagen(vorlagenRows);

    for (const eintrag of mappingRows) {
        await baueAlias(eintrag, vorlagen);
    }
    log('alias-aufbau fertig.', 'info');
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

async function baueAlias({ node, alias, vorlage }, vorlagen) {
    const def = vorlagen[vorlage];
    if (!def) {
        log(`Vorlage "${vorlage}" (für ${alias}) gibt es nicht in vorlagen.json. Gerät übersprungen.`, 'error');
        return;
    }

    const aliasId = `alias.0.${alias}`;

    // Pflicht-Quellen prüfen
    for (const s of def.states) {
        if (!s.pflicht) continue;
        const quelleId = `${node}.${s.quelle}`;
        if (!(await getObjectAsync(quelleId))) {
            log(`Pflicht-Quelle fehlt: ${quelleId} (${alias}/${s.feld}). Gerät übersprungen.`, 'error');
            return;
        }
    }

    // bestehenden Alias komplett entfernen -> macht den Lauf wiederholbar
    if (await getObjectAsync(aliasId)) {
        await deleteObjectAsync(aliasId, true);
        log(`Bestehenden Alias entfernt: ${aliasId}`, 'info');
    }

    // Ordner (Channel) anlegen
    await setObjectAsync(aliasId, {
        type: 'channel',
        common: { name: alias, role: def.channelRole },
        native: {},
    });

    // States anlegen
    for (const s of def.states) {
        const quelleId = `${node}.${s.quelle}`;
        if (!(await getObjectAsync(quelleId))) {
            log(`Optionale Quelle fehlt, Feld übersprungen: ${quelleId} (${alias}/${s.feld})`, 'warn');
            continue;
        }

        const common = {
            name: s.feld,
            role: s.role,
            type: s.type,
            read: s.read,
            write: s.write,
            alias: { id: quelleId },
        };
        if (s.unit) common.unit = s.unit;
        if (s.min !== '' && s.min !== undefined && s.min !== null) common.min = Number(s.min);
        if (s.max !== '' && s.max !== undefined && s.max !== null) common.max = Number(s.max);
        if (s.lesen) common.alias.read = s.lesen;
        if (s.schreiben) common.alias.write = s.schreiben;

        await setObjectAsync(`${aliasId}.${s.feld}`, { type: 'state', common, native: {} });
    }

    log(`Alias "${aliasId}" (${vorlage}) angelegt.`, 'info');
}
