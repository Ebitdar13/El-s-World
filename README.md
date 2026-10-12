# Recipe Press: setup on GitHub + Cloudflare

Visitors can browse your recipes without an account. Signing in with your editor passphrase lets you add and edit recipes, upload photos, and build cookbooks that export as KDP-ready interior PDFs. Cookbooks are visible only to editors.

## What's in this folder

| Path | What it is |
|---|---|
| `public/index.html` | The website |
| `functions/api/[[path]].js` | The data API (runs on Cloudflare) |
| `schema.sql` | Creates the three database tables |

## 1. Put the code on GitHub (3 min)

1. On github.com, click **New repository**. Name it `recipe-press`. Private is fine. Click **Create repository**.
2. Click **uploading an existing file**.
3. Drag in the **contents** of this folder: `public`, `functions`, `schema.sql`, `README.md`. Keep the folder structure.
4. Click **Commit changes**.

## 2. Create the database (2 min)

1. In the Cloudflare dashboard, go to **Storage & Databases → D1 SQL Database → Create**. Name it `recipe-press`.
2. Open the database, go to **Console**, paste the contents of `schema.sql`, and click **Execute**. If it only accepts one statement at a time, run the three lines one by one.

## 3. Create the site (3 min)

1. Go to **Workers & Pages → Create → Pages → Connect to Git**, then pick the `recipe-press` repository.
2. Build settings:
   - Framework preset: **None**
   - Build command: *(leave blank)*
   - Build output directory: `public`
3. Click **Save and Deploy**.

## 4. Connect the database and set your passphrase (3 min)

In the Pages project, go to **Settings**:

1. **Bindings → Add → D1 database**. Variable name `DB`, database `recipe-press`.
2. **Variables and Secrets → Add**. Type **Secret**, name `EDIT_KEY`, value: a long passphrase of at least 8 characters (four random words works well). Anyone with this passphrase can edit.
3. Go to **Deployments** and click **Retry deployment** on the latest one. Bindings take effect on the next deploy.

## 5. Use it

- Open the `https://recipe-press-xxx.pages.dev` address Cloudflare shows you.
- Click **Editor sign in** and enter your passphrase. The device remembers it until you sign out.
- To use your own domain, go to **Custom domains** in the Pages project.
- To share editing with a co-author, give them the passphrase. To revoke access, change `EDIT_KEY` and redeploy.

## Updating the site later

Edit files in the GitHub repository (or upload replacements). Cloudflare redeploys automatically on every commit, and your recipes stay in the database.

## Backups

When signed in, use **Export backup** on the Recipes tab for a JSON copy of all recipes and cookbooks. **Import backup** restores one. Photos are not included in backups.

## Limits on the free plan

D1's free tier holds 5 GB. Photos are resized to about 1,800 px before upload (roughly 300–600 KB each), which leaves room for thousands of recipes.
