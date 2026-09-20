Décision recommandée : construire une passerelle d’identité et de contexte au niveau applicatif, avec une couche réseau complémentaire. La valeur défendable est de contrôler ce que chaque IA apprend de l’utilisateur, quand et pourquoi.
Les contradictions à corriger :
- WireGuard ne révèle pas le contenu des échanges IA. boringtun fournit le protocole WireGuard ; sa bibliothèque ne fournit pas à elle seule les piles réseau et tunnel. Il faut les intégrer au système. Un VPN fonctionne ici comme transport IP ; ajouter L2 n’apporte pas l’accès sémantique recherché. Cloudflare — BoringTun
- Un paquet intercepté reste chiffré. TLS protège la confidentialité et l’intégrité entre ses terminaux ; le proxy réseau ne peut donc pas ajouter de mémoire dans un prompt HTTPS sans devenir un terminal TLS autorisé. Même problème pour QUIC. Un proxy CONNECT ne suffit pas. IETF — TLS 1.3, IETF — QUIC/TLS
- macOS impose une intégration native réelle. Une extension NEPacketTunnelProvider reçoit les paquets IP via une interface virtuelle, configure DNS/routes et exige l’autorisation Network Extension. Tauri peut porter l’interface, mais ne remplace ni cette extension ni son intégration/signature. L’installation simple doit conserver les autorisations système nécessaires. Apple — NEPacketTunnelProvider
- La biométrie doit autoriser l’accès à une clé, pas servir de mot de passe dérivé. Recommandation : clé SQLCipher aléatoire de 256 bits protégée par Keychain ; biométrie à l’ouverture du coffre, verrouillage explicite à la fermeture de session. La protection Secure Enclave doit être conçue comme protection d’une clé ou opération cryptographique compatible, pas comme stockage magique d’une clé AES directement utilisable par SQLite. Apple — Protecting keys with the Secure Enclave
- L’empreinte machine n’est pas un secret. SQLCipher déconseille une clé dérivée uniquement d’identifiants matériels. Il chiffre le stockage, mais l’application doit gérer les clés et accéder au contenu déchiffré pendant son utilisation. Zetetic — Database key material
Architecture faisable, sans interception TLS transparente :
1. Entrées explicites : launcher Tauri, API locale pour applications compatibles et connecteurs installés volontairement. Seules ces interactions bénéficient initialement de l’enrichissement et de la mémoire. Le trafic d’applications tierces non intégrées peut être autorisé, bloqué ou routé, mais son contenu demeure opaque.
2. Coffre personnel local : événements, souvenirs et préférences dans SQLCipher. Remplacer le « vecteur unique de toute une vie » par une mémoire structurée et des représentations vectorielles contextualisées : origine, date, confiance, domaine professionnel/personnel et permission d’utilisation.
3. Moteur L7 local : sélection de mémoire, aperçu du contexte transmis, retrait des secrets, politique par fournisseur, budget et choix du modèle. Le « LB » devient routage par capacité, confidentialité, coût et disponibilité ; le « WAF » devient contrôle des données sortantes et permissions d’outils.
4. Deux sorties réseau séparées : l’adaptateur IA envoie uniquement la requête autorisée au fournisseur choisi ; l’exporteur analytique reçoit exclusivement des objets numériques préalablement bornés et bruités. Le coffre et le moteur de mémoire ne disposent d’aucune API réseau. Pour une frontière réellement contrôlable, utiliser des processus séparés avec permissions système ; les modules Rust seuls ne constituent pas une preuve d’isolation.
5. VPN facultatif, deuxième étape : extension réseau native et boringtun vers un pair explicitement configuré, avec contrôle DNS/routage et prévention des fuites. Ne pas faire du tunnel un prérequis à la démonstration de mémoire portable.
La formulation correcte de confidentialité : « historique conservé localement ; contexte sélectionné transmis uniquement au modèle choisi ; aucun prompt, réponse ou souvenir envoyé au SaaS analytique ». Pour garantir que rien de brut ne quitte la machine, il faut imposer l’inférence locale. Le chiffrement du transport ne cache pas le prompt au fournisseur chargé de le traiter.
Critères de preuve utiles : capture réseau montrant l’absence de prompts vers le SaaS ; refus d’un payload analytique textuel ; coffre illisible sans clé ; révocation immédiate des permissions de mémoire ; reprise propre après panne du fournisseur ; aucune prétention d’enrichissement pour une application non intégrée.


Sunday 11:51 PM








Worked for 1m 27s



Le concept est réalisable comme service système local qui médie les interactions IA, sans VPN ni interface de chat imposée. Il faut toutefois plusieurs surfaces d’interception : aucune API macOS ne fournit universellement les prompts et réponses en clair de toutes les applications.
Surface	Capture et intervention possibles	Limite réelle
CLI, IDE, agents : endpoint API configuré	Lire requêtes/réponses structurées, mesurer latence et tokens exposés, injecter du contexte, choisir le fournisseur, filtrer les outils.	L’application doit accepter une URL API personnalisée ou un plugin. Préserver streaming, annulation et champs propres au fournisseur. Exemple officiellement documenté : passerelle Claude Code. Documentation
Applications web : extension + service local	Lire les conversations présentes dans le DOM ; enrichir le composeur avant envoi ; observer les réponses rendues. Une instrumentation dans le contexte JavaScript de la page peut intercepter certains appels avant chiffrement.	Adaptateur par site ; changements du DOM, Workers et chemins réseau non instrumentés peuvent réduire la couverture. Chrome webRequest ne donne pas les messages WebSocket ni le contenu d’une session WebTransport. Scripts Chrome, webRequest
MCP : proxy entre agent et outils	Voir et contrôler les appels d’outils, arguments, résultats et ressources qui passent effectivement par ce proxy ; fournir mémoire/contexte.	Ne capture pas automatiquement la conversation ni les appels modèle. Le protocole garde précisément l’historique complet côté hôte. Architecture MCP actuelle
macOS Transparent Proxy	Dévier des flux TCP/UDP selon des règles, mesurer le transport, relayer ou bloquer. Vrai mécanisme système, sans tunnel VPN.	Les corps HTTPS/QUIC restent chiffrés. À lui seul, cela n’apporte ni compréhension des prompts ni enrichissement. Le Content Filter est en outre lecture seule avec décision autoriser/bloquer. Apple — Network Extensions
Proxy TLS local avec CA, activation explicite	Pour les applications compatibles : terminer TLS localement, inspecter et modifier le protocole applicatif dans les deux sens, puis recréer TLS vers le fournisseur.	Doit être accepté par la pile TLS de l’application. Une CA installée ne surmonte pas nécessairement le certificate pinning ; protocoles propriétaires et QUIC demandent une prise en charge distincte. Apple — Identity Pinning
Applications natives : Accessibility	Lire les attributs UI exposés et modifier certains champs éditables après autorisation utilisateur.	Pas d’accès garanti aux échanges réseau, contexte caché, outils ou contenu non exposé. Certaines apps n’implémentent pas les attributs nécessaires. Lecture AX, Écriture AX


Socle recommandé : un daemon Rust local comportant un moteur de politique et de contexte, une mémoire chiffrée et des adaptateurs bidirectionnels. Trois premiers adaptateurs : proxy API compatible avec les agents, extension Chromium pour deux apps web ciblées, proxy MCP pour les outils. L’extension communique avec le daemon par Native Messaging, avec origine autorisée et validation des messages. Chrome — Native Messaging
Chaque adaptateur doit annoncer sa couverture : réseau seulement, conversation visible, requête modèle complète ou outils. L’utilisateur voit immédiatement ce que le système comprend réellement.
Le proxy réseau macOS devient ensuite un moyen de détection, d’attribution et de contrôle de couverture. Le proxy TLS reste un mode de compatibilité volontaire pour certaines applications. Accessibility sert de complément UI, sans prétendre reconstruire une conversation complète.
Point essentiel pour la proposition produit : capturer une conversation dans une app SaaS ne donne pas accès aux prompts système, souvenirs privés du fournisseur ou appels d’agents exécutés exclusivement sur ses serveurs. La compréhension locale doit être construite à partir des échanges effectivement observables, avec provenance et niveau de confiance.


Sunday 11:55 PM








Worked for 44s



Le moteur de compréhension tourne sur le Mac, dans un service utilisateur en arrière-plan, séparé de l’interception réseau. Le daemon Rust reçoit les événements des adaptateurs ; un processus d’inférence dédié utilise CPU/GPU via llama.cpp avec Metal, ou MLX sur Apple Silicon. Aucun modèle ne doit tourner dans le noyau. llama.cpp, MLX LM
Je séparerais deux rythmes :
- Avant envoi : règles déterministes, recherche dans la mémoire et classification courte si nécessaire. Budget de latence borné ; les protections obligatoires restent bloquantes.
- En arrière-plan : résumés, liens entre conversations, extraction des préférences et mesures d’usage. Transmettre immédiatement le streaming entrant ; ne pas relancer une analyse complète à chaque token.
Pour dimensionner : un modèle de 3 milliards de paramètres à 4 bits représente théoriquement 1,5 Go de poids, un 8B environ 4 Go, avant les métadonnées de quantification, caches de contexte et buffers. Ce sont des calculs de capacité, pas des benchmarks.
Cible produit raisonnable : 16 Go de RAM avec un modèle spécialisé de 1–3B ; mode allégé sur 8 Go ; option 7–8B sur 24–32 Go. Limiter contexte et concurrence, charger les modèles à la demande, réduire l’activité sur batterie. La qualité reste à mesurer sur les tâches exactes.
« Accès complet au disque » ne signifie pas accès complet à la machine. macOS sépare fichiers, Accessibility, capture d’écran, microphone et surveillance des entrées. Chaque surface expose des données différentes et demande ses autorisations. Apple — Confidentialité et sécurité
Même toutes accordées, ces permissions ne révèlent ni le traitement exclusivement côté serveur, ni les prompts internes jamais transmis au Mac, ni automatiquement le contenu TLS.


Sunday 11:59 PM








Worked for 54s



La mémoire personnelle privée est déjà une catégorie concurrentielle. OMNI doit donc préciser quelle autorité supplémentaire il donne à l’utilisateur, au-delà de conserver son historique.
- Microsoft : mémoire de l’activité à l’échelle du système. Recall, encore présenté en preview sur Copilot+ PC, conserve et analyse localement des captures d’écran après activation volontaire. L’utilisateur peut interrompre, filtrer et supprimer ; les captures et la base vectorielle sont chiffrées, avec contrôle Windows Hello. Donc « se souvenir localement de mon activité » ne suffit pas à différencier OMNI. L’intégration au système constitue un avantage de distribution considérable. Microsoft — Recall et confidentialité
- Apple : contexte personnel et actions intégrés aux appareils. Apple décrit un assistant capable de rechercher dans messages, courriels et photos et d’agir dans les apps, combinant traitement local et Private Cloud Compute. Cela place directement la compréhension contextuelle dans son système et ses applications. Apple — architecture et fonctions annoncées en juin 2026 PCC annonce notamment calcul sans conservation, absence d’accès privilégié et transparence vérifiable ; « cloud privé » est donc également un terrain déjà fortement investi. Apple Security — PCC
- Google : personnalisation à partir des services déjà utilisés. Personal Intelligence relie notamment Gmail, Photos, YouTube et Search, sur activation volontaire avec choix des sources. Google distingue l’absence d’entraînement direct sur les bibliothèques sources de l’utilisation de certaines interactions filtrées pour améliorer ses modèles. L’avantage est l’accès aux données déjà hébergées et la distribution via Gemini. Google — Personal Intelligence
Mon interprétation stratégique : l’espace à tester pour OMNI est une autorité personnelle indépendante du fournisseur : contexte portable entre plusieurs IA, permissions par agent et par tâche, correction des souvenirs, journal des informations divulguées, révocation des accès futurs. La révocation ne peut pas effacer rétroactivement ce qu’un fournisseur a déjà reçu.
MCP fournit déjà des mécanismes d’autorisation par ressource et scopes minimaux ; OMNI peut s’appuyer dessus, mais cela ne constitue pas un standard de mémoire personnelle portable ni une identité psychologique universelle. MCP — Authorization
Test décisif : rendre trois agents de fournisseurs différents immédiatement plus utiles avec le même contexte maîtrisé, puis retirer un souvenir et démontrer qu’il n’est plus partagé. Cela mesure une différence concrète.


12:03 AM








Architecture recommandée sous réserve d’arbitrer la contradiction VPN obligatoire / proxy sans VPN :
1. Application macOS et services locaux. Tauri 2 + Three.js pour visualisation, réglages et consentements ; daemon Rust utilisateur pour routage et sessions ; processus séparés pour coffre SQLCipher, inférence locale et export analytique. Le produit reste utilisable depuis les applications IA intégrées, sans imposer son launcher. Une interface de développement accessible sur localhost:3006 accompagne l’application native ; elle n’équivaut pas à un VPN installé.
2. Interception explicitement bornée. Première couverture complète : proxy API configurable pour CLI/IDE compatibles, connecteur navigateur pour deux sites nommés et versionnés, proxy MCP pour les outils. Chaque connecteur déclare transport, conversation visible, requête modèle ou outils. MCP ne donne pas automatiquement accès à l’historique du LLM. Les applications natives non compatibles restent affichées comme non prises en charge. Une extension macOS Transparent Proxy peut ensuite router les flux TCP/UDP ; elle ne déchiffre pas TLS. Apple — Network Extensions
3. Fournisseurs réels. Adaptateur Anthropic Messages et adaptateur d’API compatible OpenAI pour moteurs locaux ; paramètres fournisseurs conservés sans normalisation destructive. Endpoint local lié à 127.0.0.1, authentification par jeton, clés cloud dans Keychain, domaines de destination autorisés explicitement. Le modèle de compréhension tourne localement via llama.cpp/Metal ; téléchargement versionné avec empreinte vérifiée, puis fonctionnement sans réseau du processus d’inférence. Mode dégradé explicite si modèle absent, jamais réponse simulée.
4. Flux et permissions. Relayer SSE et annulations avec buffers bornés ; conserver les blocs opaques, identifiants d’outils et erreurs fournisseur. Aucun changement automatique de modèle après le début d’une réponse ; reprise avant premier événement uniquement lorsque sûre. Enrichissement avant envoi avec règles par application, fournisseur et espace personnel/professionnel. Extraction de mémoire en arrière-plan ; aucune réanalyse exhaustive à chaque token. Mesures distinguant valeurs fournisseur, mesures locales et estimations.
5. Confidentialité contrôlable. Clé SQLCipher aléatoire protégée par Keychain, biométrie pour autoriser son accès. Coffre et inférence isolés sans accès réseau dans les helpers macOS signés ; passerelle IA et exporteur analytique disposent de sorties distinctes. Le SaaS accepte exclusivement le schéma analytique borné/bruité, sans texte libre. Cela remplace la contrainte contradictoire « seul DP accède au réseau ». Promesse : aucun contenu brut vers le SaaS OMNI ; le fournisseur choisi reçoit le contexte autorisé.
6. Lancement et distribution. run.sh vérifie dépendances, modèles et ports, démarre les composants puis effectue des contrôles de disponibilité. start_network.sh gère la passerelle locale ; mode WireGuard uniquement si retenu, avec pair distant réel et configuration explicite. Boringtun fournit le protocole, pas toute l’intégration réseau. BoringTun Livraison macOS signée/notariée ; permissions système demandées au moment utile.
Validation minimale : requêtes réelles cloud/local, streaming et annulation, outils MCP, rejet des schémas analytiques textuels, budget DP, coffre verrouillé, absence de sortie réseau des workers, déconnexion/reprise, installation propre, retrait des permissions et désinstallation. Aucune annonce de couverture universelle, de garantie psychologique ou de confidentialité absolue.


12:08 AM







Worked for 51s



Le VPN devient un composant réellement fonctionnel, avec deux modes d’exécution macOS partageant le même moteur Rust.
- Client : intégrer boringtun::noise::Tunn, avec boucle UDP, timers WireGuard, gestion des paquets sortants/entrants et compteurs. En développement : adaptateur utun lancé explicitement avec privilèges administrateur. En distribution : adaptateur Swift NEPacketTunnelProvider vers Rust par FFI et packetFlow, empaqueté comme System Extension. Boringtun fournit le protocole, pas toute cette plomberie. BoringTun
- Signature : pour distribuer directement sur macOS, prévoir Developer ID, profil contenant packet-tunnel-provider-systemextension, signature de tous les composants, notarisation et autorisation utilisateur. Apple réserve le packet tunnel en App Extension macOS à l’App Store. Sans identité Apple, livrer un build de développement et le client CLI utun ; une signature ad hoc ne valide pas la disponibilité de l’extension privilégiée. Apple — TN3134
- Serveur Linux : pair WireGuard noyau, namespace réseau dédié, règles de transfert et NAT vers l’interface publique, relais TCP/SOCKS5 accessible uniquement sur l’adresse privée WireGuard. Réserver l’API analytique HTTPS à un service distinct.
- Split tunnel précis : router seulement le sous-réseau privé OMNI vers utun. Le proxy IA local ouvre ses connexions fournisseurs via le relais privé ; TLS reste établi entre client local et fournisseur. Éviter les routes globales vers les IP des fournisseurs, souvent partagées : elles affecteraient d’autres applications. Le serveur relaie des octets TLS sans analyser les prompts.
- Amorçage honnête : run.sh démarre interface, coffre, moteur local et SaaS de développement sans pair. État VPN non configuré explicite ; les requêtes nécessitant ce transport attendent sa configuration. start_network.sh exige endpoint UDP joignable, clé publique serveur et adresse client attribuée. Le serveur génère après déploiement un fichier d’enrôlement avec ses coordonnées effectivement configurées ; aucun endpoint inventé.
- Validation : test Linux isolé avec client boringtun et pair noyau dans deux namespaces ; handshake, trafic bidirectionnel, requête TLS via relais, reconnexion, mauvais pair rejeté et absence de repli direct lors d’une coupure. Le test macOS utun complète ce contrôle.
- Sobriété : collecte événementielle, petits lots statistiques classiques, modèles déchargés au repos, files bornées ; keepalive désactivé sauf besoin démontré. Aucun calcul quantique revendiqué.
