"""
Download faster-whisper tiny model from HuggingFace
This script downloads the model files needed for faster-whisper
"""
import os
import requests
from pathlib import Path

# Model files for faster-whisper-tiny from HuggingFace
MODEL_REPO = "Systran/faster-whisper-tiny"
MODEL_FILES = [
    "config.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.txt"
]

def download_file(url: str, dest_path: Path):
    """Download a file from URL to destination path"""
    print(f"Downloading {url}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()

    dest_path.parent.mkdir(parents=True, exist_ok=True)

    with open(dest_path, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    print(f"OK Saved to {dest_path}")

def main():
    # Create model directory
    model_dir = Path("whisper-models/faster-whisper-tiny")
    model_dir.mkdir(parents=True, exist_ok=True)

    # Download each file
    base_url = f"https://huggingface.co/{MODEL_REPO}/resolve/main"

    for filename in MODEL_FILES:
        url = f"{base_url}/{filename}"
        dest = model_dir / filename

        try:
            download_file(url, dest)
        except Exception as e:
            print(f"ERROR Failed to download {filename}: {e}")
            print(f"   URL: {url}")

    print(f"\nOK Model files downloaded to: {model_dir.absolute()}")

if __name__ == "__main__":
    main()
