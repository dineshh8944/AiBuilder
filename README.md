# TTP CRM - AI-powered CRM (React + Express + MongoDB + Google Gemini)

Website created by Lucky.

## Run it

You need Node.js 20+ and MongoDB running on your computer.

**Terminal 1 - backend**
```
cd backend
npm install
npm start
```
You should see `MongoDB connected` and `Backend running on http://localhost:8000`.

**Terminal 2 - frontend**
```
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 and register an account.

## Settings (backend/.env)

| Name | What it is |
| --- | --- |
| `PORT` | Backend port (default 8000) |
| `MONGODB_URI` | MongoDB address, e.g. `mongodb://127.0.0.1:27017/ttp_crm` |
| `JWT_SECRET` | Secret that signs login tokens |
| `GEMINI_API_KEY` | Free key from https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Optional. First model to try (default `gemini-3.8-flash`) |
| `GEMINI_FALLBACK_MODELS` | Optional. Backups if the first is unavailable or rate-limited |

Do not share or upload `.env` - it holds your keys. Restart the backend after changing it.

## Every user has separate data

Leads, contacts, tasks and notes belong to the account that created them. Every query filters by the logged-in user, so one user can never see, edit or delete another user's records, and the AI only reads the caller's own data. The same contact email can be saved by different users, but only once per user.

**Data created before this update** has no owner and stays hidden. Give it to one account with:
```
cd backend
npm run claim-data -- your@email.com
```
After updating, everyone must log in once again (old login tokens were not secure). Old passwords still work.

## AI features

- **Ask AI** chat (bottom-right): knows your leads, pipeline and follow-ups.
- **AI Lead Summary / risk score / next best action**: lead drawer and Pipeline cards.
- **AI email generator**: lead drawer.
- **AI Sales Insights**: dashboard.

If AI does not work, open **Settings -> AI Integration**. It runs a real test call and shows the exact reason (wrong key, quota used up, no internet...).

## Tests

```
cd backend
npm test
```
Needs MongoDB running. It uses a temporary test database and a fake Gemini, so it uses no API quota.
