# Better Canvas

A private homework and grades dashboard for **MCPS students**. It puts your Canvas assignments and your StudentVUE grades in one place, shows what is missing or due next, and installs on your phone like an app. It is read-only: it never submits or changes anything.

## Set up your own copy (no downloads or installs)

Better Canvas is for **MCPS students only**. There is no shared Better Canvas website to sign up for. **Each student runs their own private copy** on a free hosting account, so your Canvas key and StudentVUE password stay in your account and nobody else ever sees them. Everything happens in a web browser, so it works on a Chromebook or school laptop.

> [!IMPORTANT]
> **You must do two things yourself. Nobody can do them for you:**
>
> 1. **Generate your own Canvas API key** from your own MCPS Canvas account (Step 1).
> 2. **Enter your own environment variables** (your settings, like the key and your site password) in your hosting account (Step 3).
>
> If either is missing or wrong, your site will not show your assignments: it shows sample data, an error, or does not start.

**You need:** about 10 minutes, a free [Render](https://render.com) account, and your MCPS Canvas login.

### Step 1: Generate your Canvas API key

A Canvas API key (Canvas calls it an "access token") is like a library card that lets your Better Canvas site read your own assignments. It can only read; it cannot submit or change anything.

1. Sign in to [MCPS Canvas](https://mcpsmd.instructure.com) in your browser.
2. Click **Account** (your profile picture, top left), then **Settings**.

   <img src="docs/setup/canvas-key-1-settings.png" alt="Canvas Account menu with Settings highlighted" width="420">

3. Scroll down to **Approved Integrations** and click **+ New Access Token** at the bottom of the list.

   <img src="docs/setup/canvas-key-2-new-token.png" alt="Approved Integrations list with the New Access Token button highlighted" width="520">

4. For **Purpose**, type `Better Canvas`. For **Expiration date**, pick the latest date allowed and **write the date down**. **MCPS keys last at most 90 days**, so you will need to make a new one about every three months (see "When your Canvas key expires" below).
5. Click **Generate Token**.

   <img src="docs/setup/canvas-key-3-form.png" alt="New Access Token form with Purpose and Expiration date" width="520">

6. **Copy the key right away and keep it somewhere private.** Canvas says "Copy this token down now": once you close this window you can never see it again. If you lose it, click **Regenerate Token** (or delete it and make a new one). The old key then stops working.

   <img src="docs/setup/canvas-key-4-copy.png" alt="Access Token Details showing where the token appears, with the warning to copy it now" width="520">

**Never share your key or paste it into a chat, a message, GitHub, or anywhere except your own Render settings.** Anyone with it can read your Canvas.

### Step 2: Start the deploy

Click this button and sign in to Render (or create a free account):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ewith20es/bettercanvas)

Render reads this project's `render.yaml` file and prepares a new web service in **your** Render account. If it asks for a **Blueprint name**, any name works, for example `bettercanvas`.

### Step 3: Enter your environment variables

Environment variables are your site's private settings. On the same Render page, you will see a box for each of the two marked **You enter**. **Fill in both before you click deploy.** Render will not ask again later, and the site cannot work without them.

| Variable | Who fills it in | What to put |
| --- | --- | --- |
| `CANVAS_ACCESS_TOKEN` | **You enter** | The Canvas key you copied in Step 1. |
| `APP_PASSWORD` | **You enter** | A password you make up for **your Better Canvas site**, at least 8 characters. Do **not** reuse your Canvas, Google, or school password. |
| `APP_SECRET` | Filled in for you | Render generates a random value. Leave it. |
| `CANVAS_BASE_URL` | Filled in for you | `https://mcpsmd.instructure.com`. Do not change it. |
| `STUDENTVUE_PROXY_PROVIDER` | Filled in for you | `mobile` (signs in to StudentVUE directly with MCPS). |
| `NODE_ENV`, `NODE_VERSION` | Filled in for you | Leave as they are. |

You can change any of these later in Render: open your service, then **Environment**, edit the value, and choose **Save and deploy**.

### Step 4: Deploy and sign in

1. Click **Deploy Blueprint** (Render may call it **Deploy** or **Apply**) and wait for the first build to finish. It takes a few minutes. When it is done, your service shows **Live**.
2. Open your service in Render and click the web address near the top, something like `https://bettercanvas-xxxx.onrender.com`. **Bookmark it.** This is your Better Canvas site.
3. On the **App passphrase** screen, type the `APP_PASSWORD` you made up in Step 3.
4. Open **Courses** and use each class's **Schedule period** menu so your classes list in your schedule order. If a Canvas course or section name already says the period (like "Period 3"), it is filled in for you. Canvas has no real class schedule, so the rest you set once yourself. Your choices are saved in that browser.
5. **Set your key reminder:** open **Settings**, enter the expiration date from Step 1 under **Key expiration date**, and click **Save date**. The sidebar then counts down so your key does not expire by surprise.
6. **Optional, for grades:** open **Gradebook**, choose **Student ID and password**, and sign in with your MCPS student ID and StudentVUE password. The Gradebook gets your periods, rooms and bell schedule from StudentVUE automatically.
7. **Optional, on your phone:** open your site and use **Share → Add to Home Screen** (iPhone, in Safari) or **Install app** (Android/Chrome). **Settings → Install the app** also shows how.

### Good to know

- **Your site shows "Demo workspace" or sample data?** `CANVAS_ACCESS_TOKEN` is empty. Add it in Render → **Environment** (see below).
- **"Canvas token expired or was rejected"?** The key is wrong, expired, or was deleted in Canvas. Make a new one (Step 1) and replace it as described below.
- **The deploy fails or the site will not start?** `APP_PASSWORD` is probably empty or shorter than 8 characters. In Render, open your service → **Logs** to see the exact message.
- **First load is slow sometimes.** Render's free plan puts your site to sleep after 15 minutes without visitors. The next visit shows a loading page for about a minute while it wakes. This is normal.
- **When your Canvas key expires,** make a new one (Step 1), then replace `CANVAS_ACCESS_TOKEN` in Render → **Environment** and choose **Save and deploy**. Then update the date in **Settings → Key expiration date**.
- **Getting updates:** your copy never changes by itself. To get the newest version, open your service in Render and click **Manual Deploy → Deploy latest commit**. Your settings are kept.
- **Keep your site address and `APP_PASSWORD` to yourself.** Anyone with both can see your assignments.
- **Free plan limits:** one Better Canvas site fits within Render's free monthly hours. Other free Render services in the same account share those hours.

If something goes wrong, ask in the [support Discord](https://discord.gg/e7Cwd6YWHU).

## Features

- Home: missing/overdue/redo work first, followed by Today, Tomorrow, Later, and undated work.
- Assignments: search, course filter, All / Upcoming / Missing / Submitted / Graded / Hidden, plus a Needs work filter. Missing includes both Canvas-marked missing work and overdue unsubmitted assignments, with a red count badge when any remain. Hidden assignments and courses are excluded from the badge.
- Hide announcement-like assignments with the eye button. They turn gray until you leave the current page or assignment tab. Find and restore them under Hidden, with search, course/status filters, and sorting by due date, name, or course. Hiding is saved per account on this device and does not change Canvas.
- Calendar: assignment deadlines, month navigation, selected-day agenda, and undated work.
- Courses: show/hide courses, local nicknames and colors.
- Gradebook: StudentVUE connection, grading periods, schedule-ordered grade cards, course/category details, searchable and sortable assignment scores, and a what-if estimate for a new assignment.
- Settings: connection state, per-course update results, timezone, theme, optional offline data, installation instructions, clear data, and sign out.
- Assignment details: due/submitted times, grading, missing/late flags, points, availability, and the Canvas link.

Submission, grading, and deadline status are independent. A graded zero can still be missing. Overdue is calculated; Missing and Late come from Canvas. External-tool or absent submission data gets an explicit check/unavailable label. The app cannot submit work or mark something submitted.

## For developers

Running the code on your own computer, configuration details, how the StudentVUE connection works, and the project structure are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Copyright and Licensing

Copyright © 2026 Evan Zhang and Sean Zhang. All rights reserved.

Better Canvas's original source code, interface, documentation, graphics,
and other original materials may not be copied, modified, redistributed,
published, hosted, or used in another project without prior written
permission.

**Personal-use exception:** any current MCPS student may deploy an unmodified copy of this software for their own personal, non-commercial use by following the setup instructions in the README. This exception does not permit modifying, redistributing, or selling the software, or hosting it for anyone other than yourself.

Third-party packages and other third-party materials remain subject to
their respective licenses.

See [LICENSE.md](LICENSE.md) for the complete notice.