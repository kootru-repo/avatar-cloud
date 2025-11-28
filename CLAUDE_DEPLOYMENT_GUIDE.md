# Claude Deployment Guide - Gemini Live Avatar
## Master Reference for All Deployments & Architecture

**Project:** Gemini Live Avatar - Voice-to-voice AI conversation with animated avatar
**Last Updated:** 2025-11-28 (Session 6 - Clarified automatic Cloud Build deployment)
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
  --min-instances=0 \
  --max-instances=5 \
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
# Deploy backend (AUTOMATIC via Cloud Build trigger)
git add -A && git commit -m "commit" && git push origin main
# Cloud Build automatically deploys to Cloud Run (3-5 minutes)

# Deploy backend (MANUAL - fallback if Cloud Build unavailable)
cd backend
gcloud run deploy gemini-avatar-backend --source . --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 5 --timeout 300 --memory 512Mi --cpu 1 --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest --port 8080

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
  - Min Instances: 0 (scale to zero - cost optimized for dev/demo)
  - Max Instances: 5
  - Timeout: 300s
  - Authentication: Unauthenticated (public)
  - **Note:** First request after idle has 5-15s cold start delay
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

### **Workflow 1: Backend Automatic Deployment (RECOMMENDED)**

**Trigger:** Push to `main` branch triggers Cloud Build automatically

```
Developer modifies backend files
        ↓
git add -A && git commit -m "commit" && git push origin main
        ↓
GitHub webhook triggers Cloud Build
        ↓
Cloud Build runs cloudbuild.yaml
        ↓
Docker image built from backend/Dockerfile
        ↓
Deploys to Cloud Run (gemini-avatar-backend)
        ↓
Routes 100% traffic to new revision
        ↓
✅ Backend live at: https://gemini-avatar-backend-580499038386.us-central1.run.app
```

**Time:** 3-5 minutes
**No Manual Intervention Required**

**To deploy:**
```bash
# Modify backend code
vim backend/core/websocket_handler.py

# Commit and push (triggers automatic deployment)
git add -A && git commit -m "Fix transcription bug" && git push origin main

# Monitor build progress
# https://console.cloud.google.com/cloud-build/builds?project=avatar-478217
```

### **Workflow 1b: Backend Manual Deployment (FALLBACK)**

**Use only if Cloud Build is unavailable**

```bash
cd backend
gcloud run deploy gemini-avatar-backend --source . --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 5 --timeout 300 --memory 512Mi --cpu 1 --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest --port 8080
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
  "automaticVAD": {
    "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",
    "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
    "prefixPaddingMs": 20,
    "silenceDurationMs": 100,
    "_comment": "Google boilerplate defaults. ⚠️ Only LOW/HIGH supported. MEDIUM causes immediate disconnect!"
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

### **Immediate Disconnect After Session Start (VAD Sensitivity)**

**Problem:** Session connects then immediately disconnects. No error message visible.

**Root Cause:** Invalid VAD sensitivity value in `backend_config.json`. Gemini Live API **only supports LOW and HIGH** sensitivity options. Using `MEDIUM` or any other value causes Gemini to reject the session configuration.

**Symptoms:**
- WebSocket connects successfully
- Backend sends "ready" message
- Gemini session creation fails silently
- Connection closes immediately

**Check:**
```bash
# Check backend config for invalid VAD values
cat backend/backend_config.json | grep -A5 "automaticVAD"

# Check Cloud Run logs for config errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" \
  --limit=20 \
  --format="value(textPayload)"
```

**Fix:**
```json
// backend/backend_config.json - Google boilerplate defaults
"automaticVAD": {
  "enabled": true,
  "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",  // ✅ LOW or HIGH only
  "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",      // ✅ LOW or HIGH only
  "prefixPaddingMs": 20,
  "silenceDurationMs": 100
}
```

**Valid Values:**
| Setting | Valid Values | Effect |
|---------|-------------|--------|
| startOfSpeechSensitivity | `START_SENSITIVITY_LOW`, `START_SENSITIVITY_HIGH` | LOW = less sensitive (reduces false positives) |
| endOfSpeechSensitivity | `END_SENSITIVITY_LOW`, `END_SENSITIVITY_HIGH` | LOW = requires longer silence to end turn |

**⚠️ INVALID:** `START_SENSITIVITY_MEDIUM`, `END_SENSITIVITY_MEDIUM` - These cause immediate disconnect!

**Google Boilerplate Settings (RECOMMENDED):**
- `LOW` sensitivity + `prefixPaddingMs: 20` + `silenceDurationMs: 100`
- This is the official Google recommended configuration for Live API

**Deploy Fix:**
```bash
# Edit config
vim backend/backend_config.json

# Commit and push (triggers Cloud Build)
git add backend/backend_config.json
git commit -m "fix: Use LOW VAD sensitivity (MEDIUM not supported)"
git push origin main

# Also update frontend config if present
vim frontend/frontend_config.json
firebase deploy --only hosting
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

## Backstory & Persona Architecture

### **Overview**

The avatar's personality and behavior are defined by a backstory JSON file that loads into Gemini's system instructions. This architecture ensures consistent character behavior while avoiding redundancy.

### **File Location**

**Primary Backstory:** `backend/whinny_backstory.json`
**Set List (Song Trivia):** `backend/set-list.json`
**System Instruction Builder:** `backend/config/prompts.py`

### **How It Works**

```
┌─────────────────────────────────────────────────────────────┐
│  whinny_backstory.json                                       │
│  - Character identity, personality, world details            │
│  - Behavioral rules and reaction patterns                    │
│  - Function calling triggers (dance, goodbye)                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  backend/config/prompts.py                                   │
│  create_persona_instructions(backstory_data)                 │
│  - Transforms JSON into Google's 5-part structure            │
│  - Builds system_instruction for Gemini                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  Gemini Live API Session                                     │
│  system_instruction: {persona instructions}                  │
│  - Persona loaded ONCE at session start                      │
│  - No redundant first message needed                         │
└─────────────────────────────────────────────────────────────┘
```

### **Configuration**

```json
// backend/backend_config.json
{
  "initialContext": {
    "enabled": true,
    "includeBackstory": false,  // Disabled (already in system_instruction)
    "includeSetList": true,      // Enabled (provides song trivia details)
    "_comment": "Live API does NOT support context caching"
  }
}
```

**Why includeBackstory is false:**
- Backstory is transformed into system_instruction (Google best practice)
- Sending backstory as first message would be redundant
- System instruction is the recommended place for persona (per Google docs)

**Why includeSetList is true:**
- Set list provides detailed song information NOT in system instruction
- Contains 40+ songs with artist, year, album, band member details
- Enables music trivia capability without persona redundancy

### **Google's 5-Part System Instruction Structure**

The `create_persona_instructions()` function transforms backstory JSON into:

1. **Agent Persona**
   - Character identity (Whinny, singing cowgirl mare)
   - Personality traits, influences
   - World details (genre: new wave outlaw country)

2. **Conversational Flow**
   - One-time setup (greeting, context gathering)
   - Ongoing conversation loop (respond naturally)
   - Numbered steps for clarity

3. **Tool Specifications**
   - When/how to use function calling
   - Dance mode triggers: "dance", "let's dance", etc.
   - Goodbye mode triggers: "goodbye", "bye", "see you later"
   - **Critical:** "You MUST continue speaking while calling this function"

4. **Guardrails**
   - Explicit ❌ DON'T examples
   - Deflection responses for off-topic questions
   - Character boundaries (stays in persona)

5. **Detailed Behavioral Traits**
   - Fine-tuned personality characteristics
   - Response style, tone, vocabulary

**Reference:** https://docs.cloud.google.com/vertex-ai/generative-ai/docs/live-api/best-practices

### **Backstory JSON Structure**

```json
// backend/whinny_backstory.json (example structure)
{
  "basic_info": {
    "name": "Whinny",
    "species": "Singing cowgirl mare",
    "genre": "New wave outlaw country"
  },
  "personality": {
    "core_traits": ["Energetic", "Playful", "Authentic"],
    "influences": ["Dolly Parton", "Stevie Nicks", "K.D. Lang"]
  },
  "reaction_rules": {
    "greeting": "Warm and enthusiastic",
    "compliment": "Gracious and humble",
    "request_dance": "Trigger dance mode function"
  },
  "function_calling": {
    "dance_triggers": ["dance", "let's dance", "show me some moves"],
    "goodbye_triggers": ["goodbye", "bye", "see you later", "farewell"]
  }
}
```

### **Set List JSON Structure**

```json
// backend/set-list.json (example structure)
{
  "songs": [
    {
      "title": "Jolene",
      "artist": "Dolly Parton",
      "year": 1973,
      "album": "Jolene",
      "trivia": "Written in one day, inspired by a bank teller"
    }
    // ... 40+ songs total
  ]
}
```

### **Key Functions**

#### **backend/config/prompts.py**

```python
def create_persona_instructions(backstory_data):
    """
    Transform backstory JSON into Google's 5-part system instruction.

    Returns: String containing formatted system instructions
    """
    # Part 1: Agent Persona
    # Part 2: Conversational Flow
    # Part 3: Tool Specifications
    # Part 4: Guardrails
    # Part 5: Detailed Behavioral Traits
    pass

def load_initial_context_message(config):
    """
    Optionally load backstory/setlist as first message.

    IMPORTANT: Only loads setlist by default (backstory in system_instruction).
    """
    if config.get("includeSetList", True):
        return load_set_list()
    return None
```

#### **backend/core/websocket_handler.py**

```python
# System instruction loaded at session start
system_instruction = create_persona_instructions(backstory_data)

# Optional initial context message (setlist only)
if config["initialContext"]["includeSetList"]:
    initial_message = load_initial_context_message(config)
    # Send to Gemini as first message
```

### **Deployment Considerations**

**Backend Files:**
- Changes to `whinny_backstory.json` or `set-list.json` require backend deployment
- Changes to `prompts.py` require backend deployment
- Backend deployment: `cd backend && gcloud run deploy gemini-avatar-backend --source . --region=us-central1`
- Or use automatic Cloud Build trigger (git push → auto-deploy)

**No Frontend Changes Needed:**
- Backstory and set list are backend-only
- Frontend receives Gemini's responses (already includes persona)

### **Testing Persona Changes**

1. **Modify backstory:** Edit `backend/whinny_backstory.json`
2. **Commit:** `git add backend/ && git commit -m "Update backstory"`
3. **Push:** `git push origin main` (triggers auto-deploy if Cloud Build enabled)
4. **Or deploy manually:** `cd backend && gcloud run deploy gemini-avatar-backend --source . --region=us-central1`
5. **Test:** Visit https://avatar-478217.web.app and start conversation
6. **Verify:** Avatar should reflect personality changes

### **Common Pitfalls**

❌ **DON'T:** Send backstory as both system_instruction AND first message (redundant)
✅ **DO:** Backstory in system_instruction, setlist as first message (if needed)

❌ **DON'T:** Put song trivia in system_instruction (too verbose)
✅ **DO:** Keep system_instruction for persona, setlist for detailed data

❌ **DON'T:** Forget to redeploy backend after backstory changes
✅ **DO:** Always deploy backend when modifying JSON files

### **Architecture Benefits**

1. **Single Source of Truth:** Backstory JSON defines all character behavior
2. **No Redundancy:** Persona in system_instruction only (not duplicated)
3. **Separation of Concerns:** Persona vs data (backstory vs setlist)
4. **Easy Updates:** Edit JSON, redeploy backend, done
5. **Google Compliant:** Follows official Live API best practices

---

## Closed Captions Architecture

### Overview

Closed captions display Gemini's spoken responses as text overlaid on the video. The system uses Gemini's built-in `output_audio_transcription` feature - NO external Speech-to-Text API is required.

```
┌─────────────────────────────────────────────────────────────┐
│  GEMINI LIVE API                                             │
│  - Generates audio response                                  │
│  - Simultaneously generates output_transcription             │
│  - Sends transcription chunks in real-time                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ (transcription chunks)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKEND (websocket_handler.py)                              │
│  - Receives output_transcription from Gemini                 │
│  - Accumulates chunks into session.output_transcriptions     │
│  - Sends CUMULATIVE text as "transcription_interim"          │
│  - Sends complete text as "transcription" on turn_complete   │
└─────────────────────┬───────────────────────────────────────┘
                      │ (WebSocket messages)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (app.js → RollUpCaptionManager)                    │
│  - Receives cumulative text from backend                     │
│  - Extracts NEW words by comparing with previous text        │
│  - Buffers words and displays at 170 WPM                     │
│  - 2-line roll-up display (line 2 → line 1 on overflow)      │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/core/websocket_handler.py` | Lines 555-595: Transcription handling |
| `backend/backend_config.json` | `captions.enabled` setting |
| `frontend/app.js` | Lines 13-200: `RollUpCaptionManager` class |
| `frontend/frontend_config.json` | `closedCaptions` configuration |
| `frontend/index.html` | CC overlay HTML and CSS |

### Backend Configuration

```json
// backend/backend_config.json
{
  "captions": {
    "enabled": true,
    "_comment": "Uses Gemini's built-in output_audio_transcription feature"
  }
}
```

**Backend Transcription Flow:**
```python
# websocket_handler.py (lines 555-595)

# 1. Receive transcription chunk from Gemini
if hasattr(server_content, 'output_transcription'):
    text = server_content.output_transcription.text.strip()

    # 2. Accumulate chunks
    session.output_transcriptions.append(text)

    # 3. Send CUMULATIVE text (not individual chunks!)
    cumulative_text = ' '.join(session.output_transcriptions)
    await websocket.send(json.dumps({
        "type": "transcription_interim",
        "data": cumulative_text
    }))

# 4. On turn_complete, send final text and clear accumulator
if server_content.turn_complete:
    complete_text = ' '.join(session.output_transcriptions)
    await websocket.send(json.dumps({
        "type": "transcription",
        "data": complete_text
    }))
    session.output_transcriptions.clear()
```

### Frontend Configuration

```json
// frontend/frontend_config.json → closedCaptions
{
  "closedCaptions": {
    // Typography (FCC/WCAG AAA compliant)
    "fontFamily": "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    "fontSize": 26,
    "fontWeight": 500,
    "lineHeight": 1.4,

    // Colors (15:1 contrast ratio)
    "textColor": "#FFFF00",
    "backgroundColor": "rgba(0, 0, 0, 0.8)",
    "textShadow": "1px 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.6)",

    // Positioning (inside video frame)
    "position": "inVideo",
    "safeMarginBottom": "0%",
    "safeMarginHorizontal": "10%",

    // Display settings
    "displayMode": "rollup",
    "maxLines": 2,
    "maxCharsPerLine": 37,

    // Timing (170 WPM industry standard)
    "targetWPM": 170,
    "wordDelayMs": 353,

    // Opacity
    "interimOpacity": 0.85,
    "finalOpacity": 1.0
  }
}
```

### Frontend Caption Manager

The `RollUpCaptionManager` class handles caption display:

```javascript
// frontend/app.js

class RollUpCaptionManager {
    constructor(config, ccOverlay) {
        this.line1El = document.getElementById('ccLine1');  // Top line
        this.line2El = document.getElementById('ccLine2');  // Bottom line (active)
        this.ccOverlay = ccOverlay;

        // State
        this.bufferedWords = [];      // Words waiting to display
        this.lastProcessedText = '';  // For extracting new words
        this.displayedWordCount = 0;  // Words already shown
        this.isDisplaying = false;    // Display routine running?
    }

    addCaption(text, isFinal) {
        // 1. Extract NEW words from cumulative text
        const newWords = this.extractNewWords(text, this.lastProcessedText, isFinal);

        // 2. Add to buffer
        this.bufferedWords.push(...newWords);

        // 3. Start display routine if not running
        if (!this.isDisplaying) {
            this.startDisplayRoutine();
        }

        // 4. Update tracking
        this.lastProcessedText = text;
    }

    extractNewWords(currentText, previousText, isFinal) {
        // Compare word arrays to find new words
        // Returns only words that weren't in previousText
    }

    displayNextWord() {
        // Display one word at 170 WPM (353ms intervals)
        // Roll up: line2 → line1 when line2 overflows
    }
}
```

### HTML Structure

```html
<!-- frontend/index.html (inside .avatar-video-wrapper) -->
<div id="ccOverlay" class="cc-box">
    <div class="cc-content">
        <div id="ccLine1" class="cc-line"></div>
        <div id="ccLine2" class="cc-line"></div>
    </div>
</div>
```

### CC Toggle

```javascript
// CC starts OFF by default
this.isCCActive = false;

// User must click CC toggle to enable
this.ccToggle.addEventListener('click', () => this.toggleCC());

toggleCC() {
    this.isCCActive = !this.isCCActive;
    // Updates UI and enables/disables caption display
}
```

---

### ⚠️ CRITICAL GOTCHAS

#### **1. Word Extraction Must Include All New Words**

**THE BUG (caused captions to show only first word):**
```javascript
// ❌ WRONG - excludes last word, breaks when only 1 new word
for (let i = startIndex; i < currentWords.length - 1; i++) {
    newCompleteWords.push(currentWords[i]);
}
```

**THE FIX:**
```javascript
// ✅ CORRECT - include all new words
for (let i = startIndex; i < currentWords.length; i++) {
    newCompleteWords.push(currentWords[i]);
}
```

**Why:** The `-1` was meant to avoid partial words, but backend sends cumulative complete words. When there's only 1 new word (typical case), the loop never executes!

Example:
- Previous: `"Hello"` (1 word)
- Current: `"Hello world"` (2 words)
- startIndex = 1
- With `-1`: `for (i=1; i<1; i++)` → **never runs!**
- Without `-1`: `for (i=1; i<2; i++)` → extracts "world" ✓

---

#### **2. Backend Must Send CUMULATIVE Text**

**❌ WRONG - sending individual chunks:**
```python
await websocket.send(json.dumps({
    "type": "transcription_interim",
    "data": text  # Just this chunk
}))
```

**✅ CORRECT - sending cumulative text:**
```python
session.output_transcriptions.append(text)
cumulative_text = ' '.join(session.output_transcriptions)
await websocket.send(json.dumps({
    "type": "transcription_interim",
    "data": cumulative_text  # All chunks so far
}))
```

**Why:** Frontend's `extractNewWords()` compares current text with previous to find new words. If backend sends individual chunks, comparison fails.

---

#### **3. CC Toggle Default State**

```javascript
this.isCCActive = false;  // CC starts OFF
```

**Important:** Users must click the CC toggle button to see captions. This is intentional (matches broadcast TV behavior where CC is opt-in).

---

#### **4. Reset Tracking on turn_complete**

```javascript
// Called when turn_complete is received
resetCaptionTracking() {
    this.lastProcessedText = '';
    this.isFinalBuffered = false;
}
```

**Why:** Without reset, `extractNewWords()` may fail to detect new words in the next response if they start similarly to the previous response.

---

#### **5. Don't Clear Transcription on Interrupt**

```python
# websocket_handler.py
elif msg_type == "interrupt":
    # ❌ DON'T clear transcription - text was already spoken
    # session.output_transcriptions.clear()  # WRONG!

    # ✅ DO just set the flag
    session.client_interrupted = True
```

**Why:** Clearing transcription on interrupt causes frontend/backend state mismatch, resulting in missing captions.

---

#### **6. CC Overlay Must Be Inside Video Wrapper**

```html
<!-- ✅ CORRECT - CC inside video wrapper -->
<div class="avatar-video-wrapper">
    <video ...></video>
    <div id="ccOverlay" class="cc-box">...</div>
</div>

<!-- ❌ WRONG - CC outside video wrapper -->
<div class="avatar-video-wrapper">
    <video ...></video>
</div>
<div id="ccOverlay" class="cc-box">...</div>
```

**Why:** CC positioning uses percentage-based positioning relative to the video. If outside the wrapper, positioning breaks.

---

### Testing Captions

1. **Enable CC:** Click the CC toggle button (should light up)
2. **Start session:** Click "START SESSION"
3. **Speak:** Say something to trigger Gemini response
4. **Watch console:** Look for `📝` log messages:
   ```
   📝 addCaption called: "Hello world how are you" (isFinal=false)
   📝 Extracted 5 new word(s): "Hello world how are you"
   📝 Buffer now has 5 words, displayed 0
   📝 Starting display routine
   ```

5. **If captions don't appear, check:**
   - Is CC toggle active? (`isCCActive = true`)
   - Is `captionManager` initialized? (check console for errors)
   - Is backend sending transcription? (check Network tab for WebSocket messages)
   - Are words being extracted? (look for "Extracted N new words" log)

---

### Debugging Commands

```javascript
// In browser console:

// Check CC state
app.isCCActive  // Should be true if CC is on

// Check caption manager
app.captionManager  // Should exist
app.captionManager.bufferedWords  // Words waiting to display
app.captionManager.displayedWordCount  // Words already shown
app.captionManager.isDisplaying  // Display routine running?
app.captionManager.lastProcessedText  // Last text received

// Manually test caption display
app.captionManager.addCaption("Test caption text", false);
```

---

### Configuration Reference

| Setting | Default | Description |
|---------|---------|-------------|
| `captions.enabled` (backend) | `true` | Enable Gemini transcription |
| `closedCaptions.fontSize` | `26` | Font size in pixels |
| `closedCaptions.fontWeight` | `500` | Font weight (400-700) |
| `closedCaptions.textColor` | `#FFFF00` | Yellow text |
| `closedCaptions.backgroundColor` | `rgba(0,0,0,0.8)` | 80% black background |
| `closedCaptions.maxLines` | `2` | Number of caption lines |
| `closedCaptions.maxCharsPerLine` | `37` | Characters before wrap |
| `closedCaptions.targetWPM` | `170` | Words per minute |
| `closedCaptions.wordDelayMs` | `353` | Milliseconds between words |
| `closedCaptions.interimOpacity` | `0.85` | Opacity during typing |
| `closedCaptions.finalOpacity` | `1.0` | Opacity when complete |

---

## Recent Changes & Session History

### **Session 5: VAD & Barge-In Fixes (2025-11-24)**

#### **1. Avatar Self-Interruption Fix**

**Problem:** Avatar was interrupting himself during speech. Audio would cut off mid-sentence.

**Root Cause Analysis:** Two conflicting VAD systems were active:
1. **Client-side barge-in detection** in `audio-recorder.js` using RMS threshold monitoring
2. **Server-side Gemini VAD** (`automatic_activity_detection`)

The client-side RMS detection could not distinguish between:
- User speech (legitimate barge-in)
- Speaker audio bleeding into microphone (false positive)

This caused the avatar's own audio to trigger "barge-in" detection, interrupting himself.

**Solution:**
1. **Disabled client-side barge-in detection entirely** - Rely only on Gemini's server-side VAD
2. **Reduced VAD sensitivity** from HIGH to LOW - Reduces false positives from ambient noise
3. **Increased silence duration** from 200ms to 500ms - Allows natural speech pauses

**Files Changed:**
- `frontend/audio-recorder.js` - Disabled `startBargeInMonitoring()` (returns immediately)
- `backend/backend_config.json` - Changed VAD to LOW sensitivity, 500ms silence
- `frontend/frontend_config.json` - Updated VAD settings to match

**Key Code Change (audio-recorder.js:120-125):**
```javascript
startBargeInMonitoring() {
    // DISABLED - Rely on Gemini's server-side VAD instead
    // Client-side RMS detection cannot distinguish speaker output from user speech
    console.log('🎙️ Barge-in monitoring DISABLED (using server-side VAD)');
    return;
}
```

---

#### **2. Invalid VAD Sensitivity Causing Immediate Disconnect**

**Problem:** After changing VAD sensitivity to "MEDIUM", sessions would immediately disconnect after connecting.

**Root Cause:** Gemini Live API **only supports LOW and HIGH** sensitivity values. `MEDIUM` is not a valid option and causes the session configuration to be rejected.

**Symptoms:**
- WebSocket connects successfully
- Backend sends "ready" message
- Connection immediately closes
- No clear error message

**Solution:** Changed sensitivity from `MEDIUM` to `LOW` with Google boilerplate defaults:
```json
"automaticVAD": {
  "startOfSpeechSensitivity": "START_SENSITIVITY_LOW",
  "endOfSpeechSensitivity": "END_SENSITIVITY_LOW",
  "prefixPaddingMs": 20,
  "silenceDurationMs": 100
}
```

**Valid VAD Sensitivity Values:**
| Value | Effect |
|-------|--------|
| `START_SENSITIVITY_LOW` | Less sensitive to speech start (reduces false positives) |
| `START_SENSITIVITY_HIGH` | More sensitive to speech start (faster response) |
| `END_SENSITIVITY_LOW` | Requires longer silence before ending turn |
| `END_SENSITIVITY_HIGH` | Shorter silence ends turn (more responsive) |

**⚠️ CRITICAL:** `MEDIUM` is NOT valid and causes immediate disconnect!

---

#### **3. UI Layout Fix - Rack Panel Positioning**

**Problem:** The 3D rack panel on the right was pushing the video window off-center.

**Solution:** Changed rack panel to use absolute positioning so video stays centered:

```css
.main-layout {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.right-controls {
    position: absolute;
    right: 1vw;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
}
```

**Result:** Video window now stays perfectly centered, rack panel floats on the right.

---

#### **4. CC Word Extraction Fix**

**Problem:** Closed captions only showed the first word, then nothing until audio ended.

**Root Cause:** The `extractNewWords()` function excluded the last word to avoid "partial" words:
```javascript
// ❌ BUG: -1 breaks when there's only 1 new word
for (let i = startIndex; i < currentWords.length - 1; i++) {
```

When cumulative text grows by 1 word (typical), the loop never executes:
- Previous: `"Hello"` → Current: `"Hello world"`
- startIndex = 1, currentWords.length = 2
- Loop: `for (i=1; i<1; i++)` → **never runs!**

**Solution:** Remove the `-1` since backend sends complete words:
```javascript
// ✅ FIX: Include all new words
for (let i = startIndex; i < currentWords.length; i++) {
```

**Files Changed:**
- `frontend/app.js` - Fixed `extractNewWords()` in `RollUpCaptionManager`

---

#### **Summary of Session 5 Changes**

| Change | File(s) | Impact |
|--------|---------|--------|
| Disable client-side barge-in | `audio-recorder.js` | Prevents avatar self-interruption |
| VAD sensitivity LOW | `backend_config.json`, `frontend_config.json` | Reduces false positive interruptions |
| Silence duration 500ms | `backend_config.json`, `frontend_config.json` | Allows natural speech pauses |
| Fix MEDIUM → LOW | `backend_config.json`, `frontend_config.json` | Fixes immediate disconnect |
| Rack absolute positioning | `index.html` | Video stays centered |
| CC word extraction fix | `app.js` | All words now display in captions |

**Git Commits:**
- `92e343b` - fix: Disable client-side barge-in, rely on server-side VAD
- `79b2fa9` - fix: Use LOW VAD sensitivity (MEDIUM not supported by Gemini)
- `933c7e8` - fix: CC word extraction now includes all new words

---

### **Session 4: Closed Captions Redesign - FCC/WCAG AAA Compliance (2025-11-24)**

#### **1. Complete Closed Captions Redesign**

**Problem:** Existing captions used monospace font, white text, paint-on style below console (non-standard for broadcast).

**Solution:** Complete redesign following FCC/WCAG AAA industry standards:

**Visual Design:**
- **Color:** Yellow (#FFFF00) on black background (15:1 contrast, exceeds WCAG AAA 7:1)
- **Font:** Proportional sans-serif (Roboto) - 13-20% faster reading than monospace
- **Font Weight:** 500 (medium) for better legibility
- **Background:** 80% opacity black (reduced from 85% for less video obstruction)
- **Text Shadow:** Enhanced depth (1px 1px 2px + 0 0 4px)

**Positioning:**
- **Location:** Inside video frame (not below console)
- **Safe Zones:** 10% margins from all edges (broadcast standard)
- **Z-Index:** 5 (above videos, below curtain)

**Display Method:**
- **Style:** Single-line instant display (no scrolling, no word-by-word animation)
- **Behavior:** Full sentence appears immediately
- **Opacity:** Interim 85%, Final 100%

**Implementation:**
```javascript
// frontend/app.js (lines 9-47)
class RollUpCaptionManager {
    constructor(config, ccOverlay) {
        this.line1El = document.getElementById('ccLine1');
        this.ccOverlay = ccOverlay;
        this.interimOpacity = config.interimOpacity || 0.85;
        this.finalOpacity = config.finalOpacity || 1.0;
    }

    addCaption(text, isFinal = false) {
        if (!text || text.trim().length === 0) return;

        // Display text instantly on line 1 only
        if (this.line1El) {
            this.line1El.textContent = text;
            const opacity = isFinal ? this.finalOpacity : this.interimOpacity;
            this.line1El.style.opacity = opacity;
        }

        if (this.ccOverlay) {
            this.ccOverlay.classList.add('active');
        }
    }

    clear() {
        if (this.line1El) this.line1El.textContent = '';
        if (this.ccOverlay) this.ccOverlay.classList.remove('active');
    }
}
```

**Configuration:**
```json
// frontend/frontend_config.json (lines 234-272)
"closedCaptions": {
  "fontFamily": "'Roboto', 'Helvetica Neue', Arial, sans-serif",
  "fontSize": 26,
  "fontWeight": 500,
  "textColor": "#FFFF00",
  "backgroundColor": "rgba(0, 0, 0, 0.8)",
  "position": "inVideo",
  "safeMarginBottom": "10%",
  "safeMarginHorizontal": "10%",
  "displayMode": "instant",
  "maxLines": 1,
  "interimOpacity": 0.85,
  "finalOpacity": 1.0,
  "contrastRatio": "AAA"
}
```

**Files Changed:**
- `frontend/app.js` - New simplified RollUpCaptionManager class
- `frontend/index.html` - Moved CC inside video wrapper, updated CSS
- `frontend/frontend_config.json` - Industry-standard configuration

**User Feedback Iterations:**
1. **Initial:** 2-line roll-up with word-by-word scrolling at 170 WPM
2. **Final:** Single-line instant display (user preference: no scrolling)

**Git Commits:**
- `291a81d` - Initial FCC/WCAG redesign with roll-up
- `a030f4d` - Simplified to single-line instant display

**Standards Compliance:**

| Standard | Requirement | Implementation | Status |
|----------|-------------|----------------|--------|
| **WCAG AAA Contrast** | 7:1 minimum | 15:1 (yellow on black) | ✅ |
| **Safe Zones** | 10% margins | 10% all edges | ✅ |
| **Font Type** | Proportional | Roboto sans-serif | ✅ |
| **Positioning** | Inside video | Bottom 10%, centered | ✅ |
| **Legibility** | High contrast | Yellow + shadows | ✅ |

---

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

1. **Backend changes** (Python code in `backend/`) deploy AUTOMATICALLY via Cloud Build:
   ```bash
   git add -A && git commit -m "commit" && git push origin main
   ```
   Cloud Build trigger auto-deploys to Cloud Run (3-5 min)
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
# For backend changes (AUTOMATIC via Cloud Build trigger):
git add -A && git commit -m "commit" && git push origin main
# Cloud Build automatically deploys to Cloud Run (3-5 minutes)
# Monitor: https://console.cloud.google.com/cloud-build/builds?project=avatar-478217

# For backend changes (MANUAL - if Cloud Build unavailable):
cd backend
gcloud run deploy gemini-avatar-backend --source . --region us-central1 --allow-unauthenticated --min-instances 0 --max-instances 5 --timeout 300 --memory 512Mi --cpu 1 --set-env-vars BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=false,FIREBASE_PROJECT_ID=avatar-478217 --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest --port 8080
# Takes 3-5 minutes

# For frontend changes (ALWAYS MANUAL):
git add -A && git commit -m "commit" && git push origin main
firebase deploy --only hosting
# Takes 30-60 seconds

# For both (backend auto-deploys, frontend manual):
git add -A && git commit -m "commit" && git push origin main
# Backend deploys automatically via Cloud Build trigger
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
