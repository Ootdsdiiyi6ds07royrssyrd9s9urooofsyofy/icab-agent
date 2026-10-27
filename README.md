# icab Agent

## Deploy to Render (Recommended)
1. Fork this repo to your GitHub
2. Go to https://render.com and sign up
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Render will auto-detect render.yaml
6. Click "Create Web Service"

Your app will be live at: https://icab-agent.onrender.com

## Deploy to Vercel
1. Import this repo to Vercel
2. Vercel will use vercel.json config
3. Add environment variable: OPENROUTER_API_KEY
4. Deploy

## Local Development
- Backend: `cd backend && npm install && npm start`
- Frontend: `cd frontend && npm install && npm run dev`
