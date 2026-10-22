# Mise en ligne du site Heavy Fuzz

Guide technique, à suivre dans l'ordre. Compter environ **1 heure**, plus le délai d'activation du domaine (de quelques minutes à 24 h).

Le principe :

```
Google Agenda ──(toutes les 6 h)──▶ GitHub (construit le site) ──▶ GitHub Pages (héberge, gratuit)
                                                                        ▲
                                         heavyfuzz.be (OVH) ────────────┘  (le domaine pointe vers GitHub)
```

OVH ne sert **que** pour le nom de domaine (et la redirection e-mail). Pas besoin d'hébergement OVH.

---

## 1. Mettre le code sur GitHub (≈ 10 min)

1. Connecte-toi sur <https://github.com> (compte `DindonMaitre`).
2. En haut à droite : **+** → **New repository**.
   - *Repository name* : `heavy-fuzz`
   - **Public** (obligatoire pour GitHub Pages gratuit ; le code ne contient rien de secret)
   - Ne coche **rien** d'autre (pas de README, pas de .gitignore, pas de licence).
   - **Create repository**.
3. Envoie le code (dans un terminal ouvert dans le dossier `Website`) :

   ```bash
   git remote add origin https://github.com/DindonMaitre/heavy-fuzz.git
   git push -u origin main
   ```

   La première fois, une fenêtre de connexion GitHub s'ouvre : connecte-toi.

## 2. Activer GitHub Pages (≈ 5 min)

1. Sur la page du dépôt : **Settings** → **Pages** (menu de gauche).
2. *Build and deployment* → *Source* : choisis **GitHub Actions**.
3. Onglet **Actions** (en haut) → workflow **« Mise à jour du site »** → bouton **Run workflow** → **Run workflow**.
4. Attends ~2 minutes que les deux pastilles deviennent vertes ✅.
5. Le site est en ligne sur **<https://dindonmaitre.github.io/heavy-fuzz/>** 🎉

> Si une pastille est rouge ❌ : clique dessus pour lire l'erreur (et envoie-la-moi).

## 3. Acheter le domaine chez OVH (≈ 15 min)

1. Sur <https://www.ovhcloud.com/fr-be/domains/>, cherche `heavyfuzz.be` et ajoute-le au panier.
2. **Options** : aucune n'est nécessaire.
   - Refuse l'hébergement web, le « DNS anycast », etc.
   - **Garde** le DNS OVH (gratuit, inclus).
3. Titulaire du domaine : idéalement **l'ASBL** (Heavy Fuzz ASBL, BE 1017.394.297), pas une personne, pour que le domaine reste à l'asso si l'équipe change.
4. Paie et attends l'e-mail de confirmation « domaine actif ».

## 4. Faire pointer le domaine vers GitHub (≈ 15 min)

### 4a. Prouver à GitHub que le domaine est à toi (recommandé, protège contre le piratage du domaine)

1. GitHub : clique sur ta photo (en haut à droite) → **Settings** → **Pages** (menu de gauche, section *Code, planning…*) → **Add a domain** → `heavyfuzz.be` → **Add domain**.
2. GitHub affiche un enregistrement **TXT** du genre `_github-pages-challenge-DindonMaitre` avec une valeur. Garde la page ouverte.

### 4b. Zone DNS chez OVH

Espace client OVH → **Web Cloud** → **Noms de domaine** → `heavyfuzz.be` → onglet **Zone DNS**.

1. **Supprime** les enregistrements **A** et **AAAA** existants pour `heavyfuzz.be` et `www.heavyfuzz.be` (ils pointent vers la page « parking » d'OVH). **Ne touche pas** aux enregistrements **MX**, **NS** et **SPF/TXT** liés au mail.
2. **Ajoute** (bouton *Ajouter une entrée*) :

| Type | Sous-domaine | Cible |
|---|---|---|
| A | *(vide)* | `185.199.108.153` |
| A | *(vide)* | `185.199.109.153` |
| A | *(vide)* | `185.199.110.153` |
| A | *(vide)* | `185.199.111.153` |
| AAAA | *(vide)* | `2606:50c0:8000::153` |
| AAAA | *(vide)* | `2606:50c0:8001::153` |
| AAAA | *(vide)* | `2606:50c0:8002::153` |
| AAAA | *(vide)* | `2606:50c0:8003::153` |
| CNAME | `www` | `dindonmaitre.github.io.` *(avec le point final)* |
| TXT | `_github-pages-challenge-DindonMaitre` | *(la valeur donnée par GitHub à l'étape 4a)* |

3. Retourne sur la page GitHub de l'étape 4a → **Verify** (si ça échoue, réessaie plus tard : le DNS peut mettre jusqu'à quelques heures).

### 4c. Brancher le domaine sur le site

1. Dépôt `heavy-fuzz` → **Settings** → **Pages** → *Custom domain* : `heavyfuzz.be` → **Save**.
2. Attends que le test DNS passe au vert, puis coche **Enforce HTTPS** (la case peut rester grisée jusqu'à ~1 h, le temps que le certificat soit créé).
3. Relance une mise à jour : **Actions** → **Mise à jour du site** → **Run workflow**. Le site recalcule automatiquement ses adresses pour `https://heavyfuzz.be`.

Vérifie : <https://heavyfuzz.be>, <https://www.heavyfuzz.be> (doit rediriger), <https://heavyfuzz.be/next/>.

## 5. Adresse e-mail contact@heavyfuzz.be (optionnel, ≈ 5 min)

OVH → `heavyfuzz.be` → onglet **E-mails** → **Redirections** → **Ajouter une redirection** :
de `contact@heavyfuzz.be` vers `contact.heavyfuzz@gmail.com`.

Puis remplace `contact.heavyfuzz@gmail.com` par `contact@heavyfuzz.be` dans `data/site.json` et `data/links.json`.

## 6. Google Agenda (quand l'asso a validé le site)

*Section complétée à l'étape suivante (création de l'agenda public, adresse iCal à mettre dans la variable `ICAL_URL` du dépôt).*

---

## Aide-mémoire

| Action | Comment |
|---|---|
| Prévisualiser sur son ordinateur | `npm install` (une fois) puis `npm start` → <http://localhost:8080> |
| Forcer une mise à jour du site | GitHub → **Actions** → **Mise à jour du site** → **Run workflow** |
| Tester le parseur | `npm test` |
| Régénérer les logos | `npm run logo` |

**Variables du dépôt** (Settings → Secrets and variables → Actions → onglet *Variables*) :

| Nom | Valeur | Obligatoire |
|---|---|---|
| `ICAL_URL` | adresse iCal publique du Google Agenda | non (sinon seul `events.manual.json` est utilisé) |
| `SITE_URL` | `https://heavyfuzz.be` | non (détectée automatiquement) |
