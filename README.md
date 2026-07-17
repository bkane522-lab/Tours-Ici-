# Tours Ici — première base mobile

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
