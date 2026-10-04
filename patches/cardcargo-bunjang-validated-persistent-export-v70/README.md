# CardCargo – Bunjang Validated + Persistent Export v70

## Was die Bunjang-Meldung bedeutet

`주문정보를 조회 할 수 없습니다` bedeutet, dass eine aus den Netzwerkdaten
gefundene numerische ID keine gültige `/purchases/<id>`-Bestelldetailseite war.

v70 bewertet Kandidaten nach Herkunft, validiert die gerenderte Detailseite und
markiert falsche Kandidaten dauerhaft als ungültig. Sie werden danach nicht mehr
geöffnet und niemals exportiert.

## Export ist jetzt persistent

Nach **jeder erfolgreich gelesenen Detailseite** wird der aktuelle gültige
Teil-Batch in `chrome.storage.local` gespeichert.

Dadurch bleiben bereits gelesene Daten erhalten, selbst wenn:

- das Extension-Popup geschlossen wird;
- das Popup später neu geöffnet wird;
- eine folgende Bestell-ID ungültig ist;
- du erst später auf Pause oder Beenden klickst.

Beim erneuten Öffnen des Popups wird der letzte Zwischenstand wiederhergestellt
und `Bisherige Daten erneut kopieren` ist verfügbar.

## Pause / Beenden

Beim Klick auf Pause oder Beenden wird der zuletzt persistierte gültige
Zwischenstand sofort in die Zwischenablage kopiert.

Wenn noch keine einzige gültige Detailseite gelesen wurde, gibt es bewusst
keinen leeren Import-Batch.
