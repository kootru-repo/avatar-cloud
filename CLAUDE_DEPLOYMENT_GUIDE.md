# Claude Deployment Guide - Gemini Live Avatar
## Master Reference for All Deployments & Architecture

**Project:** Gemini Live Avatar - Voice-to-voice AI conversation with animated avatar
**Last Updated:** 2025-11-20 (Session 2 - Speech-to-Text migration)
**Status:** Production-ready, manual deployments

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
│  - STT transcription (Google Cloud Speech-to-Text)           │
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

┌──────────────────────────▼──────────────────────────────────┐
│         GOOGLE CLOUD SPEECH-TO-TEXT API                      │
│  - Real-time audio transcription for captions                │
│  - Serverless (no model downloads)                           │
│  - Instant initialization                                    │
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
│       ├── transcription.py     # STT with Google Cloud Speech-to-Text
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
  - `REQUIRE_AUTH=true`
  - `FIREBASE_PROJECT_ID=avatar-478217` (allows frontend origin)
- **Secrets Mounted:**
  - `GEMINI_API_KEY` (Secret Manager)

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

**Note:** Previous `avatar-478217-whisper-models` bucket has been deprecated. The system now uses Google Cloud Speech-to-Text API instead of Whisper, eliminating the need for model storage.

### **5. Service Accounts**

#### **a) 580499038386-compute@developer.gserviceaccount.com**
- **Type:** Compute Engine default service account
- **Used By:** Cloud Run backend
- **Permissions:**
  - Read GEMINI_API_KEY from Secret Manager
  - Access Google Cloud Speech-to-Text API
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

### **7. Google Cloud Speech-to-Text API**
**Service:** speech.googleapis.com
- **Purpose:** Real-time audio transcription for closed captions
- **Model:** default (fast general model)
- **Features:**
  - Serverless (no model downloads required)
  - Instant initialization (replaces Whisper model)
  - Audio buffering: Accumulates 2 seconds (10 chunks) before transcription
  - Caption delay: 4-second delay for audio/caption synchronization
  - Format: LINEAR16 PCM, 24kHz sample rate, en-US
  - Auto-punctuation enabled
- **Billing:** Pay-per-use (billed per 15 seconds of audio)
- **Why Migration from Whisper:**
  - Zero cold start delay (no model download)
  - Better accuracy on short audio chunks
  - Fully managed infrastructure
  - Native GCP integration

### **8. Artifact Registry**
**Repository:** `cloud-run-source-deploy`
- **Format:** Docker
- **Location:** us-central1
- **Purpose:** Stores Cloud Run container images
- **Managed By:** Cloud Run (auto-updated on deploy)

### **9. Cloud Build (CI/CD)**
**Status:** NOT CURRENTLY CONFIGURED (manual deployments only)
- **Trigger:** None configured (can be set up to auto-deploy on git push)
- **Build Config:** `cloudbuild.yaml` exists but not actively used
- **Current Deployment Method:** Manual `gcloud run deploy` from local machine
- **Note:** cloudbuild.yaml file is available for future CI/CD setup if needed

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
  --set-env-vars=BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=true,FIREBASE_PROJECT_ID=avatar-478217 \
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

### **Scenario 1: Backend Bug Fix (e.g., Fix STT transcription)**

```bash
# 1. Make changes locally
cd C:\Projects\gemini-livewire-avatar
vim backend/core/transcription.py

# 2. Test locally (optional)
cd backend
python main.py

# 3. Commit to git (for version control)
git add backend/core/transcription.py
git commit -m "Fix transcription VAD filter"
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

# 2. Verify Speech-to-Text API is enabled
gcloud services list --enabled | grep speech

# 3. Check Cloud Run logs for transcription errors
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=gemini-avatar-backend" \
  --limit=50 \
  --format=json | jq -r '.[] | select(.textPayload | contains("transcri"))'

# 4. Check service account has Speech-to-Text permissions
gcloud projects get-iam-policy avatar-478217 \
  --flatten="bindings[].members" \
  --filter="bindings.members:580499038386-compute@developer.gserviceaccount.com"
```

**Common Issues:**
- **Caption timing off:** Adjust `CAPTION_DELAY_MS` in backend/core/transcription.py (currently 4000ms)
- **Only first chunk transcribed:** Check `BUFFER_DURATION_MS` (should be 2000ms = 10 chunks)
- **Speech-to-Text API disabled:** Run `gcloud services enable speech.googleapis.com --project=avatar-478217`

**Fix:**
```bash
# Enable Speech-to-Text API if needed
gcloud services enable speech.googleapis.com --project=avatar-478217

# Re-enable transcription if disabled
vim backend/core/websocket_handler.py
# Remove any early return statements in transcribe_and_send()

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
├── cloudbuild.yaml → (Not used - manual deployments only)
│
├── firebase.json → MANUAL: firebase deploy (affects hosting config)
│
└── Other files → Git commit (version control only, no deployment)
```

---

## Recent Changes & Session History

### **Session 2: Speech-to-Text Migration & UI Improvements (2025-11-20)**

#### **1. Migrated from Whisper to Google Cloud Speech-to-Text API**

**Problem:**
- Whisper model downloading from Hugging Face on every cold start
- GCS-hosted model loading was hanging indefinitely
- User explicitly requested: "use Google's native Speech-to-Text API"

**Solution:**
- Complete rewrite of `backend/core/transcription.py`
- Replaced `faster-whisper` with `google-cloud-speech`
- Updated `backend/requirements.txt`:
  - Removed: `faster-whisper==1.1.0`, `numpy>=1.24.3,<2.0.0`, `google-cloud-storage==2.14.0`
  - Added: `google-cloud-speech==2.21.0`
- Enabled `speech.googleapis.com` API in GCP

**Benefits:**
- Zero cold start delay (no model downloads)
- Instant initialization (serverless)
- Better accuracy on short audio chunks
- Fully managed infrastructure

**Key Implementation Details:**
- Audio buffering: Accumulates 10 chunks (~2 seconds) before transcription
- Caption delay: 4-second delay to sync captions with audio playback
- Format: LINEAR16 PCM, 24kHz sample rate, en-US
- Auto-punctuation enabled

**Files Changed:**
- `backend/core/transcription.py` - Complete rewrite
- `backend/requirements.txt` - Dependency changes

**Deployment:**
```bash
cd backend
gcloud run deploy gemini-avatar-backend --source . --region=us-central1
# Revision: gemini-avatar-backend-00027-q7v
```

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

#### **3. Fixed Caption Timing Issues**

**Problem 1:** Only first 3 words transcribed
- **Root Cause:** Individual audio chunks from Gemini (~200ms) too short for Speech-to-Text
- **Solution:** Implemented audio buffering (10 chunks = 2 seconds)

**Problem 2:** Captions appearing too early
- **User Feedback:** "the transcription is too fast! its getting the text long before the audio is done"
- **First Fix:** Added 2-second delay
- **User Feedback:** "STT transcriptption still WAY too fast"
- **Final Fix:** Increased to 4-second delay (`CAPTION_DELAY_MS = 4000`)

**Implementation in `backend/core/transcription.py`:**
```python
BUFFER_DURATION_MS = 2000    # Buffer 2 seconds of audio
CHUNK_DURATION_MS = 200      # Each Gemini chunk
CAPTION_DELAY_MS = 4000      # 4-second display delay
```

---

#### **4. UI Changes: Mixer Toggle Switch**

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
- Configured Whisper-tiny model for STT (later replaced in Session 2)
- Set up Cloud Storage buckets for avatar videos
- Created initial deployment documentation

---

## Summary

**What Claude Needs to Know:**

1. **Backend changes** (Python code in `backend/`) require manual deployment: `cd backend && gcloud run deploy gemini-avatar-backend --source . --region=us-central1`
2. **Frontend changes** (HTML/JS in `frontend/`) require manual `firebase deploy --only hosting`
3. **Always commit to git first** for version control, then deploy manually
4. **Backend URL:** https://gemini-avatar-backend-580499038386.us-central1.run.app
5. **Frontend URL:** https://avatar-478217.web.app
6. **Project ID:** avatar-478217
7. **GitHub Repo:** https://github.com/kootru-repo/avatar-cloud
8. **Auto-deployment:** NOT currently configured (all deployments are manual)
9. **STT Technology:** Google Cloud Speech-to-Text API (replaced Whisper in Session 2)
10. **Required Environment Variables:** `BACKEND_HOST`, `BACKEND_PORT`, `DEBUG`, `REQUIRE_AUTH`, `FIREBASE_PROJECT_ID`
11. **Latest Backend Revision:** gemini-avatar-backend-00027-q7v (Speech-to-Text + 4s caption delay)

**Deployment Workflow:**
```bash
# For backend changes:
git add backend/
git commit -m "Fix: description"
git push origin main
cd backend
gcloud run deploy gemini-avatar-backend \
  --source . \
  --region=us-central1 \
  --set-env-vars=BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=true,FIREBASE_PROJECT_ID=avatar-478217 \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest
# Takes 3-5 minutes

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
cd backend
gcloud run deploy gemini-avatar-backend \
  --source . \
  --region=us-central1 \
  --set-env-vars=BACKEND_HOST=0.0.0.0,BACKEND_PORT=8080,DEBUG=false,REQUIRE_AUTH=true,FIREBASE_PROJECT_ID=avatar-478217 \
  --set-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest
firebase deploy --only hosting
```

---

**End of Claude Deployment Guide**
**Questions? Check DEPLOYMENT.md or DEPLOY_NOW.md for detailed steps**
