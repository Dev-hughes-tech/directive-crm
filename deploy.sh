#!/bin/bash
echo "🚀 Deploying Directive CRM..."

# Push to GitHub
git add -A
git commit -m "Deploy $(date '+%Y-%m-%d %H:%M')" 2>/dev/null || echo "Nothing new to commit"
git push

# Deploy to Vercel production
npx vercel --prod --yes

echo "✅ Done"
