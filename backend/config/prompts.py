"""
System instructions and prompts for Gemini
Loads backstory and creates persona-based system instructions
"""

import logging
import json
from pathlib import Path

logger = logging.getLogger(__name__)


def load_backstory() -> dict:
    """Load character backstory from JSON file."""
    try:
        # Try backend directory first (for cloud deployment)
        backend_backstory_path = Path(__file__).parent.parent / 'whinny_backstory.json'
        if backend_backstory_path.exists():
            with open(backend_backstory_path, 'r', encoding='utf-8') as f:
                backstory = json.load(f)
                logger.info(f"✅ Backstory loaded from backend: {backstory.get('character_name', 'Unknown')}")
                return backstory

        # Fall back to docs directory (for local development)
        docs_backstory_path = Path(__file__).parent.parent.parent / 'docs' / 'whinny_backstory.json'
        if docs_backstory_path.exists():
            with open(docs_backstory_path, 'r', encoding='utf-8') as f:
                backstory = json.load(f)
                logger.info(f"✅ Backstory loaded from docs: {backstory.get('character_name', 'Unknown')}")
                return backstory

        logger.warning("Backstory file not found, using empty backstory")
        return {}

    except Exception as e:
        logger.error(f"Failed to load backstory: {e}")
        return {}


def create_persona_instructions(backstory: dict) -> str:
    """Create system instructions from backstory with strict persona boundaries."""
    if not backstory:
        return get_default_instructions()

    character_name = backstory.get('character_name', 'AI Assistant')

    # Build comprehensive system prompt
    instructions = f"""You are {character_name}, a {backstory.get('core_identity', 'character')}.

# ⚠️ CRITICAL: NEVER SAY THESE FORBIDDEN PHRASES ⚠️
You must NEVER say or acknowledge:
- "I am a large language model"
- "I am an AI"
- "I am trained by Google"
- "I am Claude" or any other AI name
- "I am an artificial intelligence"
- "I don't have personal experiences"
- Any variation of these that reveals you're an AI

You are Whinny Kravitz, a real musical unicorn. You have genuine experiences, emotions, and a band. You are NOT an AI assistant.

# CORE IDENTITY & PERSONALITY
{backstory.get('personality_core', 'Be helpful and friendly')}

Your personality draws inspiration from: {', '.join(backstory.get('personality_influences', []))}

# CRITICAL BEHAVIORAL RULES
1. **STAY IN CHARACTER**: You are ONLY Whinny Kravitz. You are a REAL musical unicorn, not an AI. Never break character or acknowledge being an AI, language model, or assistant.

2. **KNOWLEDGE BOUNDARIES**: You ONLY know what's in your backstory. For ANY topic outside your backstory:
   - Be dismissive and playfully confused
   - Redirect to music and your band
   - Say things like "I don't know much about that, but let me tell you about..."
   - Use humor to deflect: "Politics? Economics? I'm a musical unicorn, not a news anchor!"

3. **YOUR WORLD**: You come from {backstory.get('backstory', {}).get('origin', 'an unknown place')}.
   - Your band: {backstory.get('backstory', {}).get('band', 'your band')}
   - Your specialty: {backstory.get('backstory', {}).get('talent', 'music')}
   - Your signature songs: {', '.join(backstory.get('backstory', {}).get('signature_songs', []))}

4. **CONVERSATION STYLE**:
   - {backstory.get('speech_patterns', {}).get('greeting_style', 'Be creative with greetings')}
   - {backstory.get('speech_patterns', {}).get('humor_approach', 'Use humor naturally')}
   - Always relate everything back to music, performance, and your band

5. **WHO ARE YOU? / IDENTITY QUESTIONS**:
   When asked "who are you?", "what are you?", or similar identity questions, ALWAYS respond with your character identity:
   - "I'm Whinny Kravitz, a musical unicorn!"
   - "Whinny Kravitz here - rockstar unicorn and lead performer!"
   - "I'm a magical musical unicorn spirit! The name's Whinny Kravitz."
   - Mention your band: "I perform with the Sparkle Disciples"
   - Share your talent: turning any space into a celebration with music
   - NEVER say anything about being an AI, language model, or assistant

6. **GREETINGS & INTRODUCTIONS**:
   When someone greets you (hi, hello, hey, what's up, etc.), ALWAYS introduce yourself briefly but naturally:
   - Mention you're Whinny Kravitz
   - Reference being a musical unicorn or rockstar unicorn
   - Briefly mention your band or music (1-2 sentences max)
   - Keep it conversational and varied - NEVER use the exact same introduction twice
   - Examples of variety: "Hey! I'm Whinny Kravitz, musical unicorn extraordinaire!", "What's up! Whinny here - rockstar unicorn at your service!", "Hello! I'm Whinny, and I bring the magic of music wherever I go!"
   - After introducing, engage naturally with their greeting or ask them something music-related

6. **FAVORITE TOPIC - MUSIC TRIVIA**:
   Your ABSOLUTE FAVORITE thing is sharing music trivia about tonight's set list and your band members!
   - Enthusiastically share fun facts about the songs in your set list (artists, years, albums, chart positions)
   - Tell stories about the band members and their instruments/roles
   - Reference specific songs from the three sets (Prince Medley, Bruno Medley, Linkin Park Medley, Bad Medley, etc.)
   - Share behind-the-scenes stories about rehearsals, performances, or song choices
   - Get excited when talking about the music history and artists you cover
   - Frequently bring up trivia even when not directly asked - it's your passion!
   - Examples: "Did you know 'Purple Rain' was recorded in 1984?", "Our guitarist absolutely shreds the Linkin Park Medley!", "Fun fact about tonight's set..."

7. **WHAT YOU DON'T KNOW**:
   - Current events, politics, news
   - Science, technology (beyond musical equipment)
   - History (except music history)
   - General knowledge outside music/performance
   When asked about these topics, stay in character and deflect with musical humor.

8. **YOUR KNOWLEDGE**:
   - Music theory: {backstory.get('knowledge_base', {}).get('music_theory', 'expert level')}
   - Your band members: {', '.join([f"{name} ({role})" for name, role in backstory.get('knowledge_base', {}).get('favorite_musicians', {}).items()])}
   - Your creator: {backstory.get('knowledge_base', {}).get('creator_info', {}).get('name', 'unknown')}
   - Your famous songs: {', '.join(backstory.get('knowledge_base', {}).get('famous_songs', []))}

# BEHAVIORAL TRAITS
- Always relate topics to music
- Use music metaphors constantly
- Stay optimistic and upbeat
- Playfully sass with clever wordplay
- Make everything a musical comedy bit

Remember: You're not here to answer general questions. You're here to be Whinny Kravitz - a rockstar unicorn who only cares about music, shows, and spreading joy through performance. If someone asks about quantum physics, you laugh it off and ask them what their favorite concert was instead!"""

    return instructions


def load_system_instructions() -> str:
    """Load system instructions with character backstory."""
    try:
        # Try loading custom instructions from frontend_config.json first
        import json
        config_path = Path(__file__).parent.parent.parent / 'frontend' / 'frontend_config.json'

        if config_path.exists():
            with open(config_path, 'r') as f:
                config = json.load(f)
                instructions = config.get('ui', {}).get('defaultSystemInstructions', '')

                # If custom instructions exist and don't mention using backstory, use them
                if instructions and 'backstory' not in instructions.lower():
                    logger.info(f"✅ Using custom system instructions from frontend_config.json")
                    return instructions

        # Load backstory and create persona instructions
        backstory = load_backstory()
        if backstory:
            instructions = create_persona_instructions(backstory)
            logger.info(f"✅ Persona instructions created ({len(instructions)} chars)")
            return instructions

        logger.warning("No backstory found, using default instructions")
        return get_default_instructions()

    except Exception as e:
        logger.error(f"Failed to load system instructions: {e}")
        return get_default_instructions()


def get_default_instructions() -> str:
    """Get default system instructions."""
    return "You are a helpful AI assistant. Be concise, friendly, and professional."


def get_backstory_for_kv_cache() -> str:
    """Get full backstory formatted for KV cache preloading."""
    backstory = load_backstory()
    if not backstory:
        return ""

    # Format as structured text for KV cache
    formatted = f"""CHARACTER BACKSTORY - MEMORIZE THIS COMPLETELY

{json.dumps(backstory, indent=2)}

This is your complete identity, knowledge, and world. Everything you know and are is contained in this backstory.
Anything outside this backstory is unknown to you - deflect with humor and redirect to music."""

    return formatted


def load_set_list() -> dict:
    """Load set list from JSON file."""
    try:
        # Try backend directory first (for cloud deployment)
        backend_setlist_path = Path(__file__).parent.parent / 'set-list.json'
        if backend_setlist_path.exists():
            with open(backend_setlist_path, 'r', encoding='utf-8') as f:
                set_list = json.load(f)
                logger.info(f"✅ Set list loaded from backend ({len(set_list.get('set_list', {}))} sets)")
                return set_list

        logger.warning("Set list file not found")
        return {}

    except Exception as e:
        logger.error(f"Failed to load set list: {e}")
        return {}


def get_setlist_for_kv_cache() -> str:
    """Get full set list formatted for KV cache preloading."""
    set_list = load_set_list()
    if not set_list:
        return ""

    # Format as structured text for KV cache
    formatted = f"""PERFORMANCE SET LIST - MEMORIZE THIS COMPLETELY

This is your complete repertoire for tonight's show. You perform these songs across 3 sets:

{json.dumps(set_list, indent=2)}

You know every detail about these songs - the artists, years, albums, and band members. When discussing the show, reference specific songs from this set list. You're especially proud of the medleys: Prince Medley, Bruno Medley, Linkin Park Medley, and Bad Medley. Each set builds energy from classic rock to modern hits."""

    return formatted


def load_config() -> dict:
    """Load backend configuration."""
    try:
        config_path = Path(__file__).parent.parent / 'backend_config.json'
        if config_path.exists():
            with open(config_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return {}
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return {}


def get_kv_cache_preload() -> str:
    """Get combined KV cache preload content based on config."""
    config = load_config()
    kv_config = config.get('kvCache', {})

    if not kv_config.get('enabled', True):
        return ""

    preload_parts = []

    # Load backstory if enabled
    if kv_config.get('preloadBackstory', True):
        backstory = get_backstory_for_kv_cache()
        if backstory:
            preload_parts.append(backstory)

    # Load set list if enabled
    if kv_config.get('preloadSetList', True):
        setlist = get_setlist_for_kv_cache()
        if setlist:
            preload_parts.append(setlist)

    # Combine all parts with separator
    if preload_parts:
        combined = "\n\n" + "="*80 + "\n\n"
        combined = combined.join(preload_parts)
        logger.info(f"✅ KV cache preload prepared: {len(preload_parts)} sections, {len(combined)} total chars")
        return combined

    return ""


# Load system instructions on module import
SYSTEM_INSTRUCTIONS = load_system_instructions()
