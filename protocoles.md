Le concept est défendable comme mémoire personnelle locale + contrôle explicite du contexte transmis aux IA + observatoire statistique volontaire. La formulation actuelle mélange trois garanties distinctes : confidentialité du stockage, confidentialité des communications, confidentialité des statistiques.
Corrections indispensables
1. La DP ne rend pas une identification « cryptographiquement impossible ». Elle borne l’influence d’une contribution sur les probabilités des sorties. Il faut annoncer l’unité protégée, l’adjacence, ε, δ, les contributions maximales et leur composition. Un bruit ajouté sans bornage des données ni comptabilité ne constitue pas une garantie défendable. Le mécanisme Laplace utilise b = Δ₁/ε; les budgets de sorties successives s’additionnent. Dwork–Roth, chap. 3
2. Un budget réinitialisé chaque jour ne protège pas une vie entière. Une garantie par événement protège moins qu’une garantie portant sur toutes les données d’une personne. Plusieurs appareils, restaurations et réinstallations compliquent encore la comptabilité. Le NIST identifie aussi les implémentations flottantes naïves des mécanismes comme un risque réel. NIST SP 800-226, §§2.4 et 5.2
3. « Seul le module DP possède le réseau » contredit les appels aux fournisseurs IA. Séparer deux sorties : un connecteur IA autorisé à envoyer le contexte choisi au fournisseur, et un exportateur de télémétrie autorisé à envoyer uniquement les rapports DP au SaaS. Une séparation de modules Rust aide à auditer ; le confinement exige aussi des processus et permissions OS distincts.
4. Un fournisseur cloud reçoit le prompt et le contexte qu’il doit traiter. Leur chiffrement pendant le transport n’empêche pas ce fournisseur d’y accéder. Promesse honnête : « OMNI ne reçoit jamais vos conversations ». Promesse « aucune donnée brute ne quitte la machine » uniquement en mode inférence entièrement locale.
5. DP et ZKP remplissent des fonctions différentes. Une preuve ZK démontre un énoncé sans révéler son témoin ; elle ne rend pas automatiquement une statistique privée. Article fondateur Goldwasser–Micali–Rackoff
Protocole v1 proposé
Les chiffres suivants sont des choix de conception à évaluer, pas des seuils universels de sécurité.
- Cohorte pilote volontaire, monoappareil. Télémétrie désactivée par défaut ; consentement distinct de l’utilisation de la mémoire et des fournisseurs.
- Mémoire entièrement locale. Documents, prompts, réponses, embeddings, personnes, chronologie et préférences restent dans le coffre. Un embedding personnel reste une donnée sensible ; ce n’est pas un remplacement anonyme du texte.
- Une contribution hebdomadaire de taille fixe. Calcul local d’un histogramme normalisé sur huit catégories publiques stables, incluant « aucune activité », et de deux moyennes bornées : latence fournisseur et volume de tokens. Aucune catégorie libre, aucun extrait, identifiant de document, domaine visité ou précision géographique.
- Garantie par rapport sur toute l’activité de l’appareil durant la semaine. Histogramme dans le simplexe : sensibilité L1 maximale 2 sous remplacement de l’historique. Chaque métrique numérique normalisée dans [0,1] : sensibilité maximale 1. Bornes de latence/tokens fixées publiquement avant collecte.
- Exemple de budget testable : ε=1 par rapport, réparti en 0,5 pour l’histogramme et 0,25 pour chacune des deux moyennes, δ=0 pour les mécanismes théoriques. Cela donne une échelle Laplace 4 dans chaque groupe. Employer une implémentation traitant explicitement la précision numérique ; ne pas présenter une simple inverse-CDF maison comme une preuve.
- Maximum quatre rapports dans le pilote, donc borne composée ε≤4. Compteur persistant, consommation atomique avant export ; arrêt au plafond, sans remise à zéro automatique. Un prolongement accroît la borne cumulée : le consentement ne l’efface pas. Annoncer « par installation/appareil » tant que la composition multiappareil n’est pas résolue.
- Un rapport bruité est créé une fois puis réutilisé aux reprises réseau. Ne pas retirer un nouveau bruit à chaque tentative. Déduplication par identifiant aléatoire propre au rapport, sans identifiant personnel stable.
- Transport séparé de l’identité applicative. Aucun cookie de compte ni jeton d’abonnement dans les analytics. Une production voulant cacher l’IP au collecteur doit prévoir un relais indépendant, par exemple OHTTP, et étudier taille/horaires/corrélation. OHTTP suppose une séparation des parties et ne supprime pas toute analyse de trafic. RFC 9458
Pour le backend : conserver les sommes bruitées, le nombre de rapports acceptés et la version du protocole ; pas de données individuelles interrogeables dans le produit. Publication à horaires fixes, après un seuil de cohorte fixé indépendamment des valeurs privées, avec intervalles d’incertitude. L’animation peut être fluide ; elle ne doit pas représenter des transmissions personnelles continuelles fictives.
Limites statistiques et produit
- Avec b=4, l’écart-type dû au bruit d’une moyenne de n rapports indépendants vaut 4√(2/n). À n=10 000, un intervalle normal approximatif à 95 % ajoute environ ±11 points pour une proportion, avant les autres erreurs. C’est mon calcul à partir du protocole proposé. Une petite bêta ne peut donc pas honnêtement produire des tendances fines.
- L’estimation concerne les participants volontaires observés, pas « l’humanité ». L’incertitude due au bruit ne corrige pas les biais de recrutement, de langue ou de classification.
- Ne pas tronquer chaque rapport bruité dans [0,1] avant d’en faire la moyenne : ce post-traitement peut biaiser l’estimateur. Un affichage final contraint est possible, mais l’inférence doit en tenir compte.
- « Temps de réflexion », « frustration » et « charge cognitive » ne sont pas des mesures directes. Utiliser des noms observables : durée de rédaction dans le launcher, corrections, abandon, nouvelle tentative, satisfaction déclarée. Une étude expérimentale sur le stress utilise notamment du matériel mesurant la pression des touches ; elle ne valide pas l’inférence générale de frustration à partir du seul tempo de frappe. Microsoft Research / CHI 2014
- Le premier avantage produit devrait être vérifiable individuellement : moins de répétition du contexte, mémoire rectifiable, contrôle de ce qui est envoyé, continuité entre modèles. Les statistiques globales peuvent attendre leur puissance statistique.
ZKP et vérifications
Pas de ZKP nécessaire en v1. Plus tard, une preuve pourrait porter sur une accréditation anonyme ou un calcul borné. Elle ne prouve pas, à elle seule, que les interactions ont réellement eu lieu, qu’un utilisateur n’a pas plusieurs appareils, ni que son générateur aléatoire a été honnête.
Critères vérifiables :
- Capture réseau et canaris sensibles : aucun texte brut ni embedding dans le trafic SaaS, les journaux, rapports d’erreur ou crashs.
- Analyse du flux de données et confinement OS : le coffre/classificateur ne peut contacter le SaaS ; le connecteur fournisseur ne reçoit que le contexte approuvé.
- Preuve de sensibilité et composition par version du protocole, plus tests de bornes, budgets, concurrence, reprises et redémarrages. Les tests statistiques seuls ne prouvent pas la DP.
- Simulation d’utilité avant activation : intervalles, couverture, biais de classification et effectif nécessaire.
- Modèle de menace publié : protection contre serveur analytics curieux/compromis ; limites face à malware local, fournisseur recevant le prompt, collusion de relais et clients fabriquant des rapports. La DP ne garantit pas l’authenticité des données.


Sunday 11:52 PM








Le moteur OMNI doit tourner principalement sur l’appareil. Je séparerais l’ingestion des sources, la mémoire et la sélection du contexte du modèle qui formule la réponse. Les trois premières fonctions restent locales ; le dernier peut être local ou distant. Un modèle distant reçoit uniquement le contexte sélectionné et autorisé. Le SaaS OMNI gère la distribution du logiciel et les statistiques volontaires, sans héberger la mémoire personnelle.
La mémoire ne doit pas être un unique « vecteur d’identité ». Je proposerais quatre couches dans un coffre chiffré :
- Sources et événements : conversations, documents autorisés, changements observés, avec origine et date.
- Faits temporels : « travaille chez X depuis juin », statut proposé/confirmé, provenance, période de validité et restrictions de partage.
- Index de recherche : embeddings recalculables, reliés aux sources et soumis aux mêmes permissions.
- Résumés : vues compactes pour une tâche donnée, jamais considérées comme plus fiables que leurs sources.
L’« entropie » utile à suivre serait surtout le désordre de cette mémoire : doublons, faits périmés, contradictions, informations ambiguës et inférences sans preuve. Ce n’est pas un score unique de compréhension. Une nouvelle information contradictoire doit créer une version ou un conflit explicite ; pas réécrire silencieusement l’histoire. Une donnée manquante reste inconnue. Le contenu importé reste une source à analyser, jamais une instruction autorisant de nouvelles actions.
Chaque souvenir dérivé conserve ses dépendances. Supprimer une source déclenche la suppression ou le recalcul des faits, résumés et embeddings correspondants ; les sauvegardes nécessitent leur propre politique d’effacement.
Impossible d’attribuer honnêtement un pourcentage à l’accès complet au device sans expérience. L’accès crée un potentiel d’information ; il ne mesure pas la capacité à sélectionner la bonne information.
Je testerais par ablation :
1. Conversations uniquement.
2. Conversations + dossiers choisis.
3. Ajout des calendriers et applications explicitement autorisés.
4. Sources supplémentaires, une catégorie à la fois.
Même modèle, mêmes tâches, même budget de contexte ; comparaison par utilisateur, ordre alterné. Mesurer réussite des tâches, corrections nécessaires, temps gagné, souvenirs faux/périmés, informations inutilement divulguées, latence et ressources consommées.
Le résultat recherché : quelles permissions produisent un gain mesurable pour quelles tâches ? Si ajouter une source augmente peu l’utilité mais beaucoup les erreurs ou l’exposition, elle reste désactivée par défaut.


Sunday 11:59 PM







Worked for 47s



OMNI peut faire autorité sur ce qu’il détient et autorise ; son pouvoir devient conditionnel dès qu’une information est divulguée.
Localement, je construirais une autorité personnelle de permissions : chaque agent demande une information ou une action, avec destinataire, finalité, périmètre et durée. OMNI applique une politique déterministe avant toute transmission : refus, réponse minimale, contexte autorisé ou confirmation. Le LLM propose ; il ne peut modifier ses propres droits. Cette autorité couvre les accès passant effectivement par OMNI.
Après divulgation, retirer l’autorisation coupe les accès futurs mais ne récupère pas les copies déjà reçues. La révocation OAuth invalide des jetons ; elle n’efface pas les données obtenues grâce à eux. L’arrêt immédiat dépend aussi du fonctionnement du serveur destinataire. RFC 7009
Il faut donc afficher séparément : « accès coupé », « suppression demandée », « suppression déclarée par le fournisseur ». Garantir l’effacement externe exige coopération, engagements vérifiables et contrôles externes. Une expiration inscrite dans un prompt n’est pas une protection technique.
Les standards peuvent fournir les pièces du protocole :
- GNAP organise la demande, la négociation et la gestion d’une autorisation déléguée. Pour les services existants, utiliser leurs mécanismes OAuth ; GNAP nécessite leur prise en charge. RFC 9635
- ODRL exprime permissions, interdictions et obligations d’usage. C’est un langage pour les politiques ; leur exécution nécessite un système qui les applique. W3C ODRL 2.2
- Verifiable Credentials et ZK permettent, avec des mécanismes et émetteurs compatibles, de présenter un attribut ou prouver un prédicat sans révéler toute l’identité : par exemple dépasser un âge sans transmettre la naissance. Une preuve vérifie l’authenticité d’une déclaration ; elle ne rend pas automatiquement cette déclaration vraie. W3C VC 2.0
OMNI devrait distinguer préférences déclarées, observations, inférences et attestations externes. L’utilisateur contrôle son représentant ; il ne devient pas pour autant l’émetteur reconnu de tout diplôme ou statut.
Mon choix économique : abonnement utilisateur, tarification transparente, export complet et classement des services auditable. Faire payer l’utilisateur aide, mais ne suffit pas : vente de profils, commissions de routage et publicité peuvent toujours créer des intérêts concurrents. Je prohiberais la vente des données personnelles et les rémunérations influençant silencieusement les recommandations. La publicité éventuelle passerait par une sélection locale, sans accès de l’annonceur au coffre.


12:03 AM








Périmètre v1 : coffre local faisant autorité pour les échanges qui passent par OMNI, avec connecteurs IA explicites et analytics volontaire.
Coffre et mémoire
- SQLite via SQLCipher ; clé aléatoire de 256 bits conservée dans le trousseau OS. La biométrie autorise son utilisation ; aucune dérivation depuis l’empreinte matérielle ou biométrique.
- Quatre objets : Source, MemoryFact, Grant, DisclosureReceipt. Chaque fait contient valeur, provenance, dates d’observation/validité, statut proposed | confirmed | disputed | superseded, et références des sources.
- Embeddings et résumés sont des vues dérivées avec dépendances enregistrées. Les contradictions créent des versions explicites ; une inférence reste identifiée comme telle.
- Interfaces : ingest(source), search(query, scope), confirm(fact_id), supersede(fact_id, replacement), delete_source(source_id). Suppression transactionnelle des dérivés ou recalcul depuis les sources restantes ; politique distincte pour sauvegardes. Ne pas promettre l’effacement physique immédiat de blocs sur SSD.
Permissions et divulgations
- Grant fixe destinataire, sources/catégories autorisées, opérations et expiration. Aucun renouvellement implicite ni délégation supplémentaire.
- prepare_context(request, grant_id) retourne les extraits proposés et leur provenance ; authorize_send(preparation_id) vérifie de nouveau droits et expiration avant transmission.
- revoke(grant_id) bloque immédiatement les opérations futures dans OMNI. Une requête déjà envoyée ne peut être retirée du fournisseur.
- DisclosureReceipt enregistre localement destinataire, date, références divulguées et autorisation. Distinguer accès révoqué, suppression externe demandée et réponse déclarée du fournisseur.
- Le modèle propose du contexte ; une politique déterministe décide des permissions. Le texte importé ne crée jamais d’autorisation.
Séparation des processus
- Worker coffre/mémoire sans accès réseau ; connecteur fournisseur sans accès direct au coffre ; exportateur analytics recevant uniquement un rapport DP sérialisé.
- IPC à schémas fermés, sans champs arbitraires dans les analytics. Secrets et conversations exclus des journaux.
- Appliquer aussi les restrictions OS aux helpers signés. Les types Rust constituent une barrière d’architecture, pas une preuve de confinement. La documentation distingue garanties effectivement vérifiées et limites d’une exécution de développement non confinée.
Analytics DP
- Désactivé par défaut ; pilote monoappareil, quatre contributions hebdomadaires maximum, budget composé maximal ε=4.
- Rapport hebdomadaire : histogramme local normalisé sur huit catégories fixes, latence moyenne bornée et tokens moyens bornés. Aucun identifiant permanent, texte, embedding ou catégorie libre.
- Allocation par rapport : histogramme ε=0,5, chacune des moyennes ε=0,25. Sensibilités respectives 2, 1, 1 après normalisation ; Laplace d’échelle 4, via bibliothèque DP éprouvée traitant la précision numérique.
- Budget consommé atomiquement, rapport bruité persisté puis réutilisé aux reprises. Aucun reset automatique. Transport HTTPS ; absence d’anonymat IP explicitement documentée.
- Publication uniquement avec effectif et incertitude affichés ; aucun « index cognitif » présenté comme mesure validée.
Acceptation
Tester chiffrement, provenance/contradictions, suppression des dérivés, refus interdestinataires, expiration/révocation, reprise après crash, plafond DP concurrent, déduplication et absence de canaris sensibles dans trafic/journaux. Joindre l’analyse de sensibilité/composition ; les tests de distribution ne constituent pas une preuve DP.


12:08 AM







Valide mathématiquement : trois vecteurs du simplexe, sensibilité L1 2 chacun, ε=1/3 ⇒ échelle Laplace 6 ; composition ε=1 par rapport puis ε≤4 par installation.
Points à verrouiller :
- Définir le dénominateur : interactions tentées ; délais incomplets et tokens manquants vont dans « inconnu ». Zéro interaction produit uniquement « inactif ».
- Ne jamais transmettre séparément activité, effectif local, catégories présentes ou horaires précis.
- Le calendrier d’émission doit être indépendant de l’activité. La garantie protège les valeurs rapportées ; elle ne masque pas automatiquement participation, présence réseau ou IP.
- Conserver les rapports bruités sans troncature individuelle pour l’estimation.
- 10 000 rapports reste un seuil opérationnel, pas une garantie de précision : avec échelle 6, l’incertitude du bruit seule atteint approximativement ±16,6 points à 95 % par coordonnée.
- Distinguer intervalles ponctuels et simultanés sur 24 coordonnées ; compter les rapports dédupliqués, sans revendiquer des utilisateurs distincts ni une protection multiappareil.
