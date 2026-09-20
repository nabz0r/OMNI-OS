# OMNI — De la première continuité à une infrastructure personnelle

Une trajectoire de zéro à un million de personnes commence par une personne qui choisit de revenir.

Cette feuille de route organise trois phases : **Genesis**, **Sovereign Agent**, **Global Mesh**. Les tailles de cohortes et seuils ci-dessous sont des objectifs expérimentaux proposés. Ils ne décrivent ni une adoption acquise, ni des prévisions commerciales, ni une capacité déjà démontrée. Les passages de phase dépendent de preuves ; aucune date ne les rend automatiques.

| Phase           | Échelle illustrative visée       | Question à résoudre                                                                        |
| --------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| Genesis         | 0 → 100 participants volontaires | Une mémoire contrôlable améliore-t-elle réellement les usages existants ?                  |
| Sovereign Agent | 100 → 10 000 utilisateurs actifs | Peut-on déléguer avec des limites compréhensibles et effectivement appliquées ?            |
| Global Mesh     | 10 000 → 1 000 000 de personnes  | Cette autonomie peut-elle durer entre appareils, fournisseurs et opérateurs indépendants ? |

Les installations, comptes, abonnements, participants à une étude et utilisateurs actifs restent des mesures distinctes. Leur méthode de comptage sera publiée avec les résultats. Le collecteur actuel reçoit des rapports d’installation ; il ne mesure pas un nombre de personnes uniques. La mesure d’un pilote utilisera un consentement séparé, sans rendre la télémétrie obligatoire pour utiliser OMNI.

## Le point de départ — Une v1 exécutable, des frontières explicites

Le dépôt contient un coffre **SQLCipher**, des souvenirs avec provenance et statut, des autorisations de partage limitées par destination, portée et expiration, des justificatifs de divulgation, et des connexions explicites aux protocoles OpenAI et Anthropic. La capture navigateur requiert une action volontaire. L’extraction locale propose des souvenirs à examiner.

La v1 inclut aussi **OpenDP**, un budget persistant, un export analytique au schéma numérique fermé, et un collecteur avec déduplication et seuil de publication. La participation analytique est facultative. Le protocole pilote autorise au plus quatre rapports hebdomadaires, avec une perte de confidentialité composée annoncée ; ce plafond ne se remet pas silencieusement à zéro.

Le transport utilise **WireGuard/BoringTun**, une admission par paquet authentifié (_Single Packet Authorization_), une protection contre les rejeux et une politique de rotation des clés d’identité client de **30 minutes**. La couche sémantique s’appuie sur les intégrations applicatives. Faire transiter HTTPS dans un tunnel ne révèle pas son contenu.

**React, Three.js et Tauri** rendent la mémoire et ses permissions inspectables. Le laboratoire utilise des données synthétiques signalées comme telles. Ses contrôles et les vérifications d’interopérabilité constituent des preuves sur les scénarios testés, pas une mesure d’adoption ou de résistance à toute compromission.

Restent **à construire ou à évaluer** : un processus de coffre isolé par les permissions de l’OS, un graphe sémantique temporel, une autorité fine par agent et par action, une synchronisation personnelle entre appareils, et une fédération entre opérateurs. **SingleStore, Kubernetes et la fédération ne sont pas des composants implémentés de cette v1.** Leur intérêt devra être démontré par un besoin et un essai comparatif. L’état technique détaillé demeure dans l’[architecture](ARCHITECTURE.md), le [protocole de confidentialité](docs/PRIVACY.md), le [transport VPN](docs/VPN.md) et les [preuves de validation](docs/VALIDATION.md).

## Phase I — Genesis : mériter une place dans la journée

**Promesse à éprouver :** continuer une tâche entre plusieurs IA avec moins de répétitions, tout en sachant ce qui a été partagé.

Le premier terrain proposé est celui des indépendants, développeurs et petites équipes qui utilisent plusieurs assistants sur des projets suivis. La distribution commence par des pilotes accompagnés dans les communautés professionnelles accessibles à l’équipe. Chaque participant vient avec un travail réel et choisit ses sources. Un cas d’usage complet vaut davantage qu’une longue liste de connecteurs.

Le produit doit rendre simples la première mémoire, sa correction, une permission limitée, une demande avec contexte et l’examen du justificatif correspondant. L’export et la restauration vérifiée du coffre font partie du travail à terminer avant une bêta publique. Le retrait d’une autorisation doit être compréhensible sans lecture du code.

### Les preuves avant d’élargir

- **Utilité :** au moins 30 participants recrutés, 20 parcours complets sur quatre semaines et 200 tâches comparées. Alterner l’ordre entre OMNI et une fiche de contexte préparée manuellement, avec le même modèle et le même budget de tâche. Viser une baisse médiane d’au moins 30 % du temps de remise en contexte, sans baisse de réussite supérieure à cinq points. Publier les distributions et leur incertitude.
- **Justesse :** sur les tâches examinées, viser au plus 2 % d’injections de souvenirs faux ou périmés. Les désaccords entre évaluateurs et les catégories sensibles restent visibles ; une moyenne favorable ne masque pas un incident grave.
- **Contrôle :** aucun accès non autorisé dans la suite de tests adversariaux définie avant le pilote. Toute divulgation observée doit correspondre à une permission applicable. Un échec bloque la diffusion de la version concernée jusqu’à correction et nouvelle vérification.
- **Installation et continuité :** sur le matériel explicitement pris en charge, au moins 90 % des participants atteignent une première interaction utile en moins de dix minutes. Chaque scénario de sauvegarde testé doit restaurer les souvenirs et leurs permissions sans perte silencieuse.
- **Énergie :** établir une mesure reproductible sur deux configurations de référence publiées. Au repos, fenêtre cachée et hors modèle de réponse, viser au plus 0,5 % du CPU total moyen sur dix minutes et 350 Mio de mémoire résidente. Mesurer séparément le coût de l’extraction locale ; publier également la consommation du parcours complet, modèle compris.
- **Valeur économique :** proposer un abonnement à un prix annoncé avant le test et obtenir au moins dix paiements réels, suivis d’un renouvellement majoritaire à la première échéance. Entretiens, intentions d’achat et essais gratuits seront comptés séparément.

Ces seuils servent à prendre une décision. Ils restent des hypothèses de pilotage, jamais des garanties annoncées au public avant mesure.

**Règle d’arrêt :** après deux itérations ciblées sans gain utile sur la comparaison, arrêter l’élargissement du segment et revoir le cas d’usage. Si l’accès à une source apporte peu d’utilité tout en augmentant les erreurs ou l’exposition, retirer cette source du parcours par défaut. Si les participants reviennent seulement pour la démonstration visuelle, revenir au travail quotidien qu’OMNI doit améliorer.

## Phase II — Sovereign Agent : déléguer sans abandonner l’autorité

**Promesse à éprouver :** une personne peut confier une tâche à un agent, vérifier les limites de cette délégation et interrompre ses futurs accès.

Cette phase transforme les autorisations de contexte actuelles en une autorité plus précise. Elle doit distinguer l’identité d’un agent, la ressource demandée, la destination, l’opération autorisée et sa durée. Les actions ayant des effets externes demandent des règles propres : limites de dépense, confirmations adaptées, reprises sûres et historique consultable. Le modèle peut proposer une action ; la décision d’autorisation doit rester déterministe et extérieure à son interprétation des messages.

La mémoire cible devient temporelle et reliée à ses sources : changements, contradictions, dépendances et résumés sont révisables. Le processus qui conserve le coffre devra être isolé des sorties réseau au niveau de l’OS, avec des canaux étroits vers les composants autorisés. Ce confinement reste un objectif à vérifier ; l’organisation actuelle des modules Rust ne le remplace pas.

La distribution pourra s’appuyer sur des intégrations d’agents et des partenaires choisis. Le financement reste centré sur un service payé par ses utilisateurs. Un abonnement pris en charge par une organisation doit laisser explicites les espaces personnels, les espaces professionnels et les droits respectifs. Le payeur ne reçoit aucun accès implicite au coffre personnel.

### Les preuves avant de généraliser la délégation

- **Autorité :** une évaluation indépendante couvre les injections par documents et outils, l’usurpation d’agent, l’élévation de privilèges et les reprises après révocation. Toute faille critique ou élevée permettant un contournement demeure bloquante pour la version distribuée.
- **Confinement :** des tests sous chaque OS pris en charge démontrent que le processus du coffre ne peut établir directement une connexion sortante et qu’un agent ne peut administrer ses propres droits. Publier les limites face à un OS compromis.
- **Fidélité de la mémoire :** sur au moins 1 000 épisodes de test couvrant les changements et contradictions, 100 % des souvenirs dérivés sélectionnés doivent avoir une provenance résoluble. Un souvenir sans source valide est exclu du contexte transmis.
- **Usage durable :** observer au moins 200 utilisateurs ayant terminé leur première tâche utile, puis viser une rétention d’au moins 50 % à huit semaines et une utilisation dans au moins deux intégrations pour 30 % de cette cohorte. Définir à l’avance ce qui constitue une tâche utile et une semaine active.
- **Fiabilité et ressources :** pour les connexions prises en charge, viser moins de 1 % d’échecs attribuables à OMNI sur une fenêtre de 30 jours. Pour la sélection d’un contexte déjà indexé, viser un surcoût local p95 inférieur à 150 ms sur les configurations publiées, sans relâcher les règles de permission. Toute nouvelle source doit apporter un gain mesuré au regard de son coût énergétique.
- **Viabilité :** sur une cohorte payante observée pendant trois mois, obtenir une contribution positive après hébergement, paiements et support directement attribuable. Publier les postes exclus du calcul, notamment la recherche et le développement. Éprouver la demande avec des renouvellements, sans la déduire du nombre de téléchargements.

**Règle d’arrêt :** un contournement de l’autorité suspend les opérations concernées. Des erreurs répétées de mémoire suspendent son injection automatique, avec retour au choix explicite. Si les intégrations changent plus vite que l’équipe ne peut les maintenir de manière fiable, réduire la couverture annoncée. La croissance attendra une délégation compréhensible et un service soutenable.

## Phase III — Global Mesh : faire circuler la continuité, garder les frontières

**Promesse à éprouver :** la personne peut conserver sa continuité entre appareils et opérateurs sans devenir captive d’un nouveau centre.

Le réseau cible relie des autorités personnelles. Il permet de transporter une mémoire, de synchroniser ce qui doit l’être et d’accorder des accès entre systèmes compatibles. Sa conception doit traiter les conflits, la perte d’un appareil, la révocation d’une clé, la récupération et la migration. Chacune de ces opérations devra conserver une signification claire pour la personne.

Une fédération éventuelle doit fonctionner avec des opérateurs indépendants et des protocoles publiés. Sa valeur dépendra de sorties réellement possibles : changer d’opérateur, migrer un coffre, révoquer un appareil, continuer avec un autre agent.

L’analytique collective restera un service facultatif. Le plafond du pilote v1 ne permet pas, à lui seul, une observation continue à cette échelle. Toute évolution exigera un protocole revu, une comptabilité explicite des divulgations successives et une étude du cas multiappareil. Les méthodes destinées à réduire l’exposition des métadonnées ou à résister aux contributions fabriquées devront être évaluées séparément. Aucune de ces protections ne découle automatiquement du nombre d’utilisateurs.

### Les preuves avant chaque changement d’échelle

- **Portabilité :** avant de déclarer la fédération disponible, réussir un aller-retour de migration avec deux opérateurs indépendants, sur un corpus versionné. Aucun souvenir, lien de provenance ou droit ne doit être perdu ou élargi silencieusement.
- **Récupération :** démontrer les scénarios d’appareil perdu, de clé révoquée et de restauration après incident. Les exigences de récupération et leurs compromis de confiance doivent être présentés avant l’activation de la synchronisation.
- **Capacité :** franchir des essais distincts correspondant à 10 000, 100 000 puis 1 000 000 d’installations simulées. Pour chaque palier, publier fréquence des événements, simultanéité, taille des rapports, matériel, latences, taux d’erreur et coût. Un million de clients simulés ne sera jamais présenté comme un million de personnes acquises.
- **Exploitation :** avant chaque palier commercial, tenir pendant 30 jours l’objectif annoncé pour les services gérés, proposé à 99,9 % de disponibilité, puis effectuer une restauration vérifiée. Une panne du SaaS ne doit pas empêcher la consultation locale des souvenirs ni leur export.
- **Statistiques :** conserver un affichage d’insuffisance de données lorsque la publication n’est pas justifiée. La v1 exige déjà 10 000 rapports hebdomadaires en production, mais ce seuil ne garantit ni représentativité ni précision suffisante. Fixer une précision nécessaire par question, puis vérifier bruit, biais et taille d’échantillon avant de publier une conclusion.
- **Économie et énergie :** maintenir une contribution positive, mesurer l’énergie et le coût par tâche utile, et vérifier qu’un palier d’infrastructure améliore effectivement la situation. SingleStore, Kubernetes ou un calcul fédéré n’entrent dans la cible retenue qu’après comparaison reproductible avec une solution plus simple.

**Règle d’arrêt :** différer un palier si le coût, l’énergie, la récupération ou le contrôle se dégradent au-delà des seuils annoncés. Suspendre une statistique si elle ne soutient pas la conclusion affichée. Refuser un partenariat qui exige un accès implicite aux mémoires ou une influence cachée sur les recommandations. Une fédération qui empêche de sortir manquerait son propre objectif.

## La mesure qui traverse les trois phases

Nous suivrons le temps de contexte évité, les tâches menées à terme, les corrections nécessaires, les divulgations inutiles, les accès refusés à juste titre, les incidents, la rétention, les renouvellements, le coût et l’énergie par tâche utile. Ces mesures doivent rester lisibles séparément. Aucun score unique de « compréhension de la personne » ne les remplace.

Chaque expérimentation annoncera sa comparaison, sa durée, ses seuils et ses critères d’arrêt avant de commencer. Les résultats défavorables auront leur place dans la décision suivante.

Le million est un horizon de diffusion. La promesse à préserver reste intime : retrouver sa continuité, choisir ses limites, garder la possibilité de partir.
