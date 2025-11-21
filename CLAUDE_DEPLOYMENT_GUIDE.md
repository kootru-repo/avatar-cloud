# Claude Deployment Guide - Gemini Live Avatar
## Master Reference for All Deployments & Architecture

**Project:** Gemini Live Avatar - Voice-to-voice AI conversation with animated avatar
**Last Updated:** 2025-11-21
**Status:** Production-ready, auto-deploys enabled

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
- **Backend (Cloud Run):** https://gemini-avatar-backend-j77zxealoq-uc.a.run.app
- **Backend WebSocket:** wss://gemini-avatar-backend-580499038386.us-central1.run.app

### **Quick Deploy Commands**
```bash
# Deploy backend (triggers automatically on git push to main)
git add backend/
git commit -m "Update backend"
git push origin main

# Deploy frontend (manual)
firebase deploy --only hosting

# View deployment status
gcloud builds list --limit=5
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
│  - Serves frontend (index.html, app.js, config.json)        │
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
│  - STT transcription (faster-whisper-tiny)                   │
│  - Auto-scales 1-10 instances                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├──── API Calls
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              GEMINI API                                      │
│  Model: gemini-2.5-flash-native-audio-preview-09-2025       │
│  - Voice-to-voice conversation                               │
│  - Native audio processing                                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│              CLOUD STORAGE BUCKETS                           │
│  1. avatar-478217-videos/                                    │
│     - idle.webm, talking.webm, expressive.webm               │
│  2. avatar-478217-whisper-models/                            │
│     - faster-whisper-tiny model (72MB)                       │
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
│   ├── config.json             # Frontend configuration
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
│   ├── config.json             # Backend configuration
│   └── core/
│       ├── websocket_handler.py # WebSocket message handling
│       ├── transcription.py     # STT with faster-whisper
│       └── session.py           # Session state management
│
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
- **URL:** https://gemini-avatar-backend-j77zxealoq-uc.a.run.app
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
  - `REQUIRE_AUTH=true`
- **Secrets Mounted:**
  - `GEMINI_API_KEY` (Secret Manager)
  - `FIREBASE_PROJECT_ID` (Secret Manager - may not exist)

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

#### **b) avatar-478217-whisper-models** (Private)
- **Purpose:** Faster-Whisper-Tiny STT model
- **Access:** Private (Cloud Run service account only)
- **Contents:**
  - `faster-whisper-tiny/config.json`
  - `faster-whisper-tiny/model.bin` (75MB)
  - `faster-whisper-tiny/tokenizer.json`
  - `faster-whisper-tiny/vocabulary.txt`
- **Total Size:** 72 MB

#### **c) run-sources-avatar-478217-us-central1** (Auto-managed)
- **Purpose:** Cloud Run source deployment artifacts
- **Managed By:** Google Cloud Run (don't modify)

### **5. Service Accounts**

#### **a) 580499038386-compute@developer.gserviceaccount.com**
- **Type:** Compute Engine default service account
- **Used By:** Cloud Run backend
- **Permissions:**
  - Read GEMINI_API_KEY from Secret Manager
  - Read from avatar-478217-whisper-models bucket
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
**Status:** Configured to auto-deploy backend
- **Trigger:** Push to `main` branch in GitHub repo
- **Build Config:** `cloudbuild.yaml`
- **Steps:**
  1. Build Docker container from `backend/Dockerfile`
  2. Push to Artifact Registry
  3. Deploy to Cloud Run
  4. Route 100% traffic to new revision
- **Build Time:** ~3-5 minutes
- **Service Account:** `580499038386@cloudbuild.gserviceaccount.com`

---

## Deployment Workflows

### **Workflow 1: Backend Auto-Deployment (AUTOMATIC)**

**Trigger:** Any commit to `main` branch that modifies `backend/` files

```
Developer pushes to GitHub main branch
        ↓
GitHub webhook notifies Cloud Build
        ↓
Cloud Build reads cloudbuild.yaml
        ↓
Step 1: Build Docker image (backend/Dockerfile)
        ↓
Step 2: Push to Artifact Registry (us-central1)
        ↓
Step 3: Deploy to Cloud Run (gemini-avatar-backend)
        ↓
Step 4: Route 100% traffic to new revision
        ↓
✅ Backend live at: https://gemini-avatar-backend-*.run.app
```

**Time:** 3-5 minutes
**No Manual Intervention Required**

**To trigger:**
```bash
# Modify backend code
vim backend/core/transcription.py

# Commit and push
git add backend/
git commit -m "Fix transcription bug"
git push origin main

# Monitor deployment
gcloud builds list --limit=1
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')
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

### **Scenario 1: Backend Bug Fix (e.g., Fix STT transcription)**

```bash
# 1. Make changes locally
cd C:\Projects\gemini-livewire-avatar
vim backend/core/transcription.py

# 2. Test locally (optional)
cd backend
python main.py

# 3. Commit and push (auto-deploys to Cloud Run)
git add backend/core/transcription.py
git commit -m "Fix transcription VAD filter"
git push origin main

# 4. Monitor deployment
gcloud builds list --limit=1
gcloud builds log $(gcloud builds list --limit=1 --format='value(id)')

# 5. Verify deployment
gcloud run services describe gemini-avatar-backend --region=us-central1
curl https://gemini-avatar-backend-j77zxealoq-uc.a.run.app/health

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

# 3. Backend deploys automatically (3-5 min)
# Monitor: gcloud builds list --limit=1

# 4. Deploy frontend manually
firebase deploy --only hosting

# 5. Verify both
curl https://gemini-avatar-backend-j77zxealoq-uc.a.run.app/health
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
vim frontend/config.json
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

### **1. frontend/config.json**
**Purpose:** Frontend application configuration
**Location:** `frontend/config.json`
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

### **2. backend/config.json**
**Purpose:** Backend application configuration
**Location:** `backend/config.json`
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
  }
}
```

**When to Update:**
- Gemini model version changes
- Voice/VAD settings tuning
- Audio configuration changes

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

### **Backend Not Deploying After Git Push**

**Problem:** Pushed to GitHub but Cloud Build didn't trigger

**Check:**
```bash
# 1. Verify Cloud Build trigger exists
gcloud builds triggers list --project=avatar-478217

# 2. Check recent builds
gcloud builds list --limit=5

# 3. Check if changes were in backend/ directory
git log --oneline --name-only -5 | grep backend/
```

**Fix:**
```bash
# If trigger doesn't exist, create it:
gcloud builds triggers create github \
  --repo-name=avatar-cloud \
  --repo-owner=kootru-repo \
  --branch-pattern=^main$ \
  --build-config=cloudbuild.yaml
```

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
curl https://gemini-avatar-backend-j77zxealoq-uc.a.run.app/health

# 2. Check WebSocket URL in frontend config
cat frontend/config.json | grep wsUrl

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
vim frontend/config.json
# Set: "cloud": "wss://CORRECT-BACKEND-URL.run.app"

# Deploy frontend
firebase deploy --only hosting

# Update backend allowed origins if needed
gcloud run services update gemini-avatar-backend \
  --region=us-central1 \
  --set-env-vars=ALLOWED_ORIGINS="https://avatar-478217.web.app"
```

---

### **Transcription Not Working**

**Problem:** Closed captions not appearing

**Check:**
```bash
# 1. Check if transcription is enabled in code
grep -n "transcribe_and_send" backend/core/websocket_handler.py

# 2. Check Whisper model bucket access
gcloud storage ls gs://avatar-478217-whisper-models/faster-whisper-tiny/

# 3. Check Cloud Run logs for transcription errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" \
  --limit=50 \
  --format=json | jq -r '.[] | select(.textPayload | contains("transcri"))'
```

**Fix:**
```bash
# Re-enable transcription if disabled
vim backend/core/websocket_handler.py
# Remove any early return statements in transcribe_and_send()

# Commit and push (auto-deploys)
git add backend/core/websocket_handler.py
git commit -m "Re-enable transcription"
git push origin main
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
# Backend (automatic via git)
git push origin main

# Frontend (manual)
firebase deploy --only hosting

# Both (frontend requires manual step)
git push origin main && firebase deploy --only hosting
```

### **Monitoring**
```bash
# Backend logs
gcloud logging read "resource.type=cloud_run_revision" --limit=50

# Build logs
gcloud builds list --limit=5
gcloud builds log BUILD_ID

# Service status
gcloud run services describe gemini-avatar-backend --region=us-central1
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
├── backend/* → Git push → Cloud Build AUTO-DEPLOYS to Cloud Run (3-5 min)
│
├── frontend/* → Git push + MANUAL: firebase deploy --only hosting (30-60 sec)
│
├── cloudbuild.yaml → Git push → Affects NEXT backend deployment
│
├── firebase.json → MANUAL: firebase deploy (affects hosting config)
│
└── Other files → Git push (version control only, no deployment)
```

---

## Summary

**What Claude Needs to Know:**

1. **Backend changes** (Python code in `backend/`) auto-deploy via Cloud Build when pushed to GitHub main branch
2. **Frontend changes** (HTML/JS in `frontend/`) require manual `firebase deploy --only hosting`
3. **Always commit to git first**, then handle deployment
4. **Backend URL:** https://gemini-avatar-backend-j77zxealoq-uc.a.run.app
5. **Frontend URL:** https://avatar-478217.web.app
6. **Project ID:** avatar-478217
7. **GitHub Repo:** https://github.com/kootru-repo/avatar-cloud

**Deployment Workflow:**
```bash
# For backend changes:
git add backend/
git commit -m "Fix: description"
git push origin main
# Wait 3-5 minutes for Cloud Build

# For frontend changes:
git add frontend/
git commit -m "Fix: description"
git push origin main
firebase deploy --only hosting
# Takes 30-60 seconds

# For both:
git add .
git commit -m "Fix: description"
git push origin main
# Wait for backend, then:
firebase deploy --only hosting
```

---

**End of Claude Deployment Guide**
**Questions? Check DEPLOYMENT.md or DEPLOY_NOW.md for detailed steps**
