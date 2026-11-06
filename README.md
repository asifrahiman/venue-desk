# Venue Desk

A phone-friendly tracker for collecting venue requirements from each team lead, following up on WhatsApp, and sending the summary and detailed report to the venue lead.

- `public/index.html` is the app (Requirements, Teams and Summary tabs).
- `api/data.js` is the API. It stores data in Upstash Redis.
- `lib/seed.js` holds the data copied from the Claude version. It's loaded once, the first time the app runs against an empty database.

Anyone with the link can view the app. Making changes needs the edit PIN, which you set as `EDIT_PIN` in Vercel.

## Deploy (one time, about 15 minutes)

1. **Put the code on GitHub.** Create a new private repository called `venue-desk`. Click **uploading an existing file** and drag in everything in this folder: `api`, `lib`, `public`, `package.json`, `README.md` and `.gitignore`. Then click **Commit changes**.
2. **Import it into Vercel.** Go to **Add New → Project**, pick the `venue-desk` repo, leave every setting as it is (Framework Preset: Other), and click **Deploy**. The first deploy works, but the app says storage isn't connected until you finish step 3.
3. **Add storage.** In the project, open **Storage → Create Database** (or **Browse Marketplace**). Choose **Upstash → Upstash for Redis**, pick the **Free** plan and a region close to India (e.g. Mumbai or Singapore), and connect it to the `venue-desk` project for all environments.
4. **Set your PIN.** Go to **Settings → Environment Variables** and add `EDIT_PIN` with the PIN you want, e.g. a 4 to 6 digit number. Apply it to all environments.
5. **Redeploy.** Go to **Deployments**, open the ⋯ menu on the latest deployment and click **Redeploy**, so the storage and PIN settings take effect.
6. **Open it on your phone.** Go to `https://venue-desk.vercel.app` (or whatever domain Vercel shows on the project page). Tap **Unlock**, enter your PIN and add the page to your home screen. Send the same link to your teammates. They can view everything, but can't edit without the PIN.

## Later

- **Change the PIN:** edit `EDIT_PIN` in Vercel, then redeploy. Phones using the old PIN go back to view-only.
- **Change the app:** edit the files on GitHub. Vercel redeploys on its own after each commit.
- **Re-import from the Claude version:** this only works while the database is empty. Replace `lib/seed.js` with a fresh export, then clear the data from the Upstash console (Data Browser → delete the `vd:reqs`, `vd:teams` and `vd:settings` keys) and reload the app.
# venue-desk
