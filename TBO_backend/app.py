from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()

app = Flask(__name__)
CORS(
    app,
    resources={
        r"/*": {
            "origins": [""],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
        }
    },
)

sessions: Dict[str, Dict[str, Any]] = {}
mock_bookings: Dict[str, Dict[str, Any]] = {}


CITY_COORDS: Dict[str, Tuple[float, float]] = {
    "delhi": (28.6139, 77.2090),
    "new delhi": (28.6139, 77.2090),
    "jaipur": (26.9124, 75.7873),
    "udaipur": (24.5854, 73.7125),
    "jodhpur": (26.2389, 73.0243),
    "jaisalmer": (26.9157, 70.9083),
    "ahmedabad": (23.0225, 72.5714),
    "rajkot": (22.3039, 70.8022),
    "surat": (21.1702, 72.8311),
    "mumbai": (19.0760, 72.8777),
    "pune": (18.5204, 73.8567),
    "goa": (15.2993, 74.1240),
    "bengaluru": (12.9716, 77.5946),
    "bangalore": (12.9716, 77.5946),
    "hyderabad": (17.3850, 78.4867),
    "chennai": (13.0827, 80.2707),
    "kolkata": (22.5726, 88.3639),
}

PLACE_CATALOG: Dict[str, List[Tuple[str, str]]] = {
    "rajasthan": [
        ("Amber Fort, Jaipur", "Historic hill fort and palace complex."),
        ("City Palace, Udaipur", "Royal complex overlooking Lake Pichola."),
        ("Mehrangarh Fort, Jodhpur", "Massive fort with panoramic city views."),
        ("Jaisalmer Fort", "Living fort with heritage streets and markets."),
        ("Pushkar Lake", "Pilgrimage town lake and vibrant local bazaar."),
    ],
    "gujarat": [
        ("Statue of Unity", "Iconic landmark and riverfront activity zone."),
        ("Gir National Park", "Wildlife reserve known for Asiatic lions."),
        ("Rani ki Vav, Patan", "UNESCO stepwell with intricate carvings."),
        ("Somnath Temple", "Historic coastal temple destination."),
        ("Sabarmati Riverfront", "Urban promenade in Ahmedabad."),
    ],
    "goa": [
        ("Calangute Beach", "Popular beach with water activities."),
        ("Fort Aguada", "Historic coastal fort and sunset viewpoint."),
        ("Basilica of Bom Jesus", "UNESCO heritage church in Old Goa."),
        ("Dudhsagar Falls", "Scenic multi-tier waterfall."),
        ("Anjuna Flea Market", "Local crafts, food, and shopping."),
    ],
}

CITY_AIRPORT_CODES: Dict[str, str] = {
    "delhi": "DEL",
    "new delhi": "DEL",
    "mumbai": "BOM",
    "pune": "PNQ",
    "jaipur": "JAI",
    "udaipur": "UDR",
    "jodhpur": "JDH",
    "jaisalmer": "JSA",
    "ahmedabad": "AMD",
    "surat": "STV",
    "rajkot": "RAJ",
    "goa": "GOI",
    "hyderabad": "HYD",
    "chennai": "MAA",
    "bengaluru": "BLR",
    "bangalore": "BLR",
    "kolkata": "CCU",
}

CITY_CODE_OVERRIDES: Dict[str, Dict[str, str]] = {
    "abu road rajasthan": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
    "abu road, rajasthan": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
    "abu road   rajasthan": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
    "abu road": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
    "abu rajasthan": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
    "mount abu": {"Code": "105141", "Name": "Abu Road, Rajasthan"},
}

STAR_RATING_MAP: Dict[str, float] = {
    "onestar": 1.0,
    "twostar": 2.0,
    "threestar": 3.0,
    "fourstar": 4.0,
    "fivestar": 5.0,
}


def now_iso() -> str:
    return datetime.utcnow().isoformat()


def get_env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def create_session() -> Dict[str, Any]:
    session_id = str(uuid.uuid4())
    session = {
        "id": session_id,
        "created_at": now_iso(),
        "last_active": now_iso(),
        "chat_history": [],
    }
    sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    session = sessions.get(session_id)
    if not session:
        return None
    session["last_active"] = now_iso()
    return session


def iter_dicts(node: Any) -> Iterable[Dict[str, Any]]:
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from iter_dicts(value)
    elif isinstance(node, list):
        for value in node:
            yield from iter_dicts(value)


def get_by_keys(item: Dict[str, Any], keys: List[str], default: Any = None) -> Any:
    lowered = {str(k).lower(): v for k, v in item.items()}
    for key in keys:
        if key.lower() in lowered:
            return lowered[key.lower()]
    return default


def parse_number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value or "").strip()
    if not text:
        return None
    cleaned = re.sub(r"[^0-9.]", "", text)
    if cleaned.count(".") > 1:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def price_from_dict(item: Dict[str, Any]) -> Optional[float]:
    for key in [
        "Price",
        "PublishedPrice",
        "OfferedPrice",
        "NetAmount",
        "RoomPrice",
        "TotalFare",
        "DisplayRate",
    ]:
        candidate = get_by_keys(item, [key])
        parsed = parse_number(candidate)
        if parsed and parsed > 0:
            return parsed
    for nested in item.values():
        if isinstance(nested, dict):
            parsed = price_from_dict(nested)
            if parsed and parsed > 0:
                return parsed
    return None


def normalize_location_name(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9\s-]", " ", value or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def parse_star_rating(value: Any) -> Optional[float]:
    numeric = parse_number(value)
    if numeric and numeric > 0:
        return numeric
    key = re.sub(r"[^a-z]", "", str(value or "").lower())
    if not key:
        return None
    if key in STAR_RATING_MAP:
        return STAR_RATING_MAP[key]
    match = re.search(r"([1-5])", key)
    if match:
        return float(match.group(1))
    return None


def city_override_for_query(city_name: str) -> Optional[Dict[str, str]]:
    query = normalize_location_name(city_name).lower()
    if not query:
        return None
    query_tokens = set(query.split())
    for raw_key, value in CITY_CODE_OVERRIDES.items():
        key = normalize_location_name(raw_key).lower()
        if not key:
            continue
        if key == query or key in query or query in key:
            return value
        key_tokens = set(key.split())
        if key_tokens and key_tokens.issubset(query_tokens):
            return value
    return None


def airport_code_for_city(city: str) -> Optional[str]:
    key = normalize_location_name(city).lower()
    if key in CITY_AIRPORT_CODES:
        return CITY_AIRPORT_CODES[key]
    for known, code in CITY_AIRPORT_CODES.items():
        if known in key or key in known:
            return code
    return None


def geocode_city(query: str) -> Dict[str, Any]:
    cleaned = normalize_location_name(query)
    if not cleaned:
        return {"latitude": 0, "longitude": 0, "address": query, "source": "empty"}

    key = cleaned.lower()
    if key in CITY_COORDS:
        lat, lng = CITY_COORDS[key]
        return {"latitude": lat, "longitude": lng, "address": cleaned, "source": "catalog"}

    for known, (lat, lng) in CITY_COORDS.items():
        if known in key:
            return {"latitude": lat, "longitude": lng, "address": cleaned, "source": "catalog-fuzzy"}

    token = get_env("MAPBOX_ACCESS_TOKEN")
    if token:
        try:
            url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{requests.utils.quote(cleaned)}.json"
            resp = requests.get(url, params={"limit": 1, "access_token": token}, timeout=8)
            if resp.ok:
                payload = resp.json()
                feature = (payload.get("features") or [None])[0]
                if feature and isinstance(feature, dict):
                    center = feature.get("center") or [0, 0]
                    if len(center) == 2:
                        return {
                            "latitude": float(center[1]),
                            "longitude": float(center[0]),
                            "address": str(feature.get("place_name") or cleaned),
                            "source": "mapbox",
                        }
        except requests.RequestException:
            pass

    return {"latitude": 20.5937, "longitude": 78.9629, "address": cleaned, "source": "fallback"}


def generate_places(destination: str, days: int) -> List[Dict[str, Any]]:
    dest_key = normalize_location_name(destination).lower()
    catalog_key = next((k for k in PLACE_CATALOG.keys() if k in dest_key), None)
    candidates = PLACE_CATALOG.get(catalog_key or "", [])
    if not candidates:
        candidates = [
            (f"{destination} Old Town", "Walk through heritage neighborhoods."),
            (f"{destination} Museum District", "Cultural highlights and galleries."),
            (f"{destination} Riverside Promenade", "Evening views and local food stops."),
            (f"{destination} Nature Park", "Relaxed outdoor activity spot."),
            (f"{destination} Market Area", "Local crafts and shopping stretch."),
        ]
    limit = max(5, min(10, days * 3))
    places = []
    for idx, (name, description) in enumerate(candidates[:limit], start=1):
        coords = geocode_city(name)
        places.append(
            {
                "name": name,
                "location_query": name,
                "coordinates": coords,
                "description": description,
                "id": f"{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')}-{idx}",
            }
        )
    return places


class TBOClient:
    def __init__(self) -> None:
        self.hotel_base_url = get_env("TBO_HOTEL_BASE_URL", "")
        self.hotel_username = get_env("TBO_HOTEL_USERNAME")
        self.hotel_password = get_env("TBO_HOTEL_PASSWORD")

        self.air_auth_url = get_env("TBO_AIR_AUTH_URL", "")
        self.air_search_url = get_env("TBO_AIR_SEARCH_URL", "")
        self.air_username = get_env("TBO_AIR_USERNAME")
        self.air_password = get_env("TBO_AIR_PASSWORD")
        self.air_ip = get_env("TBO_AIR_IP", "")
        self.air_booking_mode = get_env("TBO_AIR_BOOKING_MODE", "")
        self.http_timeout = int(get_env("TBO_TIMEOUT_SECONDS", "") or "")

    def hotel_configured(self) -> bool:
        return bool(self.hotel_username and self.hotel_password)

    def air_configured(self) -> bool:
        return bool(self.air_username and self.air_password)

    def _hotel_request(
        self,
        path: str,
        payload: Optional[Dict[str, Any]] = None,
        method: str = "POST",
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if not self.hotel_configured():
            raise ValueError("TBO hotel credentials are missing. Set TBO_HOTEL_USERNAME and TBO_HOTEL_PASSWORD.")
        endpoint = f"{self.hotel_base_url.rstrip('/')}/{path.lstrip('/')}"
        response = requests.request(
            method=method,
            url=endpoint,
            json=payload,
            params=params,
            auth=(self.hotel_username, self.hotel_password),
            timeout=self.http_timeout,
        )
        response.raise_for_status()
        return response.json()

    def _air_request(self, base_url: str, path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        endpoint = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
        response = requests.post(
            endpoint,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=self.http_timeout,
        )
        response.raise_for_status()
        return response.json()

    def find_city_code(self, city_name: str, country_code: str = "IN") -> Tuple[Optional[str], str]:
        query = normalize_location_name(city_name).lower()
        override = city_override_for_query(city_name)
        if override:
            return override["Code"], override["Name"]

        payload = {"CountryCode": country_code}
        response = self._hotel_request("CityList", payload=payload, method="POST")
        rows = []
        for item in iter_dicts(response):
            city_code = get_by_keys(item, ["CityCode", "citycode"])
            city_value = get_by_keys(item, ["CityName", "cityname", "Name", "name"])
            if city_code and city_value:
                rows.append((str(city_code), str(city_value)))
        if not rows:
            return None, city_name

        search = query
        for code, value in rows:
            value_l = normalize_location_name(value).lower()
            if search and (search in value_l or value_l in search):
                return code, value
        return None, city_name

    def _extract_hotel_rows_from_code_list(self, response: Any) -> List[Dict[str, Any]]:
        hotels: List[Dict[str, Any]] = []
        candidate_nodes: List[Any] = [response]

        if isinstance(response, dict):
            for wrapped_key in ["d", "D", "Data", "Result", "Response"]:
                wrapped = response.get(wrapped_key)
                if isinstance(wrapped, str):
                    wrapped_text = wrapped.strip()
                    if wrapped_text.startswith("{") or wrapped_text.startswith("["):
                        try:
                            candidate_nodes.append(json.loads(wrapped_text))
                        except Exception:
                            pass
                elif isinstance(wrapped, (dict, list)):
                    candidate_nodes.append(wrapped)

        def push(code_value: Any, name_value: Any = None, source: Optional[Dict[str, Any]] = None) -> None:
            code = str(code_value or "").strip()
            if not code or not code.isdigit() or len(code) < 6:
                return
            base: Dict[str, Any] = {"HotelCode": code, "HotelName": str(name_value or f"Hotel {code}")}
            if isinstance(source, dict):
                for key in ["CityName", "Address", "HotelRating", "ImageUrls", "HotelFacilities"]:
                    if key in source and source[key] is not None:
                        base[key] = source[key]
            hotels.append(base)

        for node in candidate_nodes:
            if isinstance(node, dict):
                for key in ["Hotels", "HotelList", "HotelCodeList", "HotelCodes", "Data", "Result"]:
                    direct = node.get(key)
                    if isinstance(direct, list):
                        for item in direct:
                            if isinstance(item, dict):
                                push(
                                    get_by_keys(item, ["HotelCode", "hotelcode", "Code", "code"]),
                                    get_by_keys(item, ["HotelName", "hotelname", "Name", "name"]),
                                    item,
                                )
                            elif isinstance(item, (str, int, float)):
                                push(item)
                    elif isinstance(direct, dict):
                        push(
                            get_by_keys(direct, ["HotelCode", "hotelcode", "Code", "code"]),
                            get_by_keys(direct, ["HotelName", "hotelname", "Name", "name"]),
                            direct,
                        )

            for item in iter_dicts(node):
                push(
                    get_by_keys(item, ["HotelCode", "hotelcode", "Code", "code"]),
                    get_by_keys(item, ["HotelName", "hotelname", "Name", "name"]),
                    item,
                )

        deduped: List[Dict[str, Any]] = []
        seen: set = set()
        for item in hotels:
            code = str(get_by_keys(item, ["HotelCode", "hotelcode", "Code", "code"], default="")).strip()
            if not code or code in seen:
                continue
            seen.add(code)
            deduped.append(item)
        return deduped[:300]

    def hotel_code_list(self, city_code: str) -> List[Dict[str, Any]]:
        city_code_str = str(city_code).strip()
        attempts = [
            {"method": "POST", "payload": {"CityCode": city_code_str, "IsDetailedResponse": "true"}},
            {"method": "POST", "payload": {"CityCode": city_code_str, "IsDetailedResponse": True}},
            {"method": "POST", "payload": {"CityCode": city_code_str}},
            {"method": "POST", "payload": {"cityCode": city_code_str, "IsDetailedResponse": True}},
            {"method": "POST", "payload": {"Code": city_code_str}},
            {"method": "GET", "params": {"CityCode": city_code_str}},
            {"method": "GET", "params": {"cityCode": city_code_str}},
        ]
        diagnostics: List[str] = []
        for attempt in attempts:
            try:
                response = self._hotel_request(
                    "TBOHotelCodeList",
                    payload=attempt.get("payload"),
                    method=str(attempt.get("method") or "POST"),
                    params=attempt.get("params"),
                )
            except Exception as exc:
                diagnostics.append(
                    f"{attempt.get('method')} {attempt.get('payload') or attempt.get('params')} -> {type(exc).__name__}: {exc}"
                )
                continue
            rows = self._extract_hotel_rows_from_code_list(response)
            if rows:
                return rows
            status_obj = response.get("Status") if isinstance(response, dict) else {}
            status_code = get_by_keys(status_obj if isinstance(status_obj, dict) else {}, ["Code", "code"], default="?")
            status_desc = get_by_keys(
                status_obj if isinstance(status_obj, dict) else {},
                ["Description", "description", "Message", "message"],
                default="no description",
            )
            top_keys = list(response.keys())[:8] if isinstance(response, dict) else [type(response).__name__]
            diagnostics.append(
                f"{attempt.get('method')} {attempt.get('payload') or attempt.get('params')} -> empty parse; status={status_code} ({status_desc}); keys={top_keys}"
            )
        raise ValueError(
            "No hotel codes from TBOHotelCodeList. Diagnostics: " + " | ".join(diagnostics[:4])
        )

    def find_hotel_codes(self, city_code: str) -> List[str]:
        hotels = self.hotel_code_list(city_code)
        return [str(get_by_keys(item, ["HotelCode", "hotelcode", "Code", "code"])) for item in hotels][:120]

    def search_hotels(
        self,
        city_name: str,
        check_in: str,
        check_out: str,
        adults: int,
        children: int,
        budget_inr: float,
        guest_nationality: str = "IN",
    ) -> List[Dict[str, Any]]:
        city_code, resolved_city = self.find_city_code(city_name, country_code=guest_nationality or "IN")
        if not city_code:
            raise ValueError(f"Unable to resolve TBO city code for '{city_name}'.")

        code_list_rows = self.hotel_code_list(city_code)
        if not code_list_rows:
            raise ValueError(f"No TBO hotel codes found for city '{resolved_city}'.")

        hotels_by_id: Dict[str, Dict[str, Any]] = {}
        for idx, item in enumerate(code_list_rows):
            name = get_by_keys(item, ["HotelName", "hotelname", "name"])
            code = get_by_keys(item, ["HotelCode", "hotelcode", "Code"])
            if not code:
                continue
            if not name:
                name = f"Hotel {code}"

            rating = parse_star_rating(get_by_keys(item, ["StarRating", "HotelRating", "Rating"])) or 0
            amenities_raw = get_by_keys(item, ["HotelFacilities", "Facilities", "Amenities"], default=[])
            if isinstance(amenities_raw, str):
                amenities = [x.strip() for x in re.split(r"[|,;]", amenities_raw) if x.strip()]
            elif isinstance(amenities_raw, list):
                amenities = [str(x).strip() for x in amenities_raw if str(x).strip()]
            else:
                amenities = []

            image_url = ""
            image_list = get_by_keys(item, ["ImageUrls", "Images"], default=[])
            if isinstance(image_list, list) and image_list:
                first_image = image_list[0]
                if isinstance(first_image, dict):
                    image_url = str(get_by_keys(first_image, ["ImageUrl", "URL"], default=""))
                elif isinstance(first_image, str):
                    image_url = first_image

            estimated_price = max(1200.0, (budget_inr / 6 if budget_inr > 0 else 2200.0) + (idx * 180.0))
            hotels_by_id[str(code)] = {
                "id": str(code),
                "name": str(name),
                "location": str(get_by_keys(item, ["CityName", "Address"], default=resolved_city)),
                "rating": round(rating, 1) if rating else None,
                "reviews": int(parse_number(get_by_keys(item, ["ReviewCount", "Reviews"], default=0)) or 0),
                "price": round(estimated_price, 2),
                "amenities": amenities[:6],
                "image_url": image_url,
                "source_url": f"",
                "tbo": {"city_code": str(city_code), "estimated_price": True},
            }

        # Optional live-rate enrichment from TBO search. If search fails, keep code-list results for POC.
        try:
            hotel_codes_str = ",".join(list(hotels_by_id.keys())[:80])
            payload = {
                "CheckIn": check_in,
                "CheckOut": check_out,
                "HotelCodes": hotel_codes_str,
                "GuestNationality": guest_nationality or "IN",
                "PaxRooms": [
                    {
                        "Adults": max(1, int(adults or 1)),
                        "Children": max(0, int(children or 0)),
                        "ChildrenAges": [5] * max(0, int(children or 0)),
                    }
                ],
                "ResponseTime": 25.0,
                "IsDetailedResponse": True,
                "Filters": {
                    "Refundable": False,
                    "NoOfRooms": 1,
                    "MealType": 0,
                    "OrderBy": 0,
                    "StarRating": 0,
                    "HotelName": None,
                },
            }
            response = self._hotel_request("search", payload=payload, method="POST")
            for item in iter_dicts(response):
                code = get_by_keys(item, ["HotelCode", "hotelcode", "Code"])
                if not code:
                    continue
                hotel = hotels_by_id.get(str(code))
                if not hotel:
                    continue
                live_price = price_from_dict(item) or 0
                if live_price > 0:
                    hotel["price"] = round(live_price, 2)
                    hotel["tbo"]["estimated_price"] = False
                live_rating = parse_star_rating(get_by_keys(item, ["StarRating", "HotelRating", "Rating"]))
                if live_rating and live_rating > 0:
                    hotel["rating"] = round(live_rating, 1)
        except Exception:
            pass

        hotels = list(hotels_by_id.values())
        if budget_inr and budget_inr > 0:
            hotels = [
                hotel
                for hotel in hotels
                if bool(((hotel.get("tbo") or {}).get("estimated_price"))) or float(hotel.get("price") or 0) <= budget_inr * 1.2
            ]
        hotels = sorted(hotels, key=lambda x: (x.get("price") or 0, x.get("name") or ""))
        return hotels[:30]

    def hotel_details(self, hotel_code: str) -> Dict[str, Any]:
        response = self._hotel_request(
            "Hoteldetails",
            payload={"Hotelcodes": str(hotel_code), "Language": "EN"},
            method="POST",
        )
        details = []
        if isinstance(response, dict):
            direct = response.get("HotelDetails")
            if isinstance(direct, list):
                details = [x for x in direct if isinstance(x, dict)]
            elif isinstance(direct, dict):
                details = [direct]
        if not details:
            for item in iter_dicts(response):
                code = get_by_keys(item, ["HotelCode", "hotelcode", "Code"])
                if str(code or "") == str(hotel_code):
                    details = [item]
                    break
        if not details:
            raise ValueError(f"No hotel details found for code '{hotel_code}'.")

        detail = details[0]
        images = []
        raw_images = detail.get("Images")
        if isinstance(raw_images, list):
            images = [str(x) for x in raw_images if str(x).strip()]
        main_image = str(detail.get("Image") or "")
        if main_image and main_image not in images:
            images.insert(0, main_image)

        facilities = detail.get("HotelFacilities") or []
        amenities = [str(x).strip() for x in facilities if str(x).strip()] if isinstance(facilities, list) else []
        rating = parse_number(detail.get("HotelRating")) or 0
        map_value = str(detail.get("Map") or "")
        latitude = None
        longitude = None
        if "|" in map_value:
            parts = map_value.split("|")
            if len(parts) == 2:
                latitude = parse_number(parts[0])
                longitude = parse_number(parts[1])

        return {
            "id": str(detail.get("HotelCode") or hotel_code),
            "name": str(detail.get("HotelName") or f"Hotel {hotel_code}"),
            "location": str(detail.get("CityName") or detail.get("Address") or ""),
            "rating": round(float(rating), 1) if rating else None,
            "reviews": 0,
            "price": 0,
            "amenities": amenities[:10],
            "description": str(detail.get("Description") or ""),
            "images": images[:20],
            "image_url": images[0] if images else "",
            "address": str(detail.get("Address") or ""),
            "source_url": f"",
            "policies": {
                "check_in": str(detail.get("CheckInTime") or ""),
                "check_out": str(detail.get("CheckOutTime") or ""),
                "cancellation": "",
            },
            "coordinates": {"lat": latitude, "lng": longitude},
        }

    def authenticate_air(self) -> str:
        if not self.air_configured():
            raise ValueError("TBO air credentials are missing. Set TBO_AIR_USERNAME and TBO_AIR_PASSWORD.")
        payload = {
            "BookingMode": self.air_booking_mode,
            "UserName": self.air_username,
            "Password": self.air_password,
            "IPAddress": self.air_ip,
        }
        response = self._air_request(self.air_auth_url, "Authenticate/ValidateAgency", payload)
        token = response.get("TokenId") or get_by_keys(response, ["TokenId", "tokenid"])
        if not token:
            raise ValueError("TBO air auth succeeded but TokenId not found.")
        return str(token)

    def search_flights_for_leg(
        self,
        token_id: str,
        origin_code: str,
        destination_code: str,
        travel_date: str,
        adults: int = 1,
    ) -> List[Dict[str, Any]]:
        payload = {
            "AdultCount": str(max(1, adults)),
            "ChildCount": "0",
            "InfantCount": "0",
            "IsDomestic": "true",
            "DirectFlight": "false",
            "OneStopFlight": "false",
            "JourneyType": "1",
            "EndUserIp": self.air_ip,
            "TokenId": token_id,
            "PreferredAirlines": [],
            "Sources": [],
            "Segments": [
                {
                    "Origin": origin_code,
                    "Destination": destination_code,
                    "PreferredDepartureTime": f"{travel_date}T00:00:00",
                    "PreferredArrivalTime": f"{travel_date}T23:59:59",
                    "FlightCabinClass": 1,
                }
            ],
            "ResultFareType": 0,
            "PreferredCurrency": "INR",
        }
        response = self._air_request(self.air_search_url, "Search/", payload)
        results = (((response.get("Response") or {}).get("Results")) or [])
        itineraries: List[Dict[str, Any]] = []
        for bucket in results:
            if isinstance(bucket, list):
                itineraries.extend([x for x in bucket if isinstance(x, dict)])
            elif isinstance(bucket, dict):
                itineraries.append(bucket)

        options: List[Dict[str, Any]] = []
        for idx, item in enumerate(itineraries[:8], start=1):
            fare = item.get("Fare") or {}
            price = parse_number(fare.get("PublishedFare") or fare.get("OfferedFare") or fare.get("BaseFare")) or 0
            segments = item.get("Segments") or []
            segment0 = None
            if segments and isinstance(segments[0], list) and segments[0]:
                segment0 = segments[0][0]
            elif segments and isinstance(segments[0], dict):
                segment0 = segments[0]
            if not isinstance(segment0, dict):
                continue

            airline = segment0.get("Airline") or {}
            airline_name = str(airline.get("AirlineName") or airline.get("AirlineCode") or "Flight Partner")
            flight_no = str(segment0.get("AirlineFlightNumber") or "")
            dep = (((segment0.get("Origin") or {}).get("DepTime")) or "")[:16].replace("T", " ")
            arr = (((segment0.get("Destination") or {}).get("ArrTime")) or "")[:16].replace("T", " ")
            duration_mins = parse_number(segment0.get("Duration")) or 0
            hours = int(duration_mins // 60) if duration_mins else 0
            mins = int(duration_mins % 60) if duration_mins else 0
            duration_text = f"{hours}h {mins}m" if duration_mins else "NA"

            options.append(
                {
                    "provider": airline_name,
                    "flight_no": flight_no,
                    "departure": dep or "NA",
                    "arrival": arr or "NA",
                    "duration": duration_text,
                    "price": round(price, 2),
                    "booking_url": "",
                    "rank": idx,
                }
            )

        return sorted(options, key=lambda x: x.get("price") or 0)[:4]


tbo = TBOClient()


def extract_stops_from_itinerary(itinerary_text: str) -> List[str]:
    matches = re.findall(r"@\s*([^\n]+)", itinerary_text or "", flags=re.IGNORECASE)
    candidates: List[str] = []
    for raw in matches:
        cleaned = normalize_location_name(raw.split(" - ")[0])
        if cleaned and cleaned.lower() not in {"breakfast", "lunch", "dinner", "hotel"}:
            candidates.append(cleaned)
    deduped: List[str] = []
    seen = set()
    for item in candidates:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def build_route_legs(origin: str, stops: List[str]) -> List[Tuple[str, str]]:
    route = [normalize_location_name(origin)] + [normalize_location_name(x) for x in stops if normalize_location_name(x)]
    if len(route) < 2:
        return []
    if route[-1].lower() != route[0].lower():
        route.append(route[0])
    return [(route[i], route[i + 1]) for i in range(len(route) - 1)]


def format_hotels_as_markdown(location: str, hotels: List[Dict[str, Any]]) -> str:
    lines = [f"## {location} accommodation options via TBO API"]
    for idx, hotel in enumerate(hotels[:12], start=1):
        lines.append(f"{idx}. **{hotel['name']}**")
        lines.append(f"- Location: {hotel.get('location') or location}")
        lines.append(f"- Nightly Rate: INR {round(float(hotel.get('price') or 0))}")
        rating = hotel.get("rating")
        if rating:
            lines.append(f"- Rating: {rating}/5")
        amenities = hotel.get("amenities") or []
        if amenities:
            lines.append(f"- Amenities: {', '.join(amenities[:4])}")
        lines.append(f"- Booking: {hotel.get('source_url') or ''}")
        lines.append("")
    return "\n".join(lines).strip()


def format_transport_as_markdown(legs: List[Tuple[str, str]], options_by_leg: Dict[str, List[Dict[str, Any]]]) -> str:
    blocks: List[str] = []
    for from_city, to_city in legs:
        key = f"{from_city} -> {to_city}"
        blocks.append(f"### {key}")
        options = options_by_leg.get(key) or []
        if not options:
            blocks.append("- No flight options returned by TBO for this leg.")
            blocks.append("")
            continue
        for idx, option in enumerate(options, start=1):
            carrier = option.get("provider") or "Flight Partner"
            flight_no = option.get("flight_no") or ""
            blocks.append(f"{idx}. **{carrier} {flight_no}**")
            blocks.append(f"- Departs {option.get('departure')} -> Arrives {option.get('arrival')}")
            blocks.append(f"- Duration: {option.get('duration')}")
            blocks.append(f"- Price: INR {round(float(option.get('price') or 0))}")
            blocks.append(f"- Booking website: {option.get('booking_url') or ''}")
            blocks.append("")
    return "\n".join(blocks).strip()


@app.route("/health", methods=["GET"])
def health() -> Any:
    return jsonify(
        {
            "status": "ok",
            "service": "tbo_backend",
            "time": now_iso(),
            "hotel_api_configured": tbo.hotel_configured(),
            "air_api_configured": tbo.air_configured(),
            "booking_mode": "mock_only",
        }
    ), 200


@app.route("/tbo/hotels/search", methods=["POST"])
def tbo_hotel_search_endpoint() -> Any:
    payload = request.get_json(silent=True) or {}
    location = normalize_location_name(str(payload.get("location") or payload.get("city") or ""))
    if not location:
        return jsonify({"error": "location is required"}), 400

    check_in = str(payload.get("check_in") or datetime.utcnow().strftime("%Y-%m-%d"))
    check_out = str(payload.get("check_out") or check_in)
    adults = max(1, int(payload.get("adults") or 1))
    children = max(0, int(payload.get("children") or 0))
    budget = float(payload.get("max_budget_inr") or payload.get("budget") or 0)
    guest_nationality = str(payload.get("guest_nationality") or "IN").upper()

    try:
        city_code, resolved_city = tbo.find_city_code(location, country_code=guest_nationality)
        if not city_code:
            raise ValueError(f"Unable to resolve TBO city code for '{location}'.")
        hotels = tbo.search_hotels(
            city_name=location,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            children=children,
            budget_inr=budget,
            guest_nationality=guest_nationality,
        )
    except Exception as exc:
        return jsonify({"error": f"TBO hotel search failed: {exc}"}), 502

    if not hotels:
        return jsonify({"error": "TBO hotel search returned no results"}), 404

    return (
        jsonify(
            {
                "source": "tbo",
                "city_code": city_code,
                "city_name": resolved_city,
                "hotel_count": len(hotels),
                "hotels": hotels,
            }
        ),
        200,
    )


@app.route("/tbo/hotels/details", methods=["POST"])
def tbo_hotel_details_endpoint() -> Any:
    payload = request.get_json(silent=True) or {}
    hotel_code = str(payload.get("hotel_code") or payload.get("hotel_id") or payload.get("id") or "").strip()
    if not hotel_code:
        return jsonify({"error": "hotel_code is required"}), 400
    try:
        hotel = tbo.hotel_details(hotel_code)
    except Exception as exc:
        return jsonify({"error": f"TBO hotel details failed: {exc}"}), 502
    return jsonify({"source": "tbo", "hotel": hotel}), 200


@app.route("/sessions", methods=["POST"])
def create_session_endpoint() -> Any:
    session = create_session()
    return jsonify({"session_id": session["id"]}), 201


@app.route("/sessions", methods=["GET"])
def list_sessions() -> Any:
    return (
        jsonify(
            {
                "sessions": [
                    {
                        "session_id": s["id"],
                        "created_at": s["created_at"],
                        "last_active": s["last_active"],
                    }
                    for s in sessions.values()
                ]
            }
        ),
        200,
    )


@app.route("/sessions/<session_id>", methods=["GET"])
def get_session_endpoint(session_id: str) -> Any:
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    return jsonify(session), 200


@app.route("/sessions/<session_id>", methods=["DELETE"])
def delete_session_endpoint(session_id: str) -> Any:
    if session_id in sessions:
        del sessions[session_id]
        return jsonify({"message": "Session deleted"}), 200
    return jsonify({"error": "Session not found"}), 404


@app.route("/sessions/<session_id>/coordinates", methods=["POST"])
def coordinates_endpoint(session_id: str) -> Any:
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    payload = request.get_json(silent=True) or {}
    location = str(payload.get("location") or "").strip()
    if not location:
        return jsonify({"error": "Location is required"}), 400
    return jsonify({"result": geocode_city(location)}), 200


@app.route("/sessions/<session_id>/suggest-places", methods=["POST"])
def suggest_places_endpoint(session_id: str) -> Any:
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    payload = request.get_json(silent=True) or {}
    destination = str(payload.get("destination") or "").strip()
    duration_raw = str(payload.get("duration") or "3")
    if not destination:
        return jsonify({"error": "Destination is required"}), 400
    days_match = re.search(r"(\d+)", duration_raw)
    days = int(days_match.group(1)) if days_match else 3
    places = generate_places(destination, max(1, days))
    suggestions = "\n".join([f"{idx + 1}. {item['name']} - {item['description']}" for idx, item in enumerate(places)])
    return jsonify({"suggestions": suggestions, "destination": destination, "duration": duration_raw, "attractions_with_coordinates": places}), 200


@app.route("/sessions/<session_id>/find-accommodation-options", methods=["POST"])
def find_accommodation_endpoint(session_id: str) -> Any:
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    payload = request.get_json(silent=True) or {}
    itinerary = str(payload.get("itinerary") or "")
    if not itinerary.strip():
        return jsonify({"error": "Itinerary is required"}), 400

    location_match = re.search(r"-\s*Location:\s*(.+)", itinerary, flags=re.IGNORECASE)
    check_in_match = re.search(r"-\s*Check-in:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", itinerary, flags=re.IGNORECASE)
    check_out_match = re.search(r"-\s*Check-out:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", itinerary, flags=re.IGNORECASE)
    adults_match = re.search(r"-\s*Adults:\s*([0-9]+)", itinerary, flags=re.IGNORECASE)

    location = normalize_location_name((location_match.group(1) if location_match else payload.get("location") or payload.get("origin") or "Delhi"))
    check_in = check_in_match.group(1) if check_in_match else datetime.utcnow().strftime("%Y-%m-%d")
    check_out = check_out_match.group(1) if check_out_match else datetime.utcnow().strftime("%Y-%m-%d")
    adults = int(adults_match.group(1)) if adults_match else int(payload.get("adults") or 1)
    budget = float(payload.get("max_budget_inr") or 0)

    try:
        hotels = tbo.search_hotels(
            city_name=location,
            check_in=check_in,
            check_out=check_out,
            adults=adults,
            children=0,
            budget_inr=budget,
            guest_nationality="IN",
        )
    except Exception as exc:
        return jsonify({"error": f"TBO hotel search failed: {exc}"}), 502

    if not hotels:
        return jsonify({"error": "TBO hotel search returned no results"}), 404

    return (
        jsonify(
            {
                "accommodation_options": format_hotels_as_markdown(location, hotels),
                "hotel_count": len(hotels),
                "hotels": hotels,
                "source": "tbo",
            }
        ),
        200,
    )


@app.route("/sessions/<session_id>/find-transportation-options", methods=["POST"])
def find_transportation_endpoint(session_id: str) -> Any:
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    payload = request.get_json(silent=True) or {}
    itinerary = str(payload.get("itinerary") or "")
    origin = normalize_location_name(str(payload.get("origin") or "Delhi"))
    transport_mode = str(payload.get("transport_mode") or "mixed").strip().lower()
    start_date = str(payload.get("start_date") or datetime.utcnow().strftime("%Y-%m-%d"))

    if transport_mode not in {"mixed", "flight"}:
        return jsonify({"error": "TBO transport integration currently supports flight (or mixed) mode only."}), 400
    if not itinerary.strip():
        return jsonify({"error": "Itinerary is required"}), 400

    stops = extract_stops_from_itinerary(itinerary)
    legs = build_route_legs(origin, stops)
    if not legs:
        return jsonify({"error": "Could not derive transport legs from itinerary. Add locations in itinerary first."}), 400

    try:
        token = tbo.authenticate_air()
    except Exception as exc:
        return jsonify({"error": f"TBO air authentication failed: {exc}"}), 502

    options_by_leg: Dict[str, List[Dict[str, Any]]] = {}
    for from_city, to_city in legs:
        from_code = airport_code_for_city(from_city)
        to_code = airport_code_for_city(to_city)
        leg_key = f"{from_city} -> {to_city}"
        if not from_code or not to_code:
            options_by_leg[leg_key] = []
            continue
        try:
            leg_options = tbo.search_flights_for_leg(
                token_id=token,
                origin_code=from_code,
                destination_code=to_code,
                travel_date=start_date,
                adults=1,
            )
        except Exception:
            leg_options = []
        options_by_leg[leg_key] = leg_options

    text = format_transport_as_markdown(legs, options_by_leg)
    if not text.strip():
        return jsonify({"error": "No transport options could be generated from TBO API"}), 404

    return jsonify({"transportation_options": text, "legs": len(legs)}), 200


@app.route("/mock-booking/create", methods=["POST"])
def mock_booking_create() -> Any:
    payload = request.get_json(silent=True) or {}
    selections = payload.get("selections") or []
    total = sum(float(item.get("amount") or 0) for item in selections if isinstance(item, dict))
    booking_id = f"mock_{uuid.uuid4().hex[:10]}"
    mock_bookings[booking_id] = {
        "id": booking_id,
        "trip_id": payload.get("trip_id"),
        "selections": selections,
        "total_amount": total,
        "status": "pending",
        "currency": str(payload.get("currency") or "INR"),
        "created_at": now_iso(),
    }
    return jsonify({"booking_id": booking_id, "status": "pending", "total_amount": total, "currency": "INR"}), 201


@app.route("/mock-booking/pay/<booking_id>", methods=["POST"])
def mock_booking_pay(booking_id: str) -> Any:
    booking = mock_bookings.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404
    booking["status"] = "confirmed"
    booking["confirmation_number"] = f"TBO-MOCK-{uuid.uuid4().hex[:8].upper()}"
    booking["paid_at"] = now_iso()
    return jsonify({"booking_id": booking_id, "status": booking["status"], "confirmation_number": booking["confirmation_number"]}), 200


if __name__ == "__main__":
    port = int(get_env("PORT", "8001") or "8001")
    app.run(host="0.0.0.0", port=port, debug=True)
