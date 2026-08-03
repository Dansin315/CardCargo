# Security

## Schutzmodell

CardCargo ist eine private Single-User-Anwendung. Der Zugriff wird auf drei Ebenen begrenzt:

1. `ALLOWED_USER_EMAIL` lässt in der Anwendung nur eine E-Mail-Adresse zu.
2. `app_owners` und Row Level Security beschränken Datenbank- und Storage-Zugriffe auf genau den eingetragenen Supabase-Auth-Benutzer.
3. Schreibende API-Routen prüfen Session, App-Owner und Request-Origin, bevor der serverseitige Secret-Key-Client verwendet wird.

## Secrets

- `SUPABASE_SECRET_KEY` ist ausschließlich serverseitig zulässig.
- Die Variable darf niemals mit `NEXT_PUBLIC_` beginnen.
- `.env.local` darf nicht eingecheckt werden.
- Bei versehentlicher Veröffentlichung muss der Schlüssel im Supabase-Dashboard sofort rotiert werden.

## Bildimport

- Angebotsseiten sind auf offizielle Bunjang-/Global-Bunjang-Hosts beschränkt.
- Serverseitige Bilddownloads erlauben nur HTTPS, Standardport 443 und öffentliche IP-Adressen.
- DNS-Ziele werden vor dem Abruf auf private und reservierte Adressbereiche geprüft und für die Verbindung fixiert.
- Redirects werden erneut validiert.
- Bilder sind auf 6 MB und acht Dateien je Einkauf begrenzt.
- JPEG, PNG, WebP und GIF werden anhand der tatsächlichen Dateisignatur geprüft.
- Browser-Uploads dürfen per Storage-RLS ausschließlich in den eigenen `staging`-Ordner geschrieben werden.
- Finale Archivpfade werden nur serverseitig geschrieben und bleiben privat.

## PWA/Offline

Der Service Worker speichert keine authentifizierten Seiten, API-Antworten oder Angebotsbilder. Er hält nur statische App-Dateien und eine neutrale Offline-Seite vor.
