# Claude Deployment Guide - Gemini Live Avatar
## Master Reference for All Deployments & Architecture

**Project:** Gemini Live Avatar - Voice-to-voice AI conversation with animated avatar
**Last Updated:** 2025-11-23 (Session 3 - System instruction restructuring & configuration cleanup)
**Status:** Production-ready, automatic deployments via Cloud Build

---

## 🚨 CRITICAL: FIREBASE_PROJECT_ID ENVIRONMENT VARIABLE

**⚠️ READ THIS BEFORE EVERY BACKEND DEPLOYMENT ⚠️**

### The #1 Recurring Deployment Failure

**PROBLEM:** After backend deployment succeeds, connections immediately fail with:
```
❌ Blocked connection from unauthorized origin: https://avatar-478217.web.app
   Allowed origins: (empty)
```

**ROOT CAUSE:** The `FIREBASE_PROJECT_ID` environment variable is missing from Cloud Run.

**WHY IT KEEPS HAPPENING:** Cloud Run does NOT automatically preserve environment variables between deployments. If not explicitly included in `--set-env-vars`, they are LOST.

### ✅ SOLUTION - Always Use This Deploy Command:

```bash
cd backend
gcloud run deploy gemini-avatar-backend \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars=BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --port=8080
```

**KEY:** `FIREBASE_PROJECT_ID=avatar-478217` MUST be in `--set-env-vars` EVERY TIME.

### After EVERY Deployment, Verify:

```bash
# Check environment variable exists
gcloud run services describe gemini-avatar-backend \
  --region us-central1 \
  --format="value(spec.template.spec.containers[0].env)" | grep FIREBASE

# Expected output: {'name': 'FIREBASE_PROJECT_ID', 'value': 'avatar-478217'}
```

### If Connection Fails After Deploy:

```bash
# Quick fix - add the missing variable
gcloud run services update gemini-avatar-backend \
  --region us-central1 \
  --set-env-vars FIREBASE_PROJECT_ID=avatar-478217

# This creates a new revision with the variable
# Takes ~30 seconds
```

### Why This Variable Matters:

The backend uses `FIREBASE_PROJECT_ID` to construct allowed origins:
- If set to `avatar-478217` → allows `https://avatar-478217.web.app`
- If missing → allowed origins list is empty → all connections blocked

**REMEMBER:** Check this EVERY deployment. This issue has occurred multiple times.

---

## Table of Contents
1. [Quick Reference](#quick-reference)
2. [Architecture Overview](#architecture-overview)
3. [GitHub Repository](#github-repository)
4. [Cloud Components Inventory](#cloud-components-inventory)
5. [Deployment Workflows](#deployment-workflows)
6. [How to Deploy Changes](#how-to-deploy-changes)
7. [Configuration Files](#configuration-files)
8. [Troubleshooting](#troubleshooting)

---

## Quick Reference

### **Project Identifiers**
- **GCP Project ID:** `avatar-478217`
- **GCP Project Number:** `580499038386`
- **GitHub Repo:** `https://github.com/kootru-repo/avatar-cloud`
- **Local Path:** `C:\Projects\gemini-livewire-avatar`

### **Live URLs**
- **Frontend (Firebase Hosting):** https://avatar-478217.web.app
- **Backend (Cloud Run):** https://gemini-avatar-backend-580499038386.us-central1.run.app
- **Backend WebSocket:** wss://gemini-avatar-backend-580499038386.us-central1.run.app

### **Quick Deploy Commands**
```bash
# Deploy backend (manual - from backend directory)
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1

# Deploy frontend (manual - from project root)
firebase deploy --only hosting

# View deployment status
gcloud run services describe gemini-avatar-backend --region=us-central1
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                         │
│                  https://avatar-478217.web.app               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├──── Static Files (HTML/JS/CSS)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   FIREBASE HOSTING                           │
│  - Serves frontend (index.html, app.js, frontend_config.json) │
│  - Global CDN distribution                                   │
│  - SSL/TLS automatic                                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├──── WebSocket Connection
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              CLOUD RUN (Backend)                             │
│  Service: gemini-avatar-backend                              │
│  URL: wss://gemini-avatar-backend-*.run.app                  │
│  - Python WebSocket server (main.py)                         │
│  - Handles Gemini API communication                          │
│  - Auto-scales 1-10 instances                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├──── API Calls
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              GEMINI API                                      │
│  Model: models/gemini-2.5-flash-native-audio-preview-09-2025│
│  - Voice-to-voice conversation                               │
│  - Native audio processing (AUDIO-only responses)            │
│  - Built-in output audio transcription for captions         │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              CLOUD STORAGE BUCKETS                           │
│  1. avatar-478217-videos/                                    │
│     - idle.webm, talking.webm, expressive.webm               │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              GITHUB REPOSITORY                               │
│  Repo: kootru-repo/avatar-cloud                              │
│  Branch: main                                                │
│  └── Push to main → Cloud Build → Deploy to Cloud Run       │
└──────────────────────────────────────────────────────────────┘
```

---

## GitHub Repository

### **Repository Details**
- **URL:** https://github.com/kootru-repo/avatar-cloud
- **Owner:** kootru-repo
- **Branch:** main
- **Local Clone:** `C:\Projects\gemini-livewire-avatar`

### **Repository Structure**
```
gemini-livewire-avatar/
├── frontend/                    # Frontend application
│   ├── index.html              # Main HTML (single page app)
│   ├── app.js                  # Main application logic
│   ├── audio-player.js         # Audio playback handling
│   ├── audio-recorder.js       # Microphone recording + barge-in
│   ├── frontend_config.json   # Frontend configuration
│   └── media/
│       ├── images/stage.png    # Background image
│       └── video/              # Avatar videos (local dev only)
│           ├── idle.webm
│           └── talking.webm
│
├── backend/                     # Backend application
│   ├── main.py                 # FastAPI + WebSocket server
│   ├── requirements.txt        # Python dependencies
│   ├── Dockerfile              # Container definition
│   ├── backend_config.json    # Backend configuration
│   ├── whinny_backstory.json  # Character persona and behavior rules
│   ├── set-list.json          # Performance song list with trivia details
│   ├── config/
│   │   ├── prompts.py         # System instruction builder (Google-compliant structure)
│   │   ├── gemini_config.py   # Live API configuration
│   │   └── environment.py     # Environment variable loader
│   └── core/
│       ├── websocket_handler.py # WebSocket message handling
│       ├── gemini_client.py     # Gemini API session management
│       ├── session.py           # Session state management
│       └── auth.py              # Firebase authentication
│
├── .env                        # Environment configuration (API keys, ports)
├── cloudbuild.yaml             # Cloud Build configuration
├── firebase.json               # Firebase Hosting config
├── .firebaserc                 # Firebase project config
├── DEPLOYMENT.md               # Full deployment guide
├── DEPLOY_NOW.md               # Quick start guide
└── CLAUDE_DEPLOYMENT_GUIDE.md  # This file
```

---

## Cloud Components Inventory

### **1. GCP Project: avatar-478217**
- **Project Number:** 580499038386
- **Region:** us-central1
- **Created:** 2025-11-14

### **2. Cloud Run Service**
**Name:** `gemini-avatar-backend`
- **URL:** https://gemini-avatar-backend-580499038386.us-central1.run.app
- **Region:** us-central1
- **Container:** `us-central1-docker.pkg.dev/avatar-478217/cloud-run-source-deploy/gemini-avatar-backend`
- **Service Account:** `580499038386-compute@developer.gserviceaccount.com`
- **Configuration:**
  - Memory: 512Mi
  - CPU: 1
  - Min Instances: 1 (keeps warm)
  - Max Instances: 10
  - Timeout: 300s
  - Authentication: Unauthenticated (public)
- **Environment Variables:**
  - `BACKEND_HOST=0.0.0.0`
  - `BACKEND_PORT=8080`
  - `DEBUG=false`
  - `REQUIRE_AUTH=false`
  - `FIREBASE_PROJECT_ID=avatar-478217` **⚠️ CRITICAL - Must be in every deploy!**
- **Secrets Mounted:**
  - `GEMINI_API_KEY` (Secret Manager)

**⚠️ DEPLOYMENT WARNING:** The `FIREBASE_PROJECT_ID` environment variable is frequently lost during deployments. ALWAYS verify it's present after deploying. See the warning at the top of this document.

### **3. Firebase Hosting**
**Site:** `avatar-478217`
- **URL:** https://avatar-478217.web.app
- **Public Directory:** `frontend/`
- **Single Page App:** Yes (rewrites all to index.html)
- **Firebase App:**
  - App ID: `1:580499038386:web:303450a3e1a2da9289a9ab`
  - App Name: Avatar Cloud
  - Platform: Web

### **4. Cloud Storage Buckets**

#### **a) avatar-478217-videos** (Public CDN)
- **Purpose:** Avatar animation videos
- **Access:** Public read (allUsers:objectViewer)
- **Contents:**
  - `video/idle.webm`
  - `video/talking.webm`
  - `video/expressive.webm`
- **CDN URL:** https://storage.googleapis.com/avatar-478217-videos/video/

#### **b) run-sources-avatar-478217-us-central1** (Auto-managed)
- **Purpose:** Cloud Run source deployment artifacts
- **Managed By:** Google Cloud Run (don't modify)

### **5. Service Accounts**

#### **a) 580499038386-compute@developer.gserviceaccount.com**
- **Type:** Compute Engine default service account
- **Used By:** Cloud Run backend
- **Permissions:**
  - Read GEMINI_API_KEY from Secret Manager
  - Write logs to Cloud Logging

#### **b) gemini-live-app@avatar-478217.iam.gserviceaccount.com**
- **Type:** Custom service account
- **Status:** Active but unused

#### **c) firebase-adminsdk-fbsvc@avatar-478217.iam.gserviceaccount.com**
- **Type:** Firebase Admin SDK
- **Used By:** Firebase services

### **6. Secret Manager**
**GEMINI_API_KEY**
- **Created:** 2025-11-20
- **Replication:** Automatic (multi-region)
- **Accessed By:** Cloud Run service
- **Contains:** Gemini API key for generativelanguage.googleapis.com

### **7. Artifact Registry**
**Repository:** `cloud-run-source-deploy`
- **Format:** Docker
- **Location:** us-central1
- **Purpose:** Stores Cloud Run container images
- **Managed By:** Cloud Run (auto-updated on deploy)

### **8. Cloud Build (CI/CD)**
**Status:** ✅ ACTIVE - Auto-deployment configured and working for BACKEND ONLY
- **Trigger Name:** `avatar-backend-trigger`
- **Trigger Source:** kootru-repo/avatar-cloud (main branch)
- **Build Config:** `cloudbuild.yaml`
- **Service Account:** `580499038386-compute@developer.gserviceaccount.com`
- **Machine Type:** E2_HIGHCPU_8
- **Deployment Method:**
  - **Backend:** Automatic on push to main branch (via Cloud Build)
  - **Frontend:** Manual `firebase deploy --only hosting` required
- **Build Time:** 3-5 minutes
- **Includes:** All environment variables (FIREBASE_PROJECT_ID) and secrets (GEMINI_API_KEY)
- **Monitoring:** https://console.cloud.google.com/cloud-build/builds?project=avatar-478217

**How It Works:**
1. Push code to `main` branch
2. GitHub webhook triggers Cloud Build
3. Cloud Build runs `cloudbuild.yaml`:
   - Builds Docker image from `backend/Dockerfile`
   - Pushes to Container Registry (gcr.io/avatar-478217/gemini-avatar-backend)
   - Deploys to Cloud Run with all env vars and secrets
4. New revision goes live automatically

**Service Account Permissions:**
- `roles/editor` - Full Cloud Run deployment
- `roles/secretmanager.secretAccessor` - Read GEMINI_API_KEY
- `roles/iam.serviceAccountUser` - Act as Compute Engine SA

---

## Deployment Workflows

### **Workflow 1: Backend Manual Deployment (MANUAL)**

**Trigger:** Manual command after modifying `backend/` files

```
Developer modifies backend files
        ↓
Developer commits to git (for version control)
        ↓
Developer runs: cd backend && gcloud run deploy gemini-avatar-backend --source .
        ↓
Cloud Run builds Docker image (backend/Dockerfile)
        ↓
Deploys to Cloud Run (gemini-avatar-backend)
        ↓
Routes 100% traffic to new revision
        ↓
✅ Backend live at: https://gemini-avatar-backend-580499038386.us-central1.run.app
```

**Time:** 3-5 minutes
**Manual Intervention Required**

**To deploy:**
```bash
# Modify backend code
vim backend/core/transcription.py

# Commit to git (for version control)
git add backend/
git commit -m "Fix transcription bug"
git push origin main

# Deploy to Cloud Run
cd backend
gcloud run deploy gemini-avatar-backend \
  --source . \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=10 \
  --timeout=300 \
  --memory=512Mi \
  --cpu=1 \
  --set-env-vars=BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --port=8080
```

### **Workflow 2: Frontend Manual Deployment (MANUAL)**

**Trigger:** Manual command after modifying `frontend/` files

```
Developer modifies frontend files
        ↓
Developer runs: firebase deploy --only hosting
        ↓
Firebase CLI uploads files to Firebase Hosting
        ↓
Files distributed to global CDN
        ↓
✅ Frontend live at: https://avatar-478217.web.app
```

**Time:** 30-60 seconds
**Manual Intervention Required**

**To deploy:**
```bash
# Modify frontend code
vim frontend/index.html

# Commit to git (for version control)
git add frontend/
git commit -m "Update UI styling"
git push origin main

# Deploy to Firebase
firebase deploy --only hosting

# Verify
curl -I https://avatar-478217.web.app
```

---

## How to Deploy Changes

### **Scenario 1: Backend Bug Fix (e.g., Fix WebSocket message handling)**

```bash
# 1. Make changes locally
cd C:\Projects\gemini-livewire-avatar
vim backend/core/websocket_handler.py

# 2. Test locally (optional)
cd backend
python main.py

# 3. Commit to git (for version control)
git add backend/core/websocket_handler.py
git commit -m "Fix WebSocket message handling"
git push origin main

# 4. Deploy to Cloud Run
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1

# 5. Verify deployment
gcloud run services describe gemini-avatar-backend --region=us-central1
curl https://gemini-avatar-backend-580499038386.us-central1.run.app/health

# 6. Test in browser
# Visit https://avatar-478217.web.app and start conversation
```

**Expected Time:** 3-5 minutes for Cloud Build → Cloud Run deployment

---

### **Scenario 2: Frontend UI Update (e.g., Move CC window)**

```bash
# 1. Make changes locally
cd C:\Projects\gemini-livewire-avatar
vim frontend/index.html

# 2. Test locally
cd frontend
python -m http.server 8000
# Visit http://localhost:8000

# 3. Commit to git
git add frontend/index.html
git commit -m "Move CC window below Send button"
git push origin main

# 4. Deploy to Firebase (MANUAL STEP - not automatic!)
firebase deploy --only hosting

# 5. Verify deployment
curl -I https://avatar-478217.web.app
# Check Last-Modified header

# 6. Test in browser
# Visit https://avatar-478217.web.app
# Hard refresh: Ctrl+Shift+R
```

**Expected Time:** 30-60 seconds for Firebase Hosting upload

---

### **Scenario 3: Both Frontend & Backend Changes**

```bash
# 1. Make changes to both
vim backend/core/websocket_handler.py
vim frontend/app.js

# 2. Commit everything
git add backend/ frontend/
git commit -m "Add new feature: XYZ"
git push origin main

# 3. Deploy backend manually
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1

# 4. Deploy frontend manually
firebase deploy --only hosting

# 5. Verify both
curl https://gemini-avatar-backend-580499038386.us-central1.run.app/health
curl -I https://avatar-478217.web.app

# 6. Test end-to-end
# Visit https://avatar-478217.web.app
```

---

### **Scenario 4: Update Cloud Storage Videos**

```bash
# Upload new videos to bucket
gcloud storage cp frontend/media/video/new-animation.webm \
  gs://avatar-478217-videos/video/

# Verify upload
gcloud storage ls gs://avatar-478217-videos/video/

# Update frontend config
vim frontend/frontend_config.json
# Add "new-animation": "https://storage.googleapis.com/avatar-478217-videos/video/new-animation.webm"

# Deploy frontend
firebase deploy --only hosting
```

---

### **Scenario 5: Update Secrets (e.g., New Gemini API Key)**

```bash
# Add new secret version
echo -n "NEW_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY \
  --data-file=- \
  --project=avatar-478217

# Cloud Run automatically uses latest version
# Force new deployment to pick up secret immediately:
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --update-env-vars=FORCE_UPDATE=$(date +%s)

# Verify
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(status.latestCreatedRevisionName)'
```

---

## Configuration Files

### **1. frontend/frontend_config.json**
**Purpose:** Frontend application configuration
**Location:** `frontend/frontend_config.json`
**Deployed To:** Firebase Hosting
**Updated By:** Manual edit + `firebase deploy --only hosting`

**Key Settings:**
```json
{
  "api": {
    "projectId": "avatar-478217",
    "model": "models/gemini-2.5-flash-native-audio-preview-09-2025"
  },
  "backend": {
    "wsUrl": {
      "local": "ws://localhost:8080",
      "cloud": "wss://gemini-avatar-backend-580499038386.us-central1.run.app"
    }
  },
  "firebase": {
    "projectId": "avatar-478217",
    "appId": "1:580499038386:web:303450a3e1a2da9289a9ab",
    "apiKey": "AIzaSyCs3DfEW-CIrv9HUZJwPExTVHFNuRuYor4",
    "authDomain": "avatar-478217.firebaseapp.com",
    "enabled": false
  },
  "cloud": {
    "videosBucket": "avatar-478217-videos",
    "videosBasePath": "https://storage.googleapis.com/avatar-478217-videos/video"
  }
}
```

**When to Update:**
- Backend URL changes
- Video bucket changes
- Firebase config changes
- Feature flags changes

---

### **2. backend/backend_config.json**
**Purpose:** Backend application configuration
**Location:** `backend/backend_config.json`
**Deployed To:** Cloud Run (via Cloud Build)
**Updated By:** Git commit + push (auto-deploys)

**Key Settings:**
```json
{
  "api": {
    "model": "models/gemini-2.5-flash-native-audio-preview-09-2025"
  },
  "geminiVoice": {
    "enabled": true,
    "voiceName": "Algenib",
    "affectiveDialog": true
  },
  "geminiVAD": {
    "startSensitivity": "START_SENSITIVITY_HIGH",
    "endSensitivity": "END_SENSITIVITY_HIGH",
    "prefixPaddingMs": 100,
    "silenceDurationMs": 200
  },
  "audio": {
    "outputSampleRate": 24000,
    "inputSampleRate": 16000,
    "responseModalities": ["AUDIO"]
  },
  "initialContext": {
    "enabled": true,
    "includeBackstory": false,
    "includeSetList": true,
    "_comment": "Optional: Send backstory/setlist as first message. Backstory disabled since system_instruction already includes persona. SetList enabled to provide detailed song trivia."
  }
}
```

**When to Update:**
- Gemini model version changes
- Voice/VAD settings tuning
- Audio configuration changes
- Initial context loading preferences (backstory vs setlist)

---

### **3. cloudbuild.yaml**
**Purpose:** Cloud Build CI/CD configuration
**Location:** `cloudbuild.yaml` (project root)
**Used By:** Cloud Build (automatic trigger)
**Updated By:** Git commit + push (updates build process)

**Current Configuration:**
- Builds Docker image from `backend/Dockerfile`
- Pushes to Artifact Registry
- Deploys to Cloud Run with:
  - 512Mi memory
  - 1 CPU
  - Min 1, Max 10 instances
  - Timeout 300s
  - Env vars: BACKEND_HOST, BACKEND_PORT, DEBUG, REQUIRE_AUTH
  - Secrets: GEMINI_API_KEY, FIREBASE_PROJECT_ID

**When to Update:**
- Change Cloud Run resource limits
- Add new secrets
- Modify build steps
- Change deployment strategy

---

### **4. firebase.json**
**Purpose:** Firebase Hosting configuration
**Location:** `firebase.json` (project root)
**Used By:** Firebase CLI
**Updated By:** Manual edit (rarely needs changes)

**Current Configuration:**
```json
{
  "hosting": {
    "public": "frontend",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{"source": "**", "destination": "/index.html"}]
  }
}
```

---

### **5. .firebaserc**
**Purpose:** Firebase project binding
**Location:** `.firebaserc` (project root)
**Used By:** Firebase CLI
**Content:**
```json
{
  "projects": {
    "default": "avatar-478217"
  }
}
```

---

## Troubleshooting

### **Setting Up Auto-Deployment (Optional)**

**Current Status:** Deployments are currently manual. Auto-deployment can be configured if desired.

**To enable auto-deployment on git push:**
```bash
# 1. Create Cloud Build trigger
gcloud builds triggers create github \
  --repo-name=avatar-cloud \
  --repo-owner=kootru-repo \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml \
  --project=avatar-478217

# 2. Verify trigger created
gcloud builds triggers list --project=avatar-478217

# 3. Connect GitHub repository (if not already connected)
# Visit: https://console.cloud.google.com/cloud-build/triggers
# Click "Connect Repository" and follow GitHub OAuth flow

# 4. Test by pushing to main
git commit --allow-empty -m "Test auto-deploy"
git push origin main

# 5. Monitor build
gcloud builds list --limit=1
```

**Note:** Currently all deployments are done manually with `gcloud run deploy`

---

### **Frontend Not Updating After Deploy**

**Problem:** Deployed to Firebase but changes not visible

**Check:**
```bash
# 1. Verify deployment succeeded
firebase deploy --only hosting

# 2. Check Firebase Hosting status
firebase hosting:sites:list

# 3. Check browser cache
# Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

**Fix:**
```bash
# Clear Firebase Hosting cache
firebase hosting:channel:delete live
firebase deploy --only hosting

# Or add cache-busting version to config:
vim frontend/index.html
# Add ?v=TIMESTAMP to script/css includes
```

---

### **WebSocket Connection Fails**

**Problem:** Frontend can't connect to backend WebSocket

**Check:**
```bash
# 1. Verify backend is running
curl https://gemini-avatar-backend-580499038386.us-central1.run.app/health

# 2. Check WebSocket URL in frontend config
cat frontend/frontend_config.json | grep wsUrl

# 3. Check Cloud Run service URL
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(status.url)'

# 4. Check CORS/allowed origins
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(spec.template.spec.containers[0].env)'
```

**Fix:**
```bash
# Update frontend config with correct backend URL
vim frontend/frontend_config.json
# Set: "cloud": "wss://CORRECT-BACKEND-URL.run.app"

# Deploy frontend
firebase deploy --only hosting

# Update backend allowed origins if needed
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --set-env-vars=ALLOWED_ORIGINS="https://avatar-478217.web.app"
```

---

### **Captions Not Appearing**

**Problem:** Closed captions not showing Gemini's responses

**Check:**
```bash
# 1. Check if output_audio_transcription is enabled in backend config
grep -n "output_audio_transcription" backend/config/gemini_config.py

# 2. Check if captions are enabled in backend backend_config.json
grep -n "captions" backend/backend_config.json

# 3. Check Cloud Run logs for transcription messages
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" \
  --limit=50 \
  --format=json | jq -r '.[] | select(.textPayload | contains("Transcription"))'
```

**Common Issues:**
- **Captions disabled:** Check `backend/backend_config.json` → `captions.enabled` should be `true`
- **Frontend not processing:** Check browser console for `transcription_interim` and `transcription` messages
- **CC toggle off:** Check if CC toggle is activated in frontend UI

**Fix:**
```bash
# Verify captions are enabled in backend config
vim backend/backend_config.json
# Ensure: "captions": { "enabled": true }

# Deploy changes
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1
```

---

### **Cloud Run Out of Memory**

**Problem:** Backend crashing with OOM errors

**Check:**
```bash
# Check current memory limit
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(spec.template.spec.containers[0].resources.limits.memory)'

# Check logs for OOM
gcloud logging read "resource.type=cloud_run_revision AND jsonPayload.message=~\"memory\"" \
  --limit=20
```

**Fix:**
```bash
# Increase memory limit
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --memory=1Gi

# Or update cloudbuild.yaml for permanent change
vim cloudbuild.yaml
# Change: --memory=1Gi
git add cloudbuild.yaml
git commit -m "Increase Cloud Run memory to 1GB"
git push origin main
```

---

## Emergency Procedures

### **Rollback Backend Deployment**

```bash
# 1. List recent revisions
gcloud run revisions list \
  --service=gemini-avatar-backend \
  --region=us-central1 \
  --limit=5

# 2. Route traffic to previous revision
gcloud run services update-traffic gemini-avatar-backend \
  --region=us-central1 \
  --to-revisions=PREVIOUS-REVISION-NAME=100

# 3. Verify rollback
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(status.traffic)'
```

---

### **Rollback Frontend Deployment**

```bash
# Firebase Hosting doesn't have built-in rollback
# Option 1: Redeploy previous version from git
git checkout PREVIOUS-COMMIT frontend/
firebase deploy --only hosting
git checkout main frontend/

# Option 2: Deploy from specific git commit
git checkout PREVIOUS-COMMIT
firebase deploy --only hosting
git checkout main
```

---

### **Emergency Shutdown**

```bash
# Stop accepting new requests (set to 0 instances)
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --min-instances=0 \
  --max-instances=0

# Take down Firebase Hosting (extreme measure)
# Note: This will make frontend inaccessible
# firebase hosting:disable
```

---

## Quick Command Reference

### **Deployment**
```bash
# Backend (manual)
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1

# Frontend (manual)
firebase deploy --only hosting

# Both (both require manual steps)
cd backend && gcloud run deploy gemini-avatar-backend --source . --region=us-central1
cd .. && firebase deploy --only hosting
```

### **Monitoring**
```bash
# Backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" --limit=50

# Service status
gcloud run services describe gemini-avatar-backend --region=us-central1

# List recent revisions
gcloud run revisions list --service=gemini-avatar-backend --region=us-central1
```

### **Configuration**
```bash
# View backend env vars
gcloud run services describe gemini-avatar-backend \
  --region=us-central1 \
  --format='value(spec.template.spec.containers[0].env)'

# Update env var
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --set-env-vars=KEY=VALUE

# View secrets
gcloud secrets list
gcloud secrets versions access latest --secret=GEMINI_API_KEY
```

---

## File Change → Deployment Decision Tree

```
File Modified?
│
├── backend/* → Git commit + MANUAL: cd backend && gcloud run deploy (3-5 min)
│
├── frontend/* → Git commit + MANUAL: firebase deploy --only hosting (30-60 sec)
│
├── cloudbuild.yaml → Git commit (AUTO-DEPLOYS backend via Cloud Build trigger)
│
├── firebase.json → MANUAL: firebase deploy (affects hosting config)
│
└── Other files → Git commit (version control only, no deployment)
```

---

## Recent Changes & Session History

### **Session 3: System Instruction Restructuring & Configuration Optimization (2025-11-23)**

#### **1. System Instruction Restructuring (Google Best Practices)**

**Problem:** System instructions didn't follow Google's official recommended structure for Live API.

**Solution:** Complete rewrite of `backend/config/prompts.py::create_persona_instructions()` to follow Google's 5-part structure:

1. **Agent Persona** - Character identity, personality, world details
2. **Conversational Flow** - One-time setup + ongoing conversation loop
3. **Tool Specifications** - When/how to use function calling (dance, goodbye modes)
4. **Guardrails** - Explicit examples with ❌ DON'T patterns and deflection responses
5. **Detailed Behavioral Traits** - Fine-tuned personality characteristics

**Reference:** https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/best-practices

**Key Improvements:**
- Tool invocation rules now in system_instruction (not just backstory JSON)
- Explicit numbered steps for conversational flow
- Guardrails with example user questions and expected deflection responses
- Clear separation of concerns matching Google's pattern

**Files Changed:**
- `backend/config/prompts.py` - Complete restructure (lines 40-206)

---

#### **2. Context Loading Optimization (Eliminated Redundancy)**

**Problem:** Persona sent TWICE - once in system_instruction, once as first message (redundant)

**Solution:** Renamed and restructured context configuration:

**Before:**
```json
{
  "kvCache": {
    "enabled": true,
    "preloadBackstory": true,  // Redundant!
    "preloadSetList": true
  }
}
```

**After:**
```json
{
  "initialContext": {
    "enabled": true,
    "includeBackstory": false,  // Disabled (already in system_instruction)
    "includeSetList": true,      // Enabled (provides song trivia details)
    "_comment": "Live API does NOT support context caching"
  }
}
```

**Rationale:**
- Google Live API does NOT support context caching (per official docs)
- System instruction is the recommended place for persona (Google best practice)
- Set list provides detailed song information NOT in system instruction (no redundancy)
- Backstory disabled to eliminate duplicate persona loading

**Files Changed:**
- `backend/backend_config.json` - Renamed kvCache → initialContext
- `backend/config/prompts.py` - Renamed functions and added clarifying comments
- `backend/core/websocket_handler.py` - Updated import and usage

---

#### **3. Environment Configuration Cleanup**

**Problem:** `.env` file contained many unused variables from Vertex AI mode

**Before (71 lines):**
- Vertex AI variables (PROJECT_ID, REGION, SERVICE_ACCOUNT_KEY_PATH)
- MODEL variable (overridden by config JSON)
- VOICE variable (ignored, loaded from config)
- FRONTEND_PORT (unused)
- AVATAR_BUCKET_NAME (unused)

**After (29 lines - 59% reduction):**
```bash
# REQUIRED
GEMINI_API_KEY=...

# OPTIONAL (has defaults)
BACKEND_PORT=8080
BACKEND_HOST=0.0.0.0
DEBUG=false

# IMPORTANT (for production CORS)
FIREBASE_PROJECT_ID=avatar-478217
ALLOWED_ORIGINS=...
ALLOW_NO_ORIGIN=true
```

**Result:** Clean, focused `.env` with only actively-used variables

**Files Changed:**
- `.env` - Removed all unused Vertex AI and legacy variables

---

#### **4. Configuration File Documentation**

**Added Documentation For:**
1. **set-list.json** - Performance song list with artist, year, album details (40+ songs)
2. **whinny_backstory.json** - Character persona, personality influences, reaction rules
3. **initialContext configuration** - When to enable backstory vs setlist loading
4. **System instruction structure** - How persona is built from backstory JSON

**Key Points:**
- Set list provides music trivia capability (artists, years, albums, band members)
- Backstory defines character personality and behavioral rules
- Initial context message now optional and non-redundant
- System instruction follows Google's recommended ordering

---

#### **5. Model Name Clarification**

**Correct Model Name Format:**
```
models/gemini-2.5-flash-native-audio-preview-09-2025
```

**Critical:** The `models/` prefix is REQUIRED for Google AI Developer API (per official SDK)

**Where Used:**
- `frontend/frontend_config.json` → `api.model`
- `backend/backend_config.json` → `api.model`
- `backend/core/gemini_client.py` → Model initialization

**Note:** Environment variable MODEL is overridden by config files (by design)

---

#### **6. Function Calling: Goodbye Mode**

**Added Documentation:** Goodbye mode parallels dance mode pattern

**Function:** `trigger_goodbye_mode()`
- **Triggers:** "goodbye", "bye", "see you later", "farewell", "I'm leaving"
- **Action:** Plays farewell animation (see-ya.webm, 5.084s)
- **Voice:** Gemini says exactly "See you later!" while calling function
- **Media:** `frontend/media/video/see-ya.webm`

**Implementation Files:**
- `backend/config/gemini_config.py` - Function definition (lines 107-114)
- `backend/whinny_backstory.json` - Trigger rules (lines 75-79)
- `backend/core/websocket_handler.py` - Same tool handler as dance mode
- `frontend/app.js` - Goodbye mode handler
- `frontend/frontend_config.json` - Goodbye mode configuration

---

#### **Summary of Changes**

| Change | Impact | Reason |
|--------|--------|--------|
| System instruction restructure | High | Follows Google best practices |
| Renamed kvCache → initialContext | Medium | Eliminates confusion (no caching on Live API) |
| Disabled backstory in context | High | Eliminates redundancy with system_instruction |
| Enabled setlist in context | High | Provides song trivia without redundancy |
| Cleaned .env file | Medium | Removes unused variables |
| Fixed model name format | Low | Clarifies correct `models/` prefix usage |
| Documented goodbye mode | Medium | Complete function calling documentation |

---

### **Session 2: Gemini 2.5 Native Audio Setup & UI Improvements (2025-11-20)**

#### **1. Gemini 2.5 Native Audio Implementation**

**Architecture:**
- **Model:** `models/gemini-2.5-flash-native-audio-preview-09-2025`
- **Response Modality:** AUDIO only (native audio generation)
- **Captions:** Gemini's built-in `output_audio_transcription` feature
- **No external STT:** System does not use Google Cloud Speech-to-Text API or Whisper

**Key Features:**
- Voice-to-voice conversation with zero transcription lag
- Native audio processing (no text-to-speech pipeline)
- Built-in caption generation from Gemini's `output_transcription` field
- Affective dialog support (adapts tone/expression)

**Configuration:**
```json
// frontend/frontend_config.json & backend/backend_config.json
{
  "audio": {
    "responseModalities": ["AUDIO"]  // AUDIO-only, no TEXT
  },
  "captions": {
    "enabled": true  // Uses Gemini's output_audio_transcription
  }
}
```

**Backend Implementation:**
- `backend/core/websocket_handler.py` processes `output_transcription` from Gemini
- Sends `transcription_interim` (chunks) and `transcription` (complete) to frontend
- No separate STT API calls required

---

#### **2. Fixed Origin Authentication Issue**

**Problem:** Backend immediately disconnecting after connection

**Root Cause:** `REQUIRE_AUTH=true` but no `FIREBASE_PROJECT_ID` configured

**Solution:** Added environment variable:
```bash
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --set-env-vars=FIREBASE_PROJECT_ID=avatar-478217
```

**Result:** Backend now auto-constructs allowed origins from Firebase project ID, allowing connections from `https://avatar-478217.web.app`

---

#### **3. UI Changes: Mixer Toggle Switch**

**Original:** Two separate buttons (REC, STOP)

**User Request:** "change the rec/stop buttons into a single mixer board toggle switch"

**Solution:** Created professional vertical toggle switch (120px tall)
- 3D metallic track with chrome finish
- Sliding handle (moves up/down)
- Dual LED indicators (red on top when active, green on bottom when inactive)
- Smooth animations with cubic-bezier easing

**Second Request:** "disable the push aspect of the rec button. it should only slide to be on or off. remove 'stop' text."

**Final Implementation:**
- Removed push/scale effects
- Removed "STOP" label
- Centered "REC / LIVE" label
- Toggle slides smoothly between positions

**Files Changed:**
- `frontend/index.html` - New toggle HTML/CSS (lines 424-557)
- `frontend/app.js` - Updated event listeners and state management

**Deployment:**
```bash
firebase deploy --only hosting
```

---

#### **5. UI Changes: Hidden Logging Window**

**User Request:** "disable the logging window UI and frame so that only the background remains"

**Solution:** Added `display: none` to `.log-module` CSS class (line 237)

**Result:** Log window completely hidden, cleaner visual interface

**Files Changed:**
- `frontend/index.html` - CSS update

**Deployment:**
```bash
firebase deploy --only hosting
```

---

### **Session 1: Initial Setup & Deployment (2025-11-14 to 2025-11-19)**

- Set up GCP project (`avatar-478217`)
- Deployed backend to Cloud Run
- Deployed frontend to Firebase Hosting
- Configured Gemini 2.5 Flash Native Audio model
- Set up Cloud Storage buckets for avatar videos
- Created initial deployment documentation

---

## Summary

**What Claude Needs to Know:**

1. **Backend changes** (Python code in `backend/`) have TWO options:
   - **Automatic:** Git commit + push to main → Cloud Build auto-deploys (3-5 min)
   - **Manual:** `cd backend && gcloud run deploy gemini-avatar-backend --source . --region=us-central1`
2. **Frontend changes** (HTML/JS in `frontend/`) require manual `firebase deploy --only hosting`
3. **Always commit to git first** for version control
4. **Backend URL:** https://gemini-avatar-backend-580499038386.us-central1.run.app
5. **Frontend URL:** https://avatar-478217.web.app
6. **Project ID:** avatar-478217
7. **GitHub Repo:** https://github.com/kootru-repo/avatar-cloud
8. **Auto-deployment:** ✅ ACTIVE for backend via Cloud Build trigger (frontend requires manual deploy)
9. **Audio Model:** `models/gemini-2.5-flash-native-audio-preview-09-2025` (AUDIO-only responses, built-in caption transcription)
10. **Required Environment Variables:** `BACKEND_HOST`, `BACKEND_PORT`, `DEBUG`, `REQUIRE_AUTH`, `FIREBASE_PROJECT_ID`
11. **Captions:** Gemini's native `output_audio_transcription` feature (no external STT required)
12. **System Instructions:** Follows Google's 5-part Live API structure (Persona → Flow → Tools → Guardrails → Details)
13. **Context Loading:** `initialContext` with setlist enabled, backstory disabled (no redundancy with system_instruction)
14. **Configuration Files:** `backend_config.json` (backend), `frontend_config.json` (frontend), `.env` (environment), `whinny_backstory.json` (persona), `set-list.json` (song trivia)

**Deployment Workflow:**
```bash
# For backend changes (AUTOMATIC via Cloud Build):
git add backend/
git commit -m "Fix: description"
git push origin main
# Cloud Build automatically deploys to Cloud Run (3-5 minutes)
# Monitor: https://console.cloud.google.com/cloud-build/builds?project=avatar-478217

# For backend changes (MANUAL - if Cloud Build unavailable):
cd backend
gcloud run deploy gemini-avatar-backend --source . --region us-central1 \
  --allow-unauthenticated --min-instances 1 --max-instances 10 --timeout 300 \
  --memory 512Mi --cpu 1 \
  --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 \
  --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest \
  --port 8080
# Takes 3-5 minutes

# For frontend changes (ALWAYS MANUAL):
git add frontend/
git commit -m "Fix: description"
git push origin main
firebase deploy --only hosting
# Takes 30-60 seconds

# For both (backend auto-deploys, frontend manual):
git add .
git commit -m "Fix: description"
git push origin main
# Backend deploys automatically via Cloud Build
firebase deploy --only hosting
# Frontend requires manual deploy
```

---

## Function Calling Features: Dance Mode Case Study

### Overview

Dance mode demonstrates the complete implementation of an interactive feature using Gemini's Function Calling API. This serves as a template for adding similar capabilities like applause effects, lighting changes, or other triggered animations.

### Architecture Pattern

**Flow:** User Voice → Gemini Function Call → Backend Processing → Frontend Execution

```
┌─────────────────────────────────────────────────────────────┐
│  USER: "Let's dance!"                                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ (Audio input via WebSocket)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  GEMINI 2.5 FLASH LIVE                                       │
│  - Processes audio input                                     │
│  - Recognizes "dance" trigger                                │
│  - Calls trigger_dance_mode() function                       │
│  - CONTINUES speaking enthusiastically                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ (tool_call message)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (websocket_handler.py)                              │
│  - Receives tool_call from Gemini                            │
│  - Debounces duplicates (2s cooldown)                        │
│  - Forwards to frontend via WebSocket                        │
│  - Sends tool_response back to Gemini                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ (tool_call WebSocket message)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (app.js)                                           │
│  - Receives tool_call message                                │
│  - Switches to dance video                                   │
│  - Plays music at 30% volume                                 │
│  - Keeps recording active (user can interrupt)               │
│  - Auto-stops after 10.084 seconds                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Files Modified

#### Backend Changes
1. **`backend/config/gemini_config.py`** - Function definition
2. **`backend/whinny_backstory.json`** - Trigger rules
3. **`backend/core/websocket_handler.py`** - Tool call processing
4. **`backend/core/session.py`** - Debouncing state

#### Frontend Changes
1. **`frontend/app.js`** - Tool handler & dance logic
2. **`frontend/frontend_config.json`** - Dance mode configuration
3. **`frontend/index.html`** - Cache version update

#### Media Files
1. **`frontend/media/video/dance.webm`** - Dance animation (10.084s)
2. **`frontend/media/music/dance.mp3`** - Background music (10.084s with 1s fade)

### Implementation Checklist

**Phase 1: Backend Function Definition**
- [ ] Add function to `config["tools"]` in gemini_config.py
- [ ] Define clear description (include concurrency requirements)
- [ ] Add trigger rule to whinny_backstory.json
- [ ] Use "MUST" language for critical behaviors

**Phase 2: Backend Handler**
- [ ] Process `tool_call.function_calls` array (plural!)
- [ ] Implement 2-second debouncing
- [ ] Forward to frontend with error handling
- [ ] Send `tool_response` back to Gemini (critical!)
- [ ] Add comprehensive logging with IDs

**Phase 3: Frontend Handler**
- [ ] Add case to tool_call message handler
- [ ] Validate configuration exists
- [ ] Implement main feature logic
- [ ] Handle errors gracefully
- [ ] Provide user feedback

**Phase 4: Media Preparation**
- [ ] Measure video duration with ffprobe
- [ ] Edit audio to match with fade out
- [ ] Verify synchronized durations
- [ ] Upload to Cloud Storage
- [ ] Configure public access

**Phase 5: Configuration**
- [ ] Add feature config to frontend/frontend_config.json
- [ ] Set appropriate volume (0.3 for background)
- [ ] Configure duration in milliseconds
- [ ] Add environment-aware paths (local/cloud)

**Phase 6: Deployment**
- [ ] Update cache version in index.html
- [ ] Deploy backend to Cloud Run
- [ ] Deploy frontend to Firebase Hosting
- [ ] Test end-to-end functionality

### Critical Lessons Learned

#### Issue: SDK Attribute Error
**Problem:** `'LiveServerToolCall' object has no attribute 'function_call'`
**Solution:** SDK uses `function_calls` (plural array), not `function_call` (singular)

#### Issue: Gemini Goes Silent
**Problem:** Gemini stops talking when function is called
**Solution:** Explicitly instruct in function description: "You MUST continue speaking while calling this function"

#### Issue: Dual Triggering
**Problem:** Both client-side keyword detection and server-side function calling triggered simultaneously
**Solution:** Remove ALL client-side keyword detection, rely only on Gemini's function calling

#### Issue: User Can't Interrupt
**Problem:** Recording stopped during dance
**Solution:** Keep barge-in monitoring active throughout dance

#### Issue: Audio/Video Desync
**Problem:** Music played longer than video, causing awkward ending
**Solution:** Use ffmpeg to cut audio to exact video duration with 1s fade out

#### Issue: Dance Music Too Loud
**Problem:** User couldn't hear Gemini speaking during dance
**Solution:** Set volume to 0.3 (30%) and make it configurable

### Audio Editing Commands

**Measure Duration:**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 file.webm
```

**Cut & Fade Audio:**
```bash
# Cut to 10.084s with 1s fade out starting at 9.084s
ffmpeg -i input.mp3 -t 10.084 -af "afade=t=out:st=9.084:d=1" -y output.mp3
```

**Verify Result:**
```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 output.mp3
```

### Cloud Storage Upload

```bash
# Upload media
gcloud storage cp file.mp3 gs://avatar-478217-videos/music/file.mp3
gcloud storage cp file.webm gs://avatar-478217-videos/video/file.webm

# Make public
gcloud storage buckets add-iam-policy-binding gs://avatar-478217-videos \
  --member=allUsers \
  --role=roles/storage.objectViewer

# Verify
gcloud storage ls -L gs://avatar-478217-videos/music/file.mp3
```

### Testing Protocol

1. **Basic Trigger:** Say "dance" → Verify function called
2. **Concurrent Audio:** Verify Gemini continues speaking
3. **User Interrupt:** Speak during dance → Verify barge-in works
4. **Duration:** Verify dance ends exactly at 10.084s
5. **Debouncing:** Say "dance dance dance" → Verify only one triggers
6. **Error Recovery:** Block music URL → Verify graceful failure
7. **Volume:** Verify music at 30% doesn't overpower Gemini
8. **State Cleanup:** Verify returns to listening state correctly

### Performance Metrics

- **Backend processing:** <10ms (tool forwarding)
- **Frontend trigger:** <50ms (dance mode activation)
- **Music load time:** <500ms (preloaded) or <2s (on-demand)
- **Total latency:** <200ms from Gemini call to visual start

### Future Enhancement Ideas

Using this pattern, you can implement:
- **Applause Mode:** Play crowd applause + spotlight effect
- **Lightning Effects:** Flash screen with thunder sound
- **Confetti Mode:** Particle animation with celebration music
- **Encore Mode:** Extended performance with multiple songs
- **Fade to Black:** Screen fade with dramatic music

Each follows the same pattern: Function definition → Backend handler → Frontend execution → Media synchronization.

---

**End of Claude Deployment Guide**
**Questions? Check DEPLOYMENT.md or DEPLOY_NOW.md for detailed steps**
