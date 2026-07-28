# Tours Ici — édition premium mobile

Application locale PWA pour découvrir où manger, boire, sortir et visiter à Tours.

## Contenu

- `index.html` : application publique
- `admin.html` : espace terrain pour ajouter une adresse depuis le téléphone
- `places.js` : catégories et fiches de démonstration
- `app.js` : recherche, filtres, favoris, géolocalisation, partage et carte
- `style.css` : identité visuelle
- `manifest.json` + `sw.js` : installation PWA et cache
- `assets/icon.svg` : icône de l’application

## Tester

Ouvrez le dossier avec un petit serveur local, ou déposez tous les fichiers sur Vercel / GitHub Pages.

Exemple avec Python :

```bash
python -m http.server 8000
```

Puis ouvrez `http://localhost:8000`.

## Important

Les adresses présentes dans `places.js` sont des fiches fictives de démonstration.
Elles ne doivent pas être présentées comme des établissements réels.

L’espace terrain enregistre pour l’instant les nouvelles fiches dans `localStorage` :
elles restent sur l’appareil et le navigateur utilisés. Pour une vraie publication multi-utilisateurs,
il faudra ensuite connecter une base en ligne, par exemple Supabase.

La première photo choisie dans l’espace terrain est compressée et enregistrée dans la fiche locale. Pour un catalogue important et une synchronisation entre appareils, une base en ligne restera nécessaire.


## Nouveautés premium
- accueil nocturne inspiré des visuels fournis
- icônes fines homogènes
- filtres rapides entièrement visibles
- fiches allégées
- carte nocturne
- aucun badge « vérifié » sur les fiches de démonstration


## Consolidation finale royale — 27/07/2026

- corrections techniques issues de l’audit Claude conservées ;
- téléphone et site affichés dans la fiche détaillée ;
- erreur de quota localStorage gérée ;
- icône maskable séparée ;
- identité officielle Tours Ici intégrée ;
- icône PWA gold royal / bleu royal plus visible ;
- favicon et Apple Touch ajoutés ;
- image Open Graph ajoutée ;
- visuel principal recompressé ;
- ressources tierces Leaflet/OSM exclues du cache applicatif ;
- cache renouvelé.

## Fusion multi-activités / audio — 28/07/2026

Base de référence : cette version royale (identité, contact téléphone/site web, icônes PWA séparées, toutes les fonctions existantes conservées).

Ajouts intégrés par-dessus cette base :
- coordonnées latitude/longitude devenues optionnelles dans l’espace terrain (plus de champs obligatoires ni de bouton de géolocalisation) ;
- une fiche sans coordonnées n’apparaît jamais sur la carte et n’est jamais positionnée par défaut à 0,0 ;
- établissements multi-activités (ex. Bar-restaurant) et sélection de plusieurs types de cuisine ;
- nouvelles catégories Bar-restaurant et Épicerie / Commerce, cette dernière avec un filtre public visible ;
- recherche étendue aux activités et cuisines saisies ;
- note audio privée (60 secondes maximum, stockée dans IndexedDB sur l’appareil, jamais publiée) ;
- dictée vocale dans le champ « Ce qui rend ce lieu spécial », sans aucun service IA connecté ;
- cibles tactiles des nouveaux éléments portées à 44 px minimum ;
- libellé du bouton de favoris désormais dynamique (« Ajouter aux favoris » / « Retirer des favoris ») ;
- nouveau nom de cache PWA pour que la mise à jour soit bien reçue sur les téléphones déjà installés.
