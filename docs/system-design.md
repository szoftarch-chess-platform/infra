# Online sakkplatform – Rendszerterv (dokumentációváz)

> Ez a fájl a dokumentáció váza. A `> Kifejtendő:` blokkok azt jelzik, mit kell az adott pontba írni,
> a `> Forrás:` blokkok azt, honnan vehető át a tartalom (a repók ADR-jei és architektúra-leírásai angolul vannak,
> ezeket kell magyarra átültetni). A **[ÚJ]** jelölésű pontok a második körben kerültek be,
> az **[AZURE]** jelölésűek a tervezett Azure-telepítés miatt.
> A végleges dokumentumból ezek a blokkok és jelölések törlendők.
>
> **Felelősök:** minden fejezet alatt egy `> **Felelős:**` sor jelzi, ki írja. Az `infra` az `infra` repó
> (Envoy, Docker Compose, adattárolók) gazdáját jelenti; ha nincs ilyen, ki kell jelölni valakit.
> A `közös` fejezeteket egy ember szerkeszti, a többiek a saját részükkel adnak hozzá.
>
> | Felelős | Önálló fejezetek | Rész a közös fejezetekből |
> |---|---|---|
> | frontend | 2.2.2, 2.9 | 2.5, 2.6, 2.10–2.13, 2.15, 4 |
> | platform-service | 2.2.3, 2.8.1, 2.8.2 | 2.3, 2.5, 2.6, 2.10–2.13, 2.15, 4 |
> | game-service | 2.2.4, 2.7, 2.8.3 | 2.3, 2.6, 2.10–2.13, 2.15, 4 |
> | engine-service | 2.2.5 | 2.3, 2.6, 2.10–2.13, 2.15, 4 |
> | infra | 2.2.1, 2.2.6–2.2.8, 2.4 (benne az Azure-környezet), 3 | 2.5, 2.12, 2.13, 4 |
> | közös | 1, 2.1, 2.14, 5–7 | – |

---

## Címlap

- Rendszerterv
- Online sakkplatform fejlesztése
- Szoftverarchitektúrák tárgy házi feladat
- Készítették: Borsik Balázs, Fehér Anna, Sipos Bence, Személyi Balázs András
- Dátum

---

## Tartalom

0. [Követelményspecifikáció (kész)](#0-követelményspecifikáció-kész)
1. [A rendszer célja és funkciói](#1-a-rendszer-célja-és-funkciói)
   1. Feladatkiírás
   2. A rendszer által biztosítandó tipikus funkciók
2. [Megvalósítás](#2-megvalósítás)
   1. Architektúra
   2. Komponensek
   3. Szolgáltatások közötti kommunikáció és interfészek
   4. Telepítési diagram **[ÚJ]**
      1. Helyi futtatás (Docker Compose)
      2. Éles környezet (Azure) **[AZURE]**
   5. Hitelesítés és biztonság
   6. Fő folyamatok
   7. A játszma állapotai **[ÚJ]**
   8. Adat- és adatbázisterv
   9. GUI-terv
   10. A use case-ek leképezése a komponensekre **[ÚJ]**
   11. Hibakezelés és hibatűrés **[ÚJ]**
   12. Skálázhatóság **[ÚJ]**
   13. Naplózás és monitorozás **[ÚJ]**
   14. A nem funkcionális követelmények teljesítése
   15. Tesztelés
3. [Telepítési leírás](#3-telepítési-leírás)
   1. Helyi futtatás
   2. Telepítés Azure-ba **[AZURE]**
4. [A program készítése során felhasznált eszközök](#4-a-program-készítése-során-felhasznált-eszközök)
5. [Összefoglalás](#5-összefoglalás)
6. [Továbbfejlesztési lehetőségek](#6-továbbfejlesztési-lehetőségek)
7. [Hivatkozások](#7-hivatkozások)

---

## 0. Követelményspecifikáció (kész)

A `Szoft Arch Sakkplatform Specifikáció.pdf` tartalma, változatlanul:

- Feladatkiírás (alapfunkciók, extra funkciók)
- A fejlesztő csapat
- Részletes feladatleírás
- Funkcionális követelmények (alapfunkciók, extra funkciók)
- Nem funkcionális követelmények (funkcionalitás, használhatóság, megbízhatóság, teljesítmény, támogathatóság)
- Technikai paraméterek
- Szótár
- Use-case-ek (alapfunkciók, extra funkciók)

---

## 1. A rendszer célja és funkciói

### 1.1 Feladatkiírás

> **Felelős:** közös

> Kifejtendő: a feladatkiírás rövid megismétlése (1–2 bekezdés): webes sakkplatform élő és AI ellenfél elleni
> játszmákkal, játszmaelőzményekkel. Hivatkozás a követelményspecifikációra.

### 1.2 A rendszer által biztosítandó tipikus funkciók

> **Felelős:** közös

> Kifejtendő: a ténylegesen megvalósított funkciók listája (a mintában ez a dokumentum-életciklus).
> Javasolt bontás a felhasználó útja szerint:
> - fiókkezelés: regisztráció, bejelentkezés, kijelentkezés, munkamenet frissítése
> - játszma indítása: párosítás véletlen ellenféllel (várósor), játék AI ellen
> - játszma lebonyolítása: interaktív tábla, szabályos lépések kiemelése, speciális lépések
>   (sáncolás, en passant, gyalogátváltoztatás), sakkóra, játszma vége (matt, patt, feladás, idő stb.)
> - játszmaelőzmények: lapozható lista, játszma visszajátszása lépésenként
> - a megvalósított extra funkciók megjelölése (pl. sakkóra), a meg nem valósítottak a 6. fejezetbe kerülnek

---

## 2. Megvalósítás

### 2.1 Architektúra

> **Felelős:** közös

> Kifejtendő:
> - a választott architektúra: mikroszolgáltatások + API gateway, polyrepo
> - indoklás: a valós idejű játék és a nagy gépigényű motor leválasztása, külön skálázhatóság
> - **ábra:** C4 rendszerkörnyezet-diagram (szereplők: Vendég, Felhasználó, Néző); futás közben nincs
>   külső rendszerfüggőség (a sakkszabályok és a motor könyvtárként vannak beépítve)
> - **ábra:** C4 konténerdiagram (böngésző → Envoy → frontend / platform-service / game-service;
>   game-service → engine-service, Redis, RabbitMQ → platform-service → PostgreSQL)
> - az ábra után egy-egy mondat minden konténerről, részletesen a 2.2-ban
> - elvetett alternatívák röviden (pl. monolit)
>
> Forrás: `infra/docs/architecture.md` (System context, Containers), `infra/docs/adr/microservices.md`, `infra/docs/adr/polyrepo.md`

### 2.2 Komponensek

> **Felelős:** lásd az alfejezeteket

> Minden komponensnél a mintához hasonló szerkezet: **Célja**, **Felelősségei**, **Technológia és indoklás**,
> **Belső felépítése** (ha van), **ábra** (ha van).

#### 2.2.1 API gateway (Envoy)

> **Felelős:** infra

> Kifejtendő: egyetlen belépési pont, útvonalak szerinti továbbítás (statikus fájlok, REST, Socket.IO),
> TLS lezárás, access token ellenőrzése és identitásfejlécek továbbítása, bejelentkezési kísérletek korlátozása.
>
> Forrás: `infra/docs/adr/api-gateway.md`, `infra/envoy/`

#### 2.2.2 Webes kliens (frontend)

> **Felelős:** frontend

> Kifejtendő:
> - React + TypeScript + Vite SPA, nginx szolgálja ki
> - mappaszerkezet / modulok (auth, lobby, game, api, routing, theme)
> - állapotkezelés (TanStack Query a szerveradatokhoz, élő játszma állapota)
> - sakktábla-komponens és lépésellenőrzés a kliensen
> - útvonalak és oldalak (részletesen a 2.9-ben)
> - kommunikáció: REST a platform-service felé, Socket.IO a game-service felé
>
> Forrás: `frontend/docs/adr/` (stack, state-management, chessboard, pages-and-routing, styling, gateway-access)

#### 2.2.3 platform-service (ASP.NET Core)

> **Felelős:** platform-service

> Kifejtendő:
> - felelősség: felhasználókezelés, tokenek és munkamenetek, játszmaelőzmények tárolása és lekérdezése
> - **rétegek (Clean Architecture)**, a mintában az N-rétegű bontás megfelelője, ábrával:
>   - Domain: entitások, domain szabályok
>   - Application: use case-ek, portok
>   - Infrastructure: EF Core, Identity, access tokenek, a befejezett játszmák fogyasztója
>   - API: HTTP végpontok, middleware-ek, request pipeline
> - validáció, hibakezelés, konfiguráció
>
> Forrás: `platform-service/docs/architecture.md`, `platform-service/docs/adr/`

#### 2.2.4 game-service (NestJS)

> **Felelős:** game-service

> Kifejtendő:
> - felelősség: folyamatban lévő játszmák, párosítás, lépések ellenőrzése, sakkóra, játszma vége
> - Socket.IO események (kliens → szerver, szerver → kliens)
> - a játszmaállapot tárolása Redisben
> - egy felhasználó egyszerre egy játszmában; több kapcsolat (fül) kezelése
> - a befejezett játszma átadása (outbox + RabbitMQ)
> - sakkszabályok ellenőrzése külső könyvtárral
>
> Forrás: `game-service/docs/`, `infra/docs/adr/live-game.md`, `infra/docs/adr/chess-rules.md`

#### 2.2.5 engine-service (Python)

> **Felelős:** engine-service

> Kifejtendő:
> - felelősség: gépi lépés számítása egy adott állásra
> - a választott sakkmotor és indoklása, nehézségi szint(ek)
> - webes keretrendszer, HTTP API
> - állapotmentesség → külön skálázható
>
> Forrás: `engine-service/docs/architecture.md`, `engine-service/docs/integration.md`, `engine-service/docs/adr/`

#### 2.2.6 PostgreSQL (relációs adatbázis)

> **Felelős:** infra (+ platform-service)

> Kifejtendő:
> - célja: a hosszú távú adatok tárolása (felhasználók, munkamenetek, befejezett játszmák)
> - ki használja: csak a platform-service, más szolgáltatás nem éri el
> - miért ezt választottuk, elvetett alternatívák (pl. más SQL vagy NoSQL adatbázis)
> - konfiguráció: verzió, tartós tár (kötet), migrációk futtatása, hozzáférési adatok
> - **[AZURE]** éles környezetben: Azure Database for PostgreSQL vagy konténer (lásd 2.4.2)
> - a séma részletei a 2.8.1–2.8.2-ben
>
> Forrás: `infra/docs/adr/database.md`, `infra/postgres/`, `platform-service/docs/adr/persistence.md`

#### 2.2.7 Redis (a futó játszmák tárolója)

> **Felelős:** infra (+ game-service)

> Kifejtendő:
> - célja: a folyamatban lévő játszmák állapotának gyors tárolása (állás, óra, várósor, outbox)
> - ki használja: csak a game-service
> - miért ezt választottuk (gyors, memóriában tárol, a game-service több példánya közösen használhatja),
>   elvetett alternatívák (pl. memóriában a szolgáltatáson belül, relációs adatbázis)
> - konfiguráció: tartósság (mi marad meg újraindítás után), memóriakorlát
> - **[AZURE]** éles környezetben: Azure Managed Redis vagy konténer (lásd 2.4.2)
> - a kulcsok szerkezete a 2.8.3-ban
>
> Forrás: `infra/docs/adr/database.md`, `infra/docs/adr/live-game.md`

#### 2.2.8 RabbitMQ (üzenetközvetítő)

> **Felelős:** infra (+ game-service, platform-service)

> Kifejtendő:
> - célja: a befejezett játszmák aszinkron átadása a game-service-től a platform-service-nek
> - ki használja: a game-service küldi, a platform-service fogadja az üzeneteket
> - miért aszinkron üzenet és nem közvetlen hívás (a platform-service kiesése nem akasztja meg a játékot),
>   miért RabbitMQ, elvetett alternatívák (pl. közvetlen HTTP hívás, Kafka, Redis Streams)
> - a sorok és exchange-ek felépítése, kézbesítési garanciák (megerősítés, újraküldés, hibás üzenetek sora)
> - konfiguráció: tartós sorok, kötet, hozzáférési adatok
> - **[AZURE]** éles környezetben: konténer vagy Azure Service Bus (lásd 2.4.2)
>
> Forrás: `infra/docs/adr/service-communication.md`, `infra/rabbitmq/`, `platform-service/docs/adr/messaging.md`

### 2.3 Szolgáltatások közötti kommunikáció és interfészek

> **Felelős:** közös (áttekintő táblázat, konvenciók) + a saját interfészét minden szolgáltatás: platform-service (REST végpontok), game-service (Socket.IO események, „befejezett játszma” esemény), engine-service (HTTP API)

> Kifejtendő:
> - kommunikációs módok táblázatban: ki kivel, milyen protokollon, szinkron/aszinkron
>   (REST, Socket.IO/WSS, HTTP az engine felé, AMQP). A dokumentumban csak itt szerepel ez a táblázat,
>   a 2.4 telepítési diagramjai erre hivatkoznak.
> - szerződésalapú fejlesztés: OpenAPI és AsyncAPI leírások az `infra/contracts` mappában, konvenciók
> - a fő REST végpontok rövid táblázata (útvonal, metódus, leírás)
> - a fő Socket.IO események táblázata
> - a „befejezett játszma” esemény szerkezete
>
> Forrás: `infra/contracts/*.yaml`, `infra/docs/adr/contracts.md`, `infra/docs/adr/contract-conventions.md`,
> `infra/docs/conventions.md`

### 2.4 Telepítési diagram **[ÚJ]**

> **Felelős:** lásd az alfejezeteket

> A fizikai nézet: hol fut az egyes komponens, és mi mit ér el hálózati szinten. A diagramok nyilai
> csak az elérhetőséget mutatják; a protokollokat és az üzenetek tartalmát a 2.3 írja le, itt nem ismételjük.

#### 2.4.1 Helyi futtatás (Docker Compose)

> **Felelős:** infra

> Kifejtendő:
> - **ábra:** UML telepítési diagram vagy Compose-topológia: a konténerek, a Docker hálózatok
>   (melyik szolgáltatás melyik hálózaton lát melyik adattárolót), a kívülről elérhető portok
>   (csak az Envoy), a kötetek (PostgreSQL, Redis, RabbitMQ adatai, tanúsítvány)
> - health checkek és az indulási sorrend (`depends_on`), adatbázis-migráció indításkor
> - a fejlesztői változatok eltérései röviden (melyik szolgáltatás fut a gépen a konténer helyett)
>
> Forrás: `infra/compose.yaml`, `infra/compose.*.yaml`, `infra/envoy/`, `infra/README.md`

#### 2.4.2 Éles környezet (Azure) **[AZURE]**

> **Felelős:** infra (+ minden szolgáltatás a saját konfigurációját és erőforrásigényét)

> Kifejtendő:
> - **ábra:** Azure telepítési diagram: erőforráscsoport, a szolgáltatások futtatókörnyezete, az adattárolók,
>   a hálózat (mi érhető el kívülről, mi csak belső hálózaton), a domain és a tanúsítvány
> - a választott Azure-szolgáltatások komponensenként, indoklással és az elvetett alternatívával.
>   **Döntendő** (javasolt rögzíteni egy új ADR-ben az `infra` repóban):
>   - **futtatókörnyezet:** Azure Container Apps (a Compose-hoz legközelebbi, WebSocketet és
>     skálázást támogat) / Azure Kubernetes Service (rugalmasabb, de jóval több üzemeltetés) / App Service
>   - **konténerképek:** Azure Container Registry vagy GitHub Container Registry
>   - **PostgreSQL:** Azure Database for PostgreSQL (Flexible Server) vagy konténer saját tárral
>   - **Redis:** Azure Managed Redis vagy konténer
>   - **RabbitMQ:** az Azure nem kínál menedzselt RabbitMQ-t → konténer tartós tárral, vagy Azure Service Bus
>     (ez kódváltozást jelent a game-service-ben és a platform-service-ben)
>   - **gateway:** az Envoy konténerként marad, vagy a platform bejövő forgalomkezelője / Application Gateway
>     váltja ki (ha kikerül, a tokenellenőrzés és a rate limiting helye változik, lásd 2.5)
>   - **frontend:** nginx-konténer az Envoy mögött, vagy Azure Static Web Apps
>     (ha más domainre kerül, a cookie-alapú hitelesítést újra kell gondolni)
> - titkok és konfiguráció: környezeti változók, Azure Key Vault vagy a futtatókörnyezet titokkezelése
> - domain és TLS-tanúsítvány (menedzselt tanúsítvány)
> - a helyi és az Azure-környezet különbségei táblázatban (komponens – helyben – Azure-ban)
> - költségek: a választott díjcsomagok, becsült havi költség, hallgatói kredit (pl. Azure for Students)
>
> Forrás: `infra/compose.yaml` (a jelenlegi topológia), az Azure-dokumentáció

### 2.5 Hitelesítés és biztonság

> **Felelős:** platform-service (tokenek, jelszavak, validáció) + infra (Envoy: tokenellenőrzés, rate limiting) + frontend (cookie-k, frissítés, kliensoldali validáció)

> Kifejtendő:
> - access és refresh token, tárolás cookie-ban, frissítés, kijelentkezés
> - a tokenek ellenőrzése a gatewayben, identitásfejlécek a szolgáltatások felé
> - jelszavak hashelése (ASP.NET Identity)
> - bemenetek validálása kliens- és szerveroldalon, paraméterezett lekérdezések (EF Core)
> - HTTPS/WSS, rate limiting
> - **[AZURE]** az éles környezet biztonsága: titkok tárolása (Key Vault), az adattárolók csak belső
>   hálózatról érhetők el, nyilvános tanúsítvány, a gateway helye az Azure-ban (lásd 2.4.2)
> - kapcsolat a specifikáció „Biztonság” követelményével
>
> Forrás: `infra/docs/adr/authentication.md`, `platform-service/docs/adr/tokens-and-sessions.md`,
> `platform-service/docs/adr/gateway-authentication.md`, `platform-service/docs/adr/accounts.md`

### 2.6 Fő folyamatok

> **Felelős:** folyamatonként, lásd a listát

> Kifejtendő: szekvenciadiagramok és rövid magyarázat az alábbiakhoz:
> 1. Regisztráció és bejelentkezés, hitelesített kérés – *platform-service* (+ infra, frontend)
> 2. Párosítás és élő játszma két játékos között – *game-service* (+ frontend)
> 3. Élő játszma AI ellen – *game-service* + *engine-service*
> 4. Befejezett játszma átadása és mentése (outbox, sor, idempotens feldolgozás) – *game-service* + *platform-service*
> 5. Játszmaelőzmények lekérdezése és visszajátszás – *platform-service* + *frontend*
>
> Forrás: `infra/docs/architecture.md` (Flows), `platform-service/docs/architecture.md`

### 2.7 A játszma állapotai **[ÚJ]**

> **Felelős:** game-service

> Kifejtendő:
> - **ábra:** UML állapotgép-diagram egy játszma (és a felhasználó) életciklusáról, pl.:
>   nincs játszma → várósorban → folyamatban → befejezve → átadva a platform-service-nek
> - az átmenetek eseményei (párosítás, AI-játszma indítása, lépés, feladás, kilépés a sorból)
> - a befejezés okai: matt, patt, döntetlen szabályok (anyaghiány, háromszori ismétlés, 50 lépés), feladás,
>   lejárt idő, kapcsolat elvesztése (ha van ilyen szabály)
> - a sakkóra működése: mikor indul, mikor áll, ki méri (a szerver)
>
> Forrás: `game-service/src`, `infra/docs/adr/live-game.md`, `infra/docs/adr/chess-rules.md`,
> `infra/contracts/game-service.asyncapi.yaml`

### 2.8 Adat- és adatbázisterv

> **Felelős:** lásd az alfejezeteket

#### 2.8.1 Az adatbázis entitás-relációs diagramja

> **Felelős:** platform-service

> Kifejtendő: ER-diagram a PostgreSQL sémáról (felhasználó, refresh token, játszma, lépések,
> feldolgozott üzenetek stb.), az ORM (EF Core) és a migrációk rövid bemutatása.
>
> Forrás: `platform-service/src/PlatformService.Domain`, `PlatformService.Infrastructure` (EF konfiguráció, migrációk),
> `platform-service/docs/adr/persistence.md`, `game-history.md`

#### 2.8.2 Entitások

> **Felelős:** platform-service

> Minden entitásnál a mintához hasonlóan: **Célja**, **Leképzése a kódban** (osztály),
> **Leképzése az adatbázisban** (tábla), **Tulajdonságai** (mezők listája rövid leírással).

- Felhasználó entitás
- Refresh token / munkamenet entitás
- Játszma entitás
- Lépés / lépéstörténet (ha külön tábla, különben a Játszma része)
- Egyéb technikai entitások (pl. feldolgozott üzenetek)

#### 2.8.3 A futó játszmák adatmodellje (Redis)

> **Felelős:** game-service

> Kifejtendő: a Redis kulcsok és értékek szerkezete (játszmaállapot, FEN, óra, várósor, outbox),
> lejárati idők, miért nem relációs adatbázis.

### 2.9 GUI-terv

> **Felelős:** frontend

> Kifejtendő: az oldalak listája útvonallal és jogosultsággal, mindegyikhez képernyőkép vagy drótváz és rövid leírás:
> - `/login` – Bejelentkezés
> - `/register` – Regisztráció
> - `/` – Lobby (játszma indítása: párosítás vagy AI)
> - `/game` – Játszma (tábla, sakkóra, ellenfél, eredmény)
> - `/history` – Játszmaelőzmények (lapozható lista)
> - `/history/:gameId` – Visszajátszás (lépésenkénti léptetés, lépéslista)
> - Navigáció az oldalak között (ábra), átirányítási szabályok (vendég / bejelentkezett)
>
> Forrás: `frontend/docs/adr/pages-and-routing.md`, `frontend/docs/adr/styling.md`

### 2.10 A use case-ek leképezése a komponensekre **[ÚJ]** -> NOPE

> **Felelős:** közös (minden szolgáltatás kitölti a saját sorait)

> Kifejtendő: táblázat a specifikáció minden use case-éről (a meg nem valósítottakat is jelölve):
>
> | Use case | Oldal (frontend) | Szolgáltatás(ok) | Interfész (végpont / esemény) | Állapot |
> |---|---|---|---|---|
> | Regisztráció | `/register` | platform-service | `POST /api/...` | kész |
> | … | … | … | … | … |
>
> Ez köti össze a specifikációt a rendszertervvel; a hiányzó sorok a 6. fejezetbe kerülnek.

### 2.11 Hibakezelés és hibatűrés **[ÚJ]** -> "teszt nincs, elméletileg spec alapján működnie kéne..."

> **Felelős:** esetenként, lásd a listát

> Kifejtendő: mi történik az alábbi esetekben, és melyik tervezési döntés kezeli:
> - a kliens kapcsolata megszakad, újracsatlakozik, vagy újratölti az oldalt (`getState` visszaállítja a játszmát)
>   – *game-service* + *frontend*
> - a felhasználó több fülön van bejelentkezve – *game-service* + *frontend*
> - az engine-service nem válaszol vagy lassú – *game-service* + *engine-service*
> - a RabbitMQ vagy a platform-service nem elérhető a játszma végén (outbox, újraküldés, idempotens fogadás)
>   – *game-service* + *platform-service*
> - a game-service vagy a Redis újraindul (mi marad meg a futó játszmákból) – *game-service*
> - lejárt access token játszma közben (frissítés) – *frontend* + *platform-service*
> - hibaválaszok egységes formátuma a REST API-ban, hibák megjelenítése a kliensen – *platform-service* + *frontend*
>
> Forrás: `infra/docs/adr/service-communication.md`, `infra/docs/adr/live-game.md`,
> `platform-service/docs/adr/error-handling.md`, `platform-service/docs/adr/messaging.md`

### 2.12 Skálázhatóság **[ÚJ]** -> túlmutat a tárgy kretein most nekünk, vagy leg defaultabbat keresni?

> **Felelős:** minden szolgáltatás a sajátját; közös összegzés

> Kifejtendő:
> - melyik szolgáltatás futtatható több példányban és milyen feltétellel
>   (engine-service: állapotmentes; platform-service: állapotmentes, a tokenek ellenőrzése a gatewayben;
>   game-service: közös Redis, Socket.IO események szétosztása a példányok között)
> - a szűk keresztmetszetek (pl. a motor CPU-igénye, Redis, egy PostgreSQL példány)
> - becslés vagy mérés a specifikáció számaihoz (1 000 felhasználó, 100 párhuzamos játszma)
> - **[AZURE]** skálázás az Azure-ban: példányszámok és automatikus skálázási szabályok szolgáltatásonként,
>   több game-service példánynál a Socket.IO kapcsolatok kezelése (sticky session vagy Redis adapter),
>   a menedzselt adattárolók díjcsomagjainak korlátai

### 2.13 Naplózás és monitorozás **[ÚJ]** -> ehh...

> **Felelős:** minden szolgáltatás a sajátját + infra (health checkek)

> Kifejtendő: a naplózás módja szolgáltatásonként (formátum, szintek, hova ír), konfiguráció környezeti
> változókkal, health checkek, (ha van) korrelációs azonosító a kérések követésére, monitorozási lehetőségek.
> **[AZURE]** Az éles környezetben: a naplók gyűjtése (Azure Monitor, Log Analytics), metrikák,
> esetleg Application Insights, riasztások, a health checkek használata a futtatókörnyezetben.
>
> Forrás: `platform-service/docs/adr/configuration-and-logging.md`, `infra/compose.yaml` (healthcheck)

### 2.14 A nem funkcionális követelmények teljesítése

> **Felelős:** közös

> Kifejtendő: táblázat a specifikáció nem funkcionális követelményeiről és arról, mely tervezési döntés
> teljesíti őket (pl. válaszidő, 500 ms-os késleltetés → WebSocket; 100 aktív játszma → 2.12;
> utolsó 100 játszma tárolása - kéne seed az adatbázisba (100-200 játszma); Docker → hordozhatóság;).


### 2.15 Tesztelés

> **Felelős:** minden szolgáltatás a sajátját

> Kifejtendő: tesztelési stratégia komponensenként (unit, integrációs, komponens tesztek; a használt
> keretrendszerek a repókból ellenőrizendők), fake backendek a frontend fejlesztéséhez, manuális tesztelés.
>
> Forrás: `platform-service/docs/adr/testing.md`, `frontend/docs/adr/testing.md`, `frontend/docs/adr/fake-backends.md`

---

## 3. Telepítési leírás

> **Felelős:** lásd az alfejezeteket

### 3.1 Helyi futtatás

> **Felelős:** infra

> Kifejtendő:
> - rendszerkövetelmények (Docker, Docker Compose, szabad portok, memória)
> - támogatott böngészők: Chrome legfrissebb asztali verziója teljes, Firefox és Edge kielégítő funkcionalitással
> - a repók letöltése (polyrepo: melyik repó hova kerüljön)
> - konfiguráció (környezeti változók, tanúsítvány)
> - indítás: `docker compose` parancsok az `infra` repóból
> - fejlesztői változatok (`compose.dev.yaml`, `compose.game-on-host.yaml`, `compose.platform-on-host.yaml`)
> - az alkalmazás elérése a böngészőből, kipróbálás
>
> Forrás: `infra/README.md`, `infra/compose*.yaml`, a szolgáltatások `README.md` fájljai

### 3.2 Telepítés Azure-ba **[AZURE]**

> **Felelős:** infra

> Kifejtendő:
> - előfeltételek: Azure-előfizetés, jogosultságok, Azure CLI (és ha használjuk: Bicep vagy Terraform)
> - az erőforrások létrehozása lépésenként vagy szkripttel/sablonnal (infrastruktúra kódként, ha van)
> - a konténerképek buildelése és feltöltése a registrybe
> - konfiguráció és titkok beállítása, adatbázis-migráció az első indításkor
> - telepítés és frissítés (kézzel vagy CD pipeline-nal)
> - az éles alkalmazás címe, ellenőrzés (health checkek, próbajátszma)
> - az erőforrások leállítása vagy törlése a költségek elkerülésére

---

## 4. A program készítése során felhasznált eszközök

> **Felelős:** minden szolgáltatás a sajátját

> Kifejtendő: a mintához hasonló lista, eszközönként „Felhasználás: …” sorral. Pl.:
> - React, TypeScript, Vite, React Router, TanStack Query, sakktábla-könyvtár
> - ASP.NET Core, Entity Framework Core, ASP.NET Identity
> - NestJS, Socket.IO, sakkszabály-könyvtár
> - Python, webes keretrendszer, sakkmotor
> - PostgreSQL, Redis, RabbitMQ, Envoy, nginx
> - Docker, Docker Compose
> - **[AZURE]** a használt Azure-szolgáltatások (lásd 2.4.2), Azure CLI, Bicep/Terraform, GitHub Actions
> - OpenAPI, AsyncAPI, Redocly
> - Git, GitHub, IDE-k, diagramkészítő (Mermaid), dokumentációkészítő

---

## 5. Összefoglalás

> **Felelős:** közös

> Kifejtendő: 1–2 bekezdés: mit valósítottunk meg a specifikációból, mely alap- és extra funkciók készültek el,
> milyen tapasztalatokat szereztünk az architektúrával (mikroszolgáltatások, szerződésalapú fejlesztés).

---

## 6. Továbbfejlesztési lehetőségek

> **Felelős:** közös

> Kifejtendő: a meg nem valósított extra funkciók és egyéb ötletek, pl.:
> - Élő-pontrendszer és ranglétra, pontszám alapú párosítás
> - barátok, felhasználókeresés, kihívás
> - aszinkron játszmák
> - megfigyelői link
> - több tábla- és bábustílus
> - új játékmódok (Chess960)
> - AI nehézségi szintek
> - **[AZURE]** az éles környezet bővítése: automatikus skálázás, több régió, mentések, külön teszt- és éles környezet
>
> Zárómondat: mely tervezési döntések segítik ezek későbbi megvalósítását.

---

## 7. Hivatkozások

> **Felelős:** közös (mindenki adja a saját forrásait)

> Kifejtendő: számozott lista ([1], [2], …) a felhasznált technológiák honlapjaival és egyéb forrásokkal
> (pl. Élő-pontrendszer Wikipedia, C4 modell, sakkszabályok). A szövegben `[n]` formában hivatkozunk rájuk.

