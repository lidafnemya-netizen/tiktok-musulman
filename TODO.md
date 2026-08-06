# TODO — Nour App · CEO Mode
> Mis à jour: 2026-06-05 — Session CEO carte blanche
> Source règles: ~/Desktop/CLAUDE_AGENT_INSTRUCTIONS.md + ~/Desktop/RIDE_GUIDE_COMPLET.md

---

## 🔴 SESSION CEO — EN COURS (2026-06-05)

- [x] Swipe droite→gauche sur vidéo "Pour toi" → panel profil slide depuis droite (UserProfilePanel) ✅
- [x] Fix conflit PanResponder seek vs swipe profil ✅
- [x] SplashScreen animé (logo bounce + wordmark fadeUp + dots pulsants) ✅
- [x] ErrorBoundary global (remplace écran rouge développeur) ✅
- [x] Suppression tabs header: Boutique, Proche, Communauté ✅
- [x] Preloading vidéos: windowSize 5, faster bufferConfig ✅
- [x] Design system doc complet (design_system.md) ✅
- [x] Pull-to-refresh sur Pour toi + Suivis ✅
- [x] Heart animation TikTok style (bounce + float + fade) ✅
- [x] Action buttons spring bounce on press ✅
- [x] Dark mode ExploreScreen + MessagesScreen ✅
- [x] Onboarding redesign (icons, animated dots, no emoji) ✅
- [x] UserProfileScreen skeleton loading ✅
- [x] PostDetailScreen skeleton + dark mode ✅
- [x] Live viewer count broadcast temps réel ✅

---

> Inspiré de TikTok, Instagram Reels, BeReal, Twitter/Threads
> Généré le 2026-06-04

---

## 🔴 CRITIQUE (bugs bloquants)

- [x] Fix live streaming — viewer ne reçoit pas le stream WebRTC (closure stale localStream)
- [x] Fix liked posts — threads inclus dans l'onglet vidéos, video_url manquant
- [x] Fix render crash FeedScreen — FeedItem.id undefined
- [x] Fix double-tap like — délai 250ms supprimé, animation immédiate
- [x] Fix avatar propagation — loadMe() après upload
- [x] Fix thumbnails vidéo — Cloudinary fallback always-on
- [x] Fix message même genre — ConversationRequest unique constraint crash
- [ ] Fix LiveViewerScreen — chat ne s'affiche pas en temps réel (WebSocket room)
- [ ] Fix GoLiveScreen — afficher les messages viewers en live
- [ ] Fix vitesse 2x — certains players ne supportent pas `rate` prop

---

## 🟠 PRIORITÉ HAUTE (semaine 1)

### 📱 Feed "Pour toi"
- [x] Onglet "Suivis" — feed uniquement des comptes suivis
- [ ] Pull-to-refresh avec animation (spinner vert)
- [ ] Indicateur de chargement en bas (skeleton cards)
- [ ] Precaching des 2-3 vidéos suivantes (backgrounded)
- [ ] Mémorisation de la position dans le feed (reprendre où on était)
- [ ] Skip vidéo en swipant vers le haut plus rapidement (animation accélérée)
- [x] Indicateur de progression de la vidéo (barre verte en bas)
- [x] Durée de la vidéo affichée (badge haut gauche)
- [ ] Réduire le délai de single-tap pause (300ms → 200ms)

### 🎬 Lecteur vidéo
- [ ] Seek en maintenant appuyé gauche/droite (afficher le temps)
- [ ] Afficher le temps actuel / durée totale en mode 2x
- [ ] Résolution adaptative (quality selector bas)
- [ ] Replay automatique après la fin (animation de rechargement)
- [ ] Plein écran paysage si la vidéo est en 16:9 horizontal
- [ ] Pinch-to-zoom sur la vidéo
- [ ] Option désactiver l'autoplay (accessibilité)

### 💬 Commentaires
- [ ] Commentaires en temps réel (Socket.IO, pas de refresh)
- [x] Répondre à un commentaire (parent_id + banner @username)
- [x] Liker un commentaire (API réelle + toggle)
- [ ] Mentionner @utilisateur dans un commentaire
- [ ] Épingler un commentaire (créateur seulement)
- [x] Supprimer son propre commentaire (ActionSheet + API)
- [ ] Pagination des commentaires (load more)
- [ ] Afficher les commentaires en live dans le player (overlay)

### 👤 Profil
- [ ] Bannière/cover photo sur le profil (au-dessus de l'avatar)
- [ ] Lien externe dans la bio (cliquable)
- [ ] Catégorie/niche du compte (Islam, Coran, Famille...)
- [ ] Statistiques avancées (vues totales, portée)
- [ ] QR Code du profil (partager son compte)
- [ ] Bouton "Partager le profil" (lien universel)
- [ ] Mode créateur vs mode standard
- [ ] Onglet "Reposts" sur le profil

### 🔔 Notifications
- [ ] Page notifications avec 4 onglets : Tous / J'aime / Commentaires / Abonnés
- [ ] Notification groupée ("X et Y ont aimé ta vidéo")
- [x] Badge non-lus sur l'onglet Boite (navigation tab bar)
- [ ] Marquer tout comme lu
- [ ] Push notifications APNs (APNS_KEY_ID, APNS_TEAM_ID en env)
- [ ] Notification quand quelqu'un mentionne @vous dans un commentaire
- [ ] Notification quand votre vidéo est en tendance

---

## 🟡 PRIORITÉ MOYENNE (semaine 2-3)

### 🔴 Live amélioré
- [ ] Live co-host (2 streamers en split screen)
- [ ] Invite un spectateur en live (apparaît à côté du host)
- [ ] Compteur de viewers avec liste (clic sur compteur = liste)
- [ ] Replay du live (enregistrement automatique post-live)
- [ ] Miniature en live : bulles flottantes de réactions (cœurs, emojis)
- [ ] Cadeaux virtuels (diamonds → monétisation future)
- [ ] Partager le live (lien + story)
- [ ] Timer de durée du live affiché
- [ ] Mode portrait et paysage en live

### 📚 Livres
- [ ] Page détail livre (couverture grande, résumé complet, auteur, catégorie)
- [ ] Suivre un auteur
- [ ] Collection de livres (créer des listes)
- [ ] Partager un extrait de livre (screenshot stylisé)
- [ ] Ajouter un livre (upload cover + saisie texte)
- [ ] Livres en tendance (section dédiée)
- [ ] Lecture in-app (scroll continu style Kindle)

### 📤 Upload
- [ ] Filtres vidéo (luminosité, contraste, saturation)
- [ ] Rogner la vidéo (trimmer)
- [ ] Ajouter du texte sur la vidéo (titre, hadith, versets)
- [ ] Ajouter des stickers/emojis islamiques (croissant, étoile, mosquée)
- [ ] Choisir la couverture manuellement (frame selector)
- [ ] Duet — répondre à une vidéo en split-screen
- [ ] Stitch — cliper une partie d'une vidéo et y répondre
- [ ] Séries (regrouper des vidéos en playlist ordonnée)
- [ ] Brouillon (sauvegarder avant de publier)
- [ ] Planifier une publication (date + heure)
- [ ] Qui peut voir : Public / Abonnés / Seulement moi

### 💌 Messagerie
- [ ] Envoyer une vidéo/post depuis le feed en DM
- [ ] Réactions emoji sur les messages (appui long)
- [ ] Répondre à un message (swipe droite)
- [ ] Messages vocaux
- [ ] Envoyer des images en DM
- [ ] Messages éphémères (s'effacent après lecture)
- [ ] Status "vu" avec horodatage
- [ ] Indicateur "En train d'écrire..."
- [ ] Épingler une conversation
- [ ] Archiver une conversation
- [ ] Demandes de message (pour cross-gender : demande + acceptation)
- [ ] Partager un profil en DM
- [ ] GIF islamiques (via GIPHY API filtré)

### 🔍 Découverte
- [ ] Recherche par hashtag (résultats vidéos + comptes)
- [ ] Recherche par son/musique
- [ ] Tendances du jour (top hashtags)
- [ ] Page d'un hashtag (header + vidéos)
- [ ] Catégories dédiées : Coran, Hadith, Famille, Éducation, Humour Halal
- [ ] Challenges islamiques (ex: #30JoursCoranChallenge)
- [ ] Filtrer par pays/langue
- [ ] Comptes suggérés (based on who you follow)

---

## 🟢 PRIORITÉ BASSE (semaine 3-4)

### 🎵 Sons & Musique
- [ ] Bibliothèque de sons islamiques (nasheeds, anasheed)
- [ ] Sons originaux (créés par les utilisateurs)
- [ ] Favoriser un son (bookmark)
- [ ] Page d'un son avec toutes les vidéos qui l'utilisent
- [ ] Ajouter un son à ses favoris
- [ ] Créer un son depuis une vidéo (clip audio)
- [ ] Nasheed du jour (featured)

### 🌙 Fonctionnalités islamiques
- [ ] Heure de prière quotidienne (notification)
- [ ] Rappels du vendredi
- [ ] Calendrier islamique affiché
- [ ] Mode Ramadan (UI spéciale, compte à rebours iftar)
- [ ] Versets du Coran intégrés (API Quran.com)
- [ ] Hadiths du jour
- [ ] Duas du matin/soir
- [ ] Qibla compass dans l'app
- [ ] Compteur Tasbih
- [ ] Contenu géo-filtré (par pays musulman)

### 📊 Analytics créateur
- [ ] Dashboard views des 7/30 derniers jours
- [ ] Taux de complétion par vidéo
- [ ] Source de trafic (feed / profil / recherche)
- [ ] Démographie de l'audience (pays, âge)
- [ ] Meilleure heure de publication
- [ ] Revenu estimé (si monétisation activée)

### 💰 Monétisation (future)
- [ ] Programme créateur (seuil 1000 abonnés)
- [ ] Pourboires sur les lives (diamants → vrai argent)
- [ ] Contenu exclusif (abonnement payant par créateur)
- [ ] Marketplace islamique (vendre produits halal)
- [ ] Boost de publications

### 🛡️ Sécurité & Modération
- [ ] Signaler une vidéo avec catégories précises
- [ ] Système de points de contenu (3 violations → suspension)
- [ ] IA de modération automatique (contenu inapproprié)
- [ ] Filtre de mots offensants configurable par l'utilisateur
- [ ] Mode restreint (contenu filtré pour enfants)
- [ ] Confidentialité renforcée (qui peut me trouver, me taguer)
- [ ] Vérification d'email obligatoire
- [ ] 2FA (double authentification)
- [ ] Historique des connexions
- [ ] Blacklist de comptes (super-ban)

---

## 🔵 UX & POLISH (ongoing)

### Animations & Transitions
- [ ] Transition partagée avatar → profil (hero animation)
- [ ] Skeleton loading partout (pas de spinners vides)
- [ ] Haptic feedback sur tous les CTA (double tap, like, follow)
- [ ] Swipe-back natif iOS (edge swipe retour)
- [ ] Animation de publication réussie (confetti vert)
- [ ] Transition fluid entre feed et profil
- [ ] Bounce animation sur le compteur de like quand on aime
- [ ] Micro-interactions (pulse sur l'icône notifications)
- [ ] Loading screen animé au lancement (logo Nour + croissant)

### Accessibilité
- [ ] Support VoiceOver / TalkBack
- [ ] Taille de texte dynamique (respecter les préférences iOS)
- [ ] Mode haut contraste
- [ ] Réduire les animations (respecter prefers-reduced-motion)
- [ ] Sous-titres automatiques sur les vidéos

### Performances
- [ ] Lazy loading des images (blur-up effect)
- [ ] Cache vidéo intelligent (LRU 200MB)
- [ ] Compression des images avatar avant upload (max 200KB)
- [ ] CDN pour les vidéos (Cloudinary + cache headers)
- [ ] Service Worker pour mode offline
- [ ] Prefetch des 3 premières vidéos du feed
- [ ] Background fetch (iOS Background App Refresh)

---

## ⚙️ TECHNIQUE & INFRA

- [ ] Tests unitaires (Jest) pour les fonctions critiques
- [ ] Tests E2E (Detox) pour les flows principaux
- [ ] CI/CD GitHub Actions (build + test)
- [ ] Variables d'env Railway : APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY
- [ ] TURN server pour WebRTC (Twilio/Xirsys) — nécessaire en prod
- [ ] Monitoring erreurs (Sentry)
- [ ] Analytics (Mixpanel ou Amplitude)
- [ ] A/B testing infrastructure
- [ ] Rate limiting sur tous les endpoints API
- [ ] Pagination cursor-based sur tous les gets
- [ ] Webhooks pour les événements importants
- [ ] Backup DB quotidien Railway
- [ ] Staging environment (separate Railway project)
- [ ] Documentation API (Swagger auto-généré par Fastify)

---

## 📦 RELEASES

### v1.0 — MVP actuel
- Feed vidéo + upload + profil + follow + messages same-gender + live basique + livres

### v1.1 — Stabilité (en cours)
- Live streaming fonctionnel, liked posts, thumbnails, DA redesign

### v1.2 — Social
- Commentaires temps réel, réponses, notifications push, onglet Suivis

### v1.3 — Discovery
- Recherche avancée, hashtags, tendances, challenges

### v1.4 — Islamique
- Fonctionnalités islamiques (prières, Coran, hadiths), Ramadan mode

### v2.0 — Monétisation
- Programme créateur, cadeaux live, contenu exclusif

---

*Mis à jour : 2026-06-04*

---

## 🆕 SESSION 2026-08-03 — Nouvelle liste utilisateur

### 🎨 Design / Theme
- [ ] Extraire couleurs image 1 (light) et image 2 (dark) — attendre images
- [ ] Appliquer nouveau design system partout (espaces, arrondis, formes, icons, police, bordures) mobile + admin

### 🏛️ Admin
- [ ] Refonte UI admin
- [ ] Module stats (users/posts/comments/live)
- [ ] Module gestion comptes (list, ban, promote)
- [ ] Module gestion publications (list, hide, delete)
- [ ] Module gestion commentaires (list, delete, flag)
- [ ] Module support/tickets/demandes (list, reply, close)
- [ ] Ajouter des admins (invite/promote users to ADMIN)
- [ ] Paramètres globaux app

### 📱 Mobile — corrections UI
- [ ] Modifier profil: bouton changer photo de profil
- [ ] Header conversation DM: afficher pseudo destinataire
- [ ] Pour toi: afficher display_name (pas username)
- [ ] Publier: onglet "Photo" + sélection multiple galerie
- [ ] Publier: fix bug description (impossible d'écrire)
- [ ] Pour toi: retirer icons "son" et "x1"
- [ ] Pour toi: recadrer boutons profil/like/comment/share vers centre-droit
- [ ] Vidéo: long-press → sheet "republier/partager/..."
- [ ] Comments sheet: swipe down pour fermer
- [ ] Profil: swipe pour défiler ses propres vidéos
- [ ] Publier: label "pourtoi" (pas "feed"), "like" (pas "j'aime")
- [ ] Profil: retirer bouton "appareil photo" au-dessus avatar
- [ ] Fils: multi-photos
- [ ] Pour toi: recadrer live+vidéo (live déborde sur vidéo suivante, pseudo caché)
- [ ] Notifications: afficher pseudo par notif
- [ ] Pour toi: exclure ses propres vidéos
- [ ] Profil: retirer onglet "notification"
- [ ] Favoris: onglets Vidéos / Sons / Collections
- [ ] Favoris: créer collections + ajouter vidéos
- [ ] Messagerie: story via "+" en haut à gauche

### 🔐 Backend — data unique
- [x] Fix like unique par user (contrainte DB déjà en place)
- [x] Fix favorite unique par user (contrainte DB déjà en place)
- [x] Fix view unique par user (compteur incrémente 1x par user)
- [x] Enlever double-comptage vue sur GET /:id

