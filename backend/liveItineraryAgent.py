from phi.agent import Agent
from phi.model.groq import Groq
from phi.tools.calculator import Calculator
from phi.tools.duckduckgo import DuckDuckGo
from dotenv import load_dotenv
import os
import json

load_dotenv()


class LiveItineraryAgent:
    """Agent for real-time itinerary adjustments based on mood and dynamic factors."""

    def __init__(self):
        api_key_groq = os.getenv("GROQ_API_KEY")
        # Keep compatibility with this repo's existing pattern (some agents hardcode the key).
        # Prefer env var if available.
        if not api_key_groq:
            api_key_groq = os.getenv("GROQ_API_KEY_FALLBACK")

        self.agent = Agent(
            model=Groq(
                id="llama-3.3-70b-versatile",
                api_key="",
                max_tokens=8000,
            ),
            markdown=True,
            tools=[
                DuckDuckGo(),
                Calculator(add=True, subtract=True, multiply=True, divide=True),
            ],
            description=(
                "You are an intelligent live itinerary manager that can dynamically adjust travel plans "
                "based on real-time mood, energy levels, weather, and other factors."
            ),
            instructions=[
                """Your role is to instantly re-route and optimize itineraries when users report their current state:

1. Analyze Current Mood/State: Understand if the group is tired, energetic, hungry, or facing other issues.
2. Evaluate Current Itinerary: Review what's planned for the rest of the day.
3. Smart Replacement: Find suitable alternatives that match their current state:
   - tired -> spa, cafe, light activities, shorter distances
   - energetic -> adventure activities, longer tours, hiking
   - hungry -> nearby restaurants with good ratings
   - weather issues -> indoor alternatives
4. Optimize logistics:
   - cancel unsuitable activities
   - find available slots at alternative venues
   - re-route to minimize travel time
   - adjust remaining schedule to accommodate changes
5. Preserve value: Ensure the day remains enjoyable and isn't wasted.

Always search for:
- real-time ratings and reviews
- distance from current location
- operating hours
- booking requirements

Provide specific, actionable recommendations. Include booking links when possible.
"""
            ],
            show_tool_calls=True,
            add_datetime_to_instructions=True,
        )

    def adjust_itinerary(self, current_itinerary, mood_state, current_time, current_location):
        """Return an adjusted itinerary structure.

        Args:
            current_itinerary: list/dict of today's planned activities
            mood_state: tired/energetic/hungry/relaxed/adventurous/etc
            current_time: string time (e.g. "14:30")
            current_location: user location string
        """

        output_schema = {
            "activities_to_cancel": ["string"],
            "alternative_activities": [
                {
                    "name": "string",
                    "location": "string",
                    "reason": "string",
                    "estimated_time": "string",
                }
            ],
            "updated_schedule": [
                {
                    "time": "string",
                    "name": "string",
                    "location": "string",
                    "status": "upcoming",
                }
            ],
            "estimated_cost_impact": "string",
            "summary": "string",
        }

        query = f"""
CURRENT SITUATION:
- Time: {current_time}
- Location: {current_location}
- Group Mood/State: {mood_state}

CURRENT ITINERARY FOR TODAY (may be empty):
{json.dumps(current_itinerary, indent=2)}

TASK: The group reports they are "{mood_state}" right now at {current_location}.

CRITICAL REQUIREMENTS:
1) Search for SPECIFIC, REAL places near {current_location} using DuckDuckGo
2) Include ACTUAL place names (e.g., "Cafe Coffee Day, MG Road" not just "visit a cafe")
3) Include addresses, phone numbers, and booking links when available
4) Check current operating hours and availability
5) Provide distance from current location
6) Include ratings and reviews if available

You must do all of the following:
1) Identify activities to cancel/modify (if any) - use EXACT names from itinerary
2) Suggest at least 3 SPECIFIC, REAL alternatives with:
   - Exact name and address
   - Distance from {current_location}
   - Operating hours
   - Booking link or phone number
   - Why it matches the "{mood_state}" mood
3) Propose an updated schedule for the rest of the day (at least 3 entries with specific times)
4) Include cost impact notes with actual price ranges

EXAMPLE OF GOOD OUTPUT:
{{
  "alternative_activities": [
    {{
      "name": "The Flour Works Cafe, Koregaon Park",
      "location": "Lane 5, Koregaon Park, Pune - 2.3 km from current location",
      "reason": "Cozy cafe perfect for tired travelers, known for comfortable seating and quiet ambiance. Open until 11 PM.",
      "estimated_time": "1-2 hours",
      "booking_info": "Walk-in available, call +91-20-1234-5678"
    }}
  ]
}}

OUTPUT REQUIREMENTS:
- Respond with STRICT JSON ONLY (no markdown, no code fences, no extra text).
- Use REAL place names, not generic suggestions
- Include specific addresses and contact information
- Use this exact schema:
{json.dumps(output_schema, indent=2)}
"""

        response = self.agent.run(query, stream=False)
        content = response.content if hasattr(response, "content") else str(response)

        def _extract_json(text: str):
            trimmed = text.strip()

            if trimmed.startswith("```"):
                # Remove any fenced blocks if the model ignored the instruction
                trimmed = trimmed.strip("`")

            start = trimmed.find("{")
            end = trimmed.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return None
            candidate = trimmed[start : end + 1]
            try:
                return json.loads(candidate)
            except Exception:
                return None

        parsed = _extract_json(content)

        if isinstance(parsed, dict):
            parsed.setdefault("activities_to_cancel", [])
            parsed.setdefault("alternative_activities", [])
            parsed.setdefault("updated_schedule", [])
            parsed.setdefault("estimated_cost_impact", "")
            parsed.setdefault("summary", "")
            # Keep raw content for debugging/UI transparency
            parsed["reasoning"] = content
            return parsed

        # Fallback: best-effort parsing of markdown-like outputs
        result = {
            "activities_to_cancel": [],
            "alternative_activities": [],
            "updated_schedule": [],
            "estimated_cost_impact": "",
            "reasoning": content,
            "summary": "",
        }

        lines = content.split("\n")
        current_section = None
        current_alternative = {}

        for line in lines:
            line_stripped = line.strip()

            if "Activities to Cancel" in line_stripped:
                current_section = "cancel"
                continue
            if "Recommended Alternatives" in line_stripped:
                current_section = "alternatives"
                continue
            if "Updated Schedule" in line_stripped:
                current_section = "schedule"
                continue
            if "Cost Impact" in line_stripped:
                current_section = "cost"
                continue

            if line_stripped.startswith(("•", "-")):
                bullet_text = line_stripped.lstrip("•-").strip()

                if current_section == "cancel":
                    if ":" in bullet_text:
                        activity_name = bullet_text.split(":", 1)[0].strip()
                        result["activities_to_cancel"].append(activity_name)
                    else:
                        result["activities_to_cancel"].append(bullet_text)

                elif current_section == "alternatives":
                    if ":" in bullet_text and not bullet_text.lower().startswith(
                        ("recommended venue", "booking", "availability")
                    ):
                        if current_alternative.get("name"):
                            result["alternative_activities"].append(current_alternative)

                        name_part, reason_part = bullet_text.split(":", 1)
                        current_alternative = {
                            "name": name_part.strip(),
                            "location": "",
                            "reason": reason_part.strip(),
                            "estimated_time": "Flexible",
                        }

                elif current_section == "schedule":
                    # Attempt to parse entries like "14:30 - 16:00: Activity"
                    if ":" in bullet_text:
                        time_part, name_part = bullet_text.split(":", 1)
                        result["updated_schedule"].append(
                            {
                                "time": time_part.strip(),
                                "name": name_part.strip(),
                                "location": "See details",
                                "status": "upcoming",
                            }
                        )

            elif current_section == "cost" and line_stripped:
                result["estimated_cost_impact"] += line_stripped + " "

        if current_alternative.get("name"):
            result["alternative_activities"].append(current_alternative)

        result["summary"] = (
            f"Cancelled {len(result['activities_to_cancel'])} activities and suggested "
            f"{len(result['alternative_activities'])} alternatives based on '{mood_state}'."
        )

        return result
