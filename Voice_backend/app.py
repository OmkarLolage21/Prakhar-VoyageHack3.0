from __future__ import annotations

import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from sarvamai import SarvamAI
except Exception:  # pragma: no cover - optional dependency at runtime
    SarvamAI = None  # type: ignore


load_dotenv()


app = FastAPI(title="Voice Planner Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


MONTHS: Dict[str, int] = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

DAY_WORDS: Dict[str, int] = {
    "one": 1,
    "first": 1,
    "today": 1,
    "two": 2,
    "second": 2,
    "tomorrow": 2,
    "three": 3,
    "third": 3,
    "four": 4,
    "fourth": 4,
    "five": 5,
    "fifth": 5,
    "six": 6,
    "sixth": 6,
    "seven": 7,
    "seventh": 7,
    "eight": 8,
    "eighth": 8,
    "nine": 9,
    "ninth": 9,
    "ten": 10,
    "tenth": 10,
}


@dataclass
class ParsedDate:
    year: int
    month: int
    day: int

    def to_iso(self) -> str:
        return f"{self.year:04d}-{self.month:02d}-{self.day:02d}"


class VoiceContext(BaseModel):
    stage: str = "discover"
    destination: str = ""
    origin: str = ""
    trip_name: str = ""
    planned_days: int = 0
    known_places: List[str] = Field(default_factory=list)
    hotel_results: List[str] = Field(default_factory=list)
    transport_results: List[str] = Field(default_factory=list)


class VoiceCommandRequest(BaseModel):
    text: str
    context: VoiceContext = Field(default_factory=VoiceContext)


class VoiceCommandResponse(BaseModel):
    intent: str
    stage: str
    reply: str
    actions: List[Dict[str, Any]]
    entities: Dict[str, Any]


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def parse_days(text: str) -> Optional[int]:
    match = re.search(r"(\d{1,2})\s*day", text, flags=re.IGNORECASE)
    if match:
        days = int(match.group(1))
        if days <= 0:
            return None
        return min(days, 30)

    word_match = re.search(
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten)\s*[- ]*day(?:s)?\b",
        text,
        flags=re.IGNORECASE,
    )
    if not word_match:
        return None
    word_value = word_match.group(1).lower().strip()
    word_to_num = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "seven": 7,
        "eight": 8,
        "nine": 9,
        "ten": 10,
    }
    days = int(word_to_num.get(word_value, 0))
    if days <= 0:
        return None
    return min(days, 30)


def parse_destination(text: str) -> str:
    source = normalize_space(text)
    if not source:
        return ""

    patterns = [
        r"\bfor\s+(?:a|an|the)?\s*(?:\w+\s*-\s*day|\d{1,2}\s*day(?:s)?)?\s*trip\s+to\s+([a-zA-Z ,]+)$",
        r"\bfor\s+(?:a|an|the)?\s*(?:\w+\s*-\s*day|\d{1,2}\s*day(?:s)?)?\s*trip\s+to\s+([a-zA-Z ,]+)",
        r"\bfor\s+(?:a|an|the)?\s*(?:\w+\s*-\s*day|\d{1,2}\s*day(?:s)?)?\s*([a-zA-Z ,]+?)\s+trip\b",
        r"\b([a-zA-Z ,]+?)\s+trip\b",
        r"\btrip\s+to\s+([a-zA-Z ,]+)$",
        r"\btrip\s+to\s+([a-zA-Z ,]+)",
        r"\bto\s+([a-zA-Z ,]+)$",
        r"\bto\s+([a-zA-Z ,]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = normalize_space(match.group(1))
        # Strip leading phrasing noise if present.
        candidate = re.sub(r"^(a|an|the)\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(
            r"^(suggest|recommend|plan|tell|show|give|find|need|want)\s+(?:me\s+)?(?:a|an|the)?\s*(?:place|places|itinerary)?\s*(?:for\s+)?",
            "",
            candidate,
            flags=re.IGNORECASE,
        )
        candidate = re.sub(r"^(?:\d+\s*day(?:s)?\s*)?trip\s+to\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(
            r"^(?:one|two|three|four|five|six|seven|eight|nine|ten)\s*[- ]*day(?:s)?\s*",
            "",
            candidate,
            flags=re.IGNORECASE,
        )
        candidate = re.sub(r"^\d+\s*day(?:s)?\s+", "", candidate, flags=re.IGNORECASE)
        # Trim trailing qualifiers not part of destination.
        candidate = re.sub(r"\b(under|within|with)\b.*$", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\btrip\b$", "", candidate, flags=re.IGNORECASE)
        candidate = candidate.strip(" ,.")
        if candidate:
            return candidate
    return ""


def parse_date_token(day: str, month_text: str, year: str) -> Optional[ParsedDate]:
    try:
        day_n = int(day)
        year_n = int(year)
        month_n = MONTHS.get(month_text.lower().strip())
        if not month_n:
            return None
        if day_n <= 0 or day_n > 31:
            return None
        if year_n < 2020 or year_n > 2100:
            return None
        return ParsedDate(year=year_n, month=month_n, day=day_n)
    except Exception:
        return None


def parse_dates_range(text: str) -> Dict[str, str]:
    compact = re.sub(r"(\d)([a-zA-Z])", r"\1 \2", text)
    compact = re.sub(r"([a-zA-Z])(\d)", r"\1 \2", compact)
    matches = re.findall(
        r"(\d{1,2})\s*([a-zA-Z]{3,9})\s*,?\s*(\d{4})",
        compact,
        flags=re.IGNORECASE,
    )
    parsed = [parse_date_token(day, mon, year) for (day, mon, year) in matches]
    parsed = [item for item in parsed if item is not None]
    if len(parsed) >= 2:
        return {"start_date": parsed[0].to_iso(), "end_date": parsed[1].to_iso()}
    return {}


def parse_trip_name(text: str) -> str:
    source = normalize_space(text)
    if not source:
        return ""
    patterns = [
        r"\btrip\s*name\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)",
        r"\bname\s+of\s+(?:the\s+)?trip\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)",
        r"\bname\s+of\s+(?:this\s+)?trip\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)",
        r"\btrip'?s\s+name\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)",
        r"\bmy\s+trip\s+name\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)",
    ]
    value = ""
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE)
        if not match:
            continue
        value = normalize_space(match.group(1)).strip(" ,.")
        if value:
            break
    if not value:
        # Loose fallback for noisy transcripts like "trip name hindi trip"
        loose = re.search(r"\btrip(?:'s)?\s+name\b\s*(?:is|=|:)?\s*([a-zA-Z0-9 '._-]+)", source, flags=re.IGNORECASE)
        if loose:
            value = normalize_space(loose.group(1)).strip(" ,.")
        if not value:
            return ""
    # Trim trailing clauses when user provides multiple details in one utterance.
    value = re.split(r"\b(and|origin|destination|date|dates|from|start|end|budget)\b", value, flags=re.IGNORECASE)[0].strip(" ,.")
    if len(value) > 60:
        value = value[:60].strip()
    return value


def parse_origin(text: str) -> str:
    match = re.search(r"origin\s*(?:is|=|:)?\s*([a-zA-Z ,]+)", text, flags=re.IGNORECASE)
    if not match:
        return ""
    return normalize_space(match.group(1)).strip(" ,.")


def day_from_token(token: str) -> Optional[int]:
    value = normalize_space(token).lower()
    value = re.sub(r"^day\s*", "", value).strip()
    if not value:
        return None
    if value.isdigit():
        day = int(value)
        return day if day > 0 else None
    return DAY_WORDS.get(value)


def parse_day_location(text: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    day_match = re.search(
        r"(?:day\s*)?(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|today|tomorrow)",
        text,
        flags=re.IGNORECASE,
    )
    if day_match:
        parsed_day = day_from_token(day_match.group(1))
        if parsed_day:
            out["day"] = parsed_day

    location_match = re.search(
        r"(?:day\s*(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)|first day|second day|third day|fourth day|fifth day)\s*,?\s*([a-zA-Z ,]+)$",
        text,
        flags=re.IGNORECASE,
    )
    if location_match:
        out["location"] = normalize_space(location_match.group(1)).strip(" ,.")
    return out


def parse_place_assignments(text: str) -> List[Dict[str, Any]]:
    lowered = text.strip()
    assignments: List[Dict[str, Any]] = []
    normalized = re.sub(r"\s+and\s+", " | ", lowered, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+then\s+", " | ", normalized, flags=re.IGNORECASE)
    chunks = [chunk.strip(" ,.") for chunk in normalized.split("|") if chunk.strip(" ,.")]
    token_pattern = r"(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|today|tomorrow)"
    for chunk in chunks:
        match = re.search(
            rf"(?:add\s+)?(.+?)\s+(?:to|for|on|into)\s+(?:the\s+)?(?:(?:day\s*)?({token_pattern})|((?:first|second|third|fourth|fifth|today|tomorrow))\s+day)",
            chunk,
            flags=re.IGNORECASE,
        )
        if not match:
            continue
        place = normalize_space(match.group(1)).strip(" ,.")
        place = re.sub(r"^add\s+", "", place, flags=re.IGNORECASE).strip()
        token_value = match.group(2) or match.group(3) or ""
        day = day_from_token(token_value) or 0
        if place and day > 0:
            assignments.append({"place": place, "day": day})
    return assignments


def parse_named_item(text: str, leading: str) -> str:
    pattern = rf"{leading}\s+(.+)"
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return ""
    value = normalize_space(match.group(1))
    value = re.sub(r"^(the|a|an)\s+", "", value, flags=re.IGNORECASE).strip(" ,.")
    return value


def parse_cart_target_name(text: str) -> str:
    value = normalize_space(text)
    if not value:
        return ""
    patterns = [
        r"add\s+(.+?)\s+to\s+cart",
        r"add\s+to\s+cart\s+(.+)$",
        r"cart\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, value, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = normalize_space(match.group(1))
        candidate = re.sub(r"^(the|a|an)\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"^(hotel|transport|flight|train|bus|cab)\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s+(hotel|transport|flight|train|bus|cab)$", "", candidate, flags=re.IGNORECASE)
        candidate = candidate.strip(" ,.")
        if candidate:
            return candidate
    return ""


def parse_view_target_name(text: str) -> str:
    value = normalize_space(text)
    if not value:
        return ""
    value_for_match = re.sub(r"[.!?]+$", "", value).strip()
    patterns = [
        r"(?:view|show|see|open)\s+(?:the\s+)?(?:hotel\s+)?details(?:\s+(?:for|of))?\s+(.+)$",
        r"(?:details?|information)\s+(?:for|of)\s+(?:hotel\s+)?(.+)$",
        r"i\s+want\s+to\s+(?:view|show|see|open)\s+(?:the\s+)?(?:hotel\s+)?details(?:\s+(?:for|of))?\s+(.+)$",
        r"^(.+?)\s+(?:view|show|see|open)\s+(?:the\s+)?(?:hotel\s+)?details?$",
    ]
    for pattern in patterns:
        match = re.search(pattern, value_for_match, flags=re.IGNORECASE)
        if not match:
            continue
        candidate = normalize_space(match.group(1))
        candidate = re.sub(r"^(the|a|an)\s+", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\b(please|now)\b$", "", candidate, flags=re.IGNORECASE).strip(" ,.")
        if candidate:
            return candidate
    return ""


def affirmative(text: str) -> bool:
    return bool(re.search(r"\b(yes|yeah|yup|sure|ok|okay|proceed|continue)\b", text, flags=re.IGNORECASE))


def command_from_text(text: str, context: VoiceContext) -> VoiceCommandResponse:
    cleaned = normalize_space(text)
    lowered = cleaned.lower()
    actions: List[Dict[str, Any]] = []
    entities: Dict[str, Any] = {}
    stage = context.stage or "discover"

    place_request_intent = (
        (
            re.search(r"\b(suggest|recommend|plan|tell|show|give|find|need|want)\b", lowered)
            and re.search(r"\b(place|places|trip|itinerary|destination)\b", lowered)
        )
        or re.search(r"\bplaces?\b.*\b(\d{1,2}\s*day|day\s*trip|trip)\b", lowered)
        or re.search(r"\b(\d{1,2}\s*day|day\s*trip)\b.*\bplaces?\b", lowered)
    )
    if place_request_intent:
        days = parse_days(cleaned) or context.planned_days or 3
        destination = parse_destination(cleaned) or context.destination
        entities.update({"days": days, "destination": destination})
        actions.append({"type": "search_places", "days": days, "destination": destination})
        return VoiceCommandResponse(
            intent="suggest_places",
            stage="itinerary_selection",
            reply=f"Searching places for a {days} day trip to {destination}.",
            actions=actions,
            entities=entities,
        )

    assignments = parse_place_assignments(cleaned)
    if assignments:
        entities["assignments"] = assignments
        actions.append({"type": "add_places_to_days", "assignments": assignments})
        return VoiceCommandResponse(
            intent="add_places_to_days",
            stage="collect_trip_meta",
            reply="I have added those places. Please confirm origin, trip name, and dates.",
            actions=actions,
            entities=entities,
        )

    trip_name = parse_trip_name(cleaned)
    origin = parse_origin(cleaned)
    date_range = parse_dates_range(cleaned)
    if trip_name or origin or date_range:
        if trip_name:
            entities["trip_name"] = trip_name
        if origin:
            entities["origin"] = origin
        entities.update(date_range)
        actions.append({"type": "update_trip_meta", **entities})
        return VoiceCommandResponse(
            intent="update_trip_meta",
            stage="hotel_confirmation",
            reply="I have updated trip details. Should we move to hotel search?",
            actions=actions,
            entities=entities,
        )

    if stage == "hotel_confirmation" and affirmative(cleaned):
        actions.append({"type": "switch_tab", "tab": "hotels"})
        return VoiceCommandResponse(
            intent="go_hotels",
            stage="hotel_query",
            reply="Moved to hotel search. Tell me day number and location.",
            actions=actions,
            entities=entities,
        )

    hotel_day_phrase = re.search(
        r"\b(day\s*(?:\d{1,2}|one|two|three|four|five)|first day|second day|third day)\b",
        lowered,
    )
    if (re.search(r"\b(hotel|stay|accommodation)\b", lowered) and hotel_day_phrase) or (
        stage in {"hotel_query", "hotel_results"} and hotel_day_phrase
    ):
        parsed = parse_day_location(cleaned)
        if parsed:
            entities.update(parsed)
            actions.append({"type": "search_hotels", **parsed})
            return VoiceCommandResponse(
                intent="hotel_search",
                stage="hotel_results",
                reply="Searching hotels for that day and location.",
                actions=actions,
                entities=entities,
            )

    if (
        (
            re.search(r"\b(view|show|see|open)\b", lowered)
            and re.search(r"\b(details?|hotel|information)\b", lowered)
        )
        or re.search(r"\b(details?|information)\s+(?:for|of)\b", lowered)
        or (stage in {"hotel_query", "hotel_results"} and re.search(r"\b(details?|information)\b", lowered))
    ):
        hotel_name = parse_view_target_name(cleaned)
        if not hotel_name:
            hotel_name = parse_named_item(
                cleaned,
                r"(?:view|show|see|open)\s+(?:the\s+)?(?:hotel\s+)?details(?:\s+(?:for|of))?"
            )
        if not hotel_name:
            hotel_name = parse_named_item(cleaned, r"(?:view|show|see|open)")
        entities["hotel_name"] = hotel_name
        actions.append({"type": "view_hotel_details", "hotel_name": hotel_name})
        return VoiceCommandResponse(
            intent="hotel_view_details",
            stage="hotel_results",
            reply="Opening hotel details and reading summary.",
            actions=actions,
            entities=entities,
        )

    if (
        re.search(r"\badd\b", lowered)
        and re.search(r"\bcart\b", lowered)
        and (
            re.search(r"\bhotel\b", lowered)
            or (stage in {"hotel_query", "hotel_results"} and not re.search(r"\b(transport|flight|train|bus|cab)\b", lowered))
        )
    ):
        hotel_name = parse_cart_target_name(cleaned) or parse_named_item(cleaned, r"(?:add(?: to cart)?(?: hotel)?|add hotel)")
        entities["hotel_name"] = hotel_name
        actions.append({"type": "add_hotel_to_cart", "hotel_name": hotel_name})
        return VoiceCommandResponse(
            intent="hotel_add_to_cart",
            stage="hotel_results",
            reply="Adding hotel to cart.",
            actions=actions,
            entities=entities,
        )

    if re.search(r"\b(transport|flight|train|bus|cab)\b", lowered) and re.search(r"\b(plan|search|show|suggest)\b", lowered):
        actions.append({"type": "switch_tab", "tab": "transport"})
        actions.append({"type": "search_transport"})
        return VoiceCommandResponse(
            intent="transport_search",
            stage="transport_results",
            reply="Searching transport options for your trip legs.",
            actions=actions,
            entities=entities,
        )

    if (
        re.search(r"\badd\b", lowered)
        and re.search(r"\bcart\b", lowered)
        and (
            re.search(r"\b(transport|flight|train|bus|cab)\b", lowered)
            or stage == "transport_results"
        )
    ):
        option_name = parse_cart_target_name(cleaned) or parse_named_item(cleaned, r"(?:add(?: to cart)?(?: transport)?|add transport)")
        entities["option_name"] = option_name
        actions.append({"type": "add_transport_to_cart", "option_name": option_name})
        return VoiceCommandResponse(
            intent="transport_add_to_cart",
            stage="transport_results",
            reply="Adding transport option to cart.",
            actions=actions,
            entities=entities,
        )

    if re.search(r"\b(checkout|book|payment|pay now)\b", lowered):
        actions.append({"type": "checkout"})
        return VoiceCommandResponse(
            intent="checkout",
            stage="checkout",
            reply="Proceeding to checkout.",
            actions=actions,
            entities=entities,
        )

    if affirmative(cleaned) and stage == "hotel_results":
        actions.append({"type": "switch_tab", "tab": "transport"})
        actions.append({"type": "search_transport"})
        return VoiceCommandResponse(
            intent="go_transport",
            stage="transport_results",
            reply="Moving to transport planning.",
            actions=actions,
            entities=entities,
        )

    return VoiceCommandResponse(
        intent="unknown",
        stage=stage,
        reply=(
            "I did not fully catch that. You can say: suggest places for a 3 day trip, "
            "add place to day, confirm trip details, search hotels, search transport, or checkout."
        ),
        actions=[],
        entities={},
    )


def _extract_transcript(response: Any) -> str:
    if response is None:
        return ""
    if hasattr(response, "transcript"):
        return str(getattr(response, "transcript") or "").strip()
    if isinstance(response, dict):
        for key in ("transcript", "text", "utterance"):
            value = response.get(key)
            if value:
                return str(value).strip()
    for attr in ("model_dump", "dict"):
        if hasattr(response, attr):
            try:
                payload = getattr(response, attr)()
                if isinstance(payload, dict):
                    for key in ("transcript", "text", "utterance"):
                        value = payload.get(key)
                        if value:
                            return str(value).strip()
            except Exception:
                pass
    return str(response or "").strip()


def _to_bool(value: Any, default: bool = True) -> bool:
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "voice_backend",
        "time": datetime.utcnow().isoformat() + "Z",
        "sarvam_enabled": bool(os.getenv("SARVAM_API_KEY")),
    }


@app.post("/voice/command", response_model=VoiceCommandResponse)
def voice_command(payload: VoiceCommandRequest) -> VoiceCommandResponse:
    return command_from_text(payload.text, payload.context)


@app.post("/voice/speak")
def voice_speak(payload: Dict[str, Any]) -> Dict[str, Any]:
    text = normalize_space(str(payload.get("text") or ""))
    if not text:
        return {"error": "text is required"}
    target_language_code = normalize_space(str(payload.get("target_language_code") or "en-IN")) or "en-IN"

    api_key = os.getenv("SARVAM_API_KEY", "").strip()
    if target_language_code.lower() in {"en", "en-in"} or not api_key or SarvamAI is None:
        # Browser speech synthesis handles audio generation on frontend.
        return {"text": text, "mode": "client_speech_synthesis", "language_code": target_language_code}

    try:
        client = SarvamAI(api_subscription_key=api_key)
        translated = client.text.translate(
            input=text,
            source_language_code="auto",
            target_language_code=target_language_code,
        )
        translated_text = normalize_space(str(getattr(translated, "translated_text", "") or ""))
        if translated_text:
            return {
                "text": translated_text,
                "mode": "sarvam_translate",
                "language_code": target_language_code,
            }
    except Exception:
        pass

    return {"text": text, "mode": "client_speech_synthesis", "language_code": target_language_code}


@app.post("/voice/transcribe")
async def voice_transcribe(
    audio: UploadFile = File(...),
    language_code: str = Form("unknown"),
    translate_to_english: str = Form("true"),
) -> Dict[str, Any]:
    api_key = os.getenv("SARVAM_API_KEY", "").strip()
    if not api_key or SarvamAI is None:
        return {"text": "", "error": "SARVAM_API_KEY missing or sarvamai not installed"}

    suffix = Path(audio.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        client = SarvamAI(api_subscription_key=api_key)
        env_default_translate = _to_bool(os.getenv("SARVAM_TRANSLATE_TO_ENGLISH", "true"), True)
        should_translate = _to_bool(translate_to_english, env_default_translate) and language_code.lower() not in {
            "en",
            "en-in",
            "unknown",
        }
        mode = "translate" if should_translate else "transcribe"
        with open(tmp_path, "rb") as f:
            response = client.speech_to_text.transcribe(
                file=f,
                model="saaras:v3",
                mode=mode,
                language_code=language_code,
            )
        text = _extract_transcript(response)
        return {"text": text, "language_code": language_code, "mode": mode}
    except Exception as exc:
        return {"text": "", "error": str(exc)}
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8002") or "8002")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
