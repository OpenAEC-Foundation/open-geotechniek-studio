# Open Geotechniek Studio 0.4.3

- Desktop en browser gebruiken dezelfde laagdetectie en PDF-renderer. Rapporten met meerdere sonderingen hebben dezelfde pagina-indeling en respecteren dezelfde sectiekeuze.
- De desktopexport schrijft dezelfde PDF-bytes als de preview via de native bestandsdialoog.
- Conusweerstanden boven de grafiekschaal worden binnen het tekenvak afgeknipt; de werkelijke piekwaarde blijft vermeld.
- Platformopslag is gecontroleerd op het bewaren van gekoppelde berekeningen, opnieuw openen en versieconflicten.
- Paaldraagvermogen is rechtstreeks toegankelijk vanuit Berekeningen, ook vanuit een lege werkruimte. De module koppelt aan de actieve sondering en behoudt opgeslagen module-ID's.
- Op smalle vensters staan de rekenpanelen onder elkaar en blijven grafiek en uitkomsten bereikbaar. Een lege grafiek legt uit hoe een sondering wordt gekoppeld.
- De paaluitdraai bevat projectgegevens en een samenvatting op het eerste blad. Formules en tabelcellen lopen om binnen de marges; vervolgbladen hebben herkenbare koppen en grafieken blijven binnen hun tekenvak. Iedere pagina is als CONCEPT gemarkeerd.

De paaldraagvermogenmodule blijft concept. Aanvullende projectvergelijkingen zijn lokaal uitgevoerd en leveren geen volledige rekenvalidatie. Private validatiebestanden worden niet meegeleverd.

De platformbundel heeft geen eigen backend of login. De opslagadapter gebruikt de bestaande hostomgeving. Concrete Frappe-endpoints en autorisatie worden door het platform geleverd; een actieve Frappe-site is niet onderdeel van de lokale contracttests.

De Windows-installer bevat de WebView2-bootstrapper en de loader-DLL. De bootstrapper downloadt de runtime tijdens installatie wanneer deze ontbreekt.
