from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import uuid
from datetime import datetime
import re
import os
import math
import ast
from geolocation import InteractiveTravelAgent, get_location_coordinates
from bookingAgent import TravelOptionsFinder
from liveItineraryAgent import LiveItineraryAgent
import requests
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000", "http://localhost:3001"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})  

load_dotenv()
# Sessions storage
sessions = {}
mock_bookings = {}
@app.route('/circle_places_search', methods=['POST'])
def circle_places_search():
    """Search for well-know places located strictly within the drawn circle"""
    print(f"[DEBUG] Circle search started")
    data = request.json
    query = data.get('query', '')
    center = data.get('center', [0, 0])
    radius = data.get('radius', 1)  # radius in kilometers
    limit = data.get('limit', 10)  # increased limit for better results
    session_id = data.get('session_id')
    
    print(f"[DEBUG] Query: {query}, Center: {center}, Radius: {radius}km")
    
    try:
        # Get the session if available
        session = get_session(session_id) if session_id else None
        travel_agent = session.get("travel_agent") if session else None
        
        # Extract longitude and latitude from center
        lng, lat = center
        
        # Get city/area name from coordinates using reverse geocoding
        city_name = "the area"
        try:
            reverse_url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{lng},{lat}.json"
            reverse_params = {
                'access_token': "",
                'types': 'place,locality,neighborhood',
                'limit': 1
            }
            reverse_response = requests.get(reverse_url, params=reverse_params, timeout=5)
            if reverse_response.ok:
                reverse_data = reverse_response.json()
                features = reverse_data.get('features', [])
                if features:
                    city_name = features[0].get('text', 'the area')
                    print(f"[DEBUG] Detected city/area: {city_name}")
        except Exception as e:
            print(f"[DEBUG] Reverse geocoding failed: {str(e)}")
        
        # Use the travel agent to get suggestions if available
        if travel_agent:
            print(f"[DEBUG] Using travel agent for search")
            # Store the data in the agent's context
            travel_agent.context["search_type"] = query
            travel_agent.context["center"] = {"latitude": lat, "longitude": lng}
            travel_agent.context["radius"] = radius
            travel_agent.context["city_name"] = city_name
            
            agent_query = f"""Find the TOP-RATED, HIGHLY POPULAR {query} in {city_name}, India near coordinates {lat}, {lng} (within approximately {radius} km).

CRITICAL REQUIREMENTS:
1. Search for REAL, SPECIFIC places using DuckDuckGo
2. Include the FULL NAME with city/area (e.g., "Restaurant Name, {city_name}")
3. Include ONLY places that are BOTH:
   - Highly-rated (4+ stars)
   - AND have MANY reviews (100+ reviews, 1000+ is better)
4. AVOID places with few reviews (e.g., 5 stars but only 1-10 reviews)
5. Prioritize POPULAR, WELL-ESTABLISHED, FAMOUS places with hundreds/thousands of reviews
6. List 8-12 places (to account for geocoding failures)
7. Include the specific area/neighborhood within {city_name}

For each place provide:
- **Full Place Name, Area/Neighborhood, {city_name}** (exact, complete name with location)
- Brief description including rating AND number of reviews (e.g., "4.5 stars with 2,500+ reviews")
- Why it's popular/well-known

Format:
1. **Complete Place Name, Specific Area, {city_name}**
Description with rating (X stars) and review count (X+ reviews). Why it's popular.

IMPORTANT: 
- DO NOT use any functions or tools
- Just list the places with descriptions
- Include FULL location details (place name + area + city)
- Focus on FAMOUS, POPULAR places with MANY reviews
- A place with 4.3 stars and 5,000 reviews is BETTER than 5 stars with 10 reviews
- Search for places near {city_name}, India"""
            
            print(f"[DEBUG] Sending query to AI agent")
            
            # Get the response from the travel agent
            try:
                response = travel_agent.agent.run(agent_query, stream=False)
                
                # Check if response is valid
                if not response or not hasattr(response, 'content'):
                    print(f"[DEBUG] Invalid AI response, falling back to Mapbox")
                    raise Exception("Invalid AI response")
                
                processed_response = process_function_calls(response.content)
                print(f"[DEBUG] AI response received: {processed_response[:200]}...")
                print(f"[DEBUG] Processing places from AI response")
                
                # Extract place names using regex - looking for numbered items with place names
                place_pattern = r'\d+\.\s+\*\*([^*:]+)(?:\*\*|:)'
                places = re.findall(place_pattern, processed_response)
                
                print(f"[DEBUG] Found {len(places)} places from AI")
                
                # If no places found with numbered pattern, try alternative patterns
                if len(places) == 0:
                    print(f"[DEBUG] No numbered places found, trying alternative patterns")
                    # Try pattern: **Place Name**
                    place_pattern2 = r'\*\*([^*]+)\*\*'
                    places = re.findall(place_pattern2, processed_response)
                    print(f"[DEBUG] Found {len(places)} places with alternative pattern")
                
                # If still no places, fall back to Mapbox
                if len(places) == 0:
                    print(f"[DEBUG] No places extracted from AI response, falling back to Mapbox")
                    raise Exception("No places found in AI response")
                
            except Exception as ai_error:
                print(f"[DEBUG] AI search failed: {str(ai_error)}, falling back to Mapbox")
                # Fall through to Mapbox search below
                travel_agent = None
        
        # If we still have travel_agent, process the AI results
        if travel_agent:
            
            # Create a list to store places with coordinates
            places_with_coords = []

            def parse_coords_result(raw: str):
                if not raw:
                    return None
                try:
                    return json.loads(raw)
                except Exception:
                    pass
                try:
                    return ast.literal_eval(raw)
                except Exception:
                    return None
            
            for idx, place in enumerate(places[:12]):  # Process up to 12 places
                print(f"[DEBUG] Processing place {idx+1}/{min(len(places), 12)}: {place}")
                # Clean up the place name
                place_name = place.strip()
                
                # Skip if place name is too short or generic
                if len(place_name) < 3 or place_name.lower() in ['place', 'location', 'area']:
                    print(f"[DEBUG] Skipping generic place name: {place_name}")
                    continue
                
                # Create multiple location query variations for better geocoding
                city_context = travel_agent.context.get("city_name", "")
                location_queries = [
                    f"{place_name}, {city_context}, India near {lat}, {lng}",
                    f"{place_name}, {city_context} near {lat}, {lng}",
                    f"{place_name} near {lat}, {lng}"
                ]
                
                # Try each query variation
                coords_result = None
                for loc_query in location_queries:
                    try:
                        coords_result = get_location_coordinates(loc_query)
                        coords_dict = parse_coords_result(coords_result) or {}
                        
                        # Check if we got valid coordinates
                        if coords_dict.get('latitude', 0) != 0 or coords_dict.get('longitude', 0) != 0:
                            print(f"[DEBUG] Found coordinates using query: {loc_query}")
                            break
                    except Exception as e:
                        print(f"[DEBUG] Query '{loc_query}' failed: {str(e)}")
                        continue
                
                if not coords_result:
                    print(f"[DEBUG] Could not geocode {place_name}")
                    continue
                
                # Call get_coordinates function directly
                try:
                    # Parse coordinates and check if within radius
                    coords_dict = parse_coords_result(coords_result) or {}
                    place_lat = float(coords_dict.get('latitude', 0))
                    place_lng = float(coords_dict.get('longitude', 0))
                    
                    # Skip if coordinates are invalid (0,0)
                    if place_lat == 0 and place_lng == 0:
                        print(f"[DEBUG] Invalid coordinates for {place_name}")
                        continue
                    
                    # Calculate distance from center
                    def calculate_distance(lon1, lat1, lon2, lat2):
                        R = 6371  # Earth radius in km
                        dLat = math.radians(lat2 - lat1)
                        dLon = math.radians(lon2 - lon1)
                        a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
                        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                        distance = R * c
                        return distance
                    
                    distance = calculate_distance(lng, lat, place_lng, place_lat)
                    
                    print(f"[DEBUG] Place distance: {distance:.2f}km (limit: {radius}km)")
                    
                    # Be more lenient with radius - allow 20% over to account for geocoding inaccuracy
                    lenient_radius = radius * 1.2
                    
                    if distance <= lenient_radius:
                        # Extract description - find the specific place's description only
                        description = f"A highly-rated {query} in the area."
                        
                        # Try to find the numbered item for this place
                        # Look for pattern: "N. **Place Name**\nDescription"
                        import re
                        # Escape special regex characters in place_name
                        escaped_place_name = re.escape(place_name)
                        # Pattern: number. **place name** followed by description until next number or end
                        pattern = rf'\d+\.\s+\*\*{escaped_place_name}\*\*\s*\n([^\n]+(?:\n(?!\d+\.\s+\*\*)[^\n]+)*)'
                        match = re.search(pattern, processed_response, re.IGNORECASE)
                        
                        if match:
                            description = match.group(1).strip()
                            # Limit description length
                            if len(description) > 300:
                                description = description[:297] + "..."
                        else:
                            # Fallback: try to find just the first line after the place name
                            place_idx = processed_response.find(place_name)
                            if place_idx != -1:
                                # Find the newline after the place name
                                desc_start = processed_response.find("\n", place_idx)
                                if desc_start != -1:
                                    # Find the next numbered item or double newline
                                    next_item = re.search(r'\n\d+\.\s+\*\*', processed_response[desc_start:])
                                    if next_item:
                                        desc_end = desc_start + next_item.start()
                                    else:
                                        desc_end = processed_response.find("\n\n", desc_start)
                                        if desc_end == -1:
                                            desc_end = desc_start + 200  # Limit to 200 chars
                                    
                                    description = processed_response[desc_start:desc_end].strip()
                                    # Limit description length
                                    if len(description) > 300:
                                        description = description[:297] + "..."
                        
                        # Mark if slightly outside original radius
                        within_strict = distance <= radius
                        if not within_strict:
                            print(f"[DEBUG] ⚠ Place slightly outside radius but included (geocoding tolerance)")
                            
                        places_with_coords.append({
                            "name": place_name,
                            "location_query": location_queries[0],  # Use the first query that worked
                            "coordinates": coords_result,
                            "longitude": place_lng,
                            "latitude": place_lat,
                            "distance": round(distance, 2),
                            "description": description
                        })
                        print(f"[DEBUG] ✓ Place added (distance: {distance:.2f}km)")
                    else:
                        print(f"[DEBUG] ✗ Place rejected (too far: {distance:.2f}km > {lenient_radius:.2f}km)")
                except Exception as e:
                    print(f"[DEBUG] Error processing place {place_name}: {str(e)}")
                    continue
            
            print(f"[DEBUG] Total places within radius: {len(places_with_coords)}")
            
            # Sort by distance (closest first)
            places_with_coords.sort(key=lambda x: x['distance'])
                    
            # If we have session, add to chat history
            if session:
                add_to_chat_history(session_id, "user", f"Searching for {query} in a {radius}km radius")
                add_to_chat_history(session_id, "system", "Places found", processed_response)
                update_session_activity(session_id)
            
            print(f"[DEBUG] Returning {len(places_with_coords)} places to frontend")
            return jsonify({
                "status": "success",
                "places": places_with_coords,
                "count": len(places_with_coords)
            })
            
        else:
            # Fallback to direct Mapbox search if AI failed or no travel agent
            print(f"[DEBUG] Using Mapbox fallback search")
            
            # Mapbox search query for POIs matching the query
            geocoding_url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{query}.json"
            params = {
                'access_token': "",
                'proximity': f"{lng},{lat}",
                'limit': limit * 2,  # Get more results to filter
                'types': 'poi',
                'country': 'IN',  # Focus on India
            }
            
            print(f"[DEBUG] Calling Mapbox API")
            response = requests.get(geocoding_url, params=params, timeout=10)
            results = response.json().get('features', [])
            print(f"[DEBUG] Mapbox returned {len(results)} results")
            
            # Filter results by distance
            places = []
            
            def calculate_distance(lon1, lat1, lon2, lat2):
                # Calculate distance using Haversine formula
                R = 6371  # Earth radius in km
                dLat = math.radians(lat2 - lat1)
                dLon = math.radians(lon2 - lon1)
                a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                distance = R * c
                return distance
            
            for place in results:
                place_center = place.get('center', [])
                if len(place_center) != 2:
                    continue
                    
                # Calculate distance
                place_lng, place_lat = place_center
                distance = calculate_distance(lng, lat, place_lng, place_lat)
                
                print(f"[DEBUG] Mapbox place: {place.get('text', '')} - {distance:.2f}km")
                
                # STRICTLY enforce radius - only include if within radius
                if distance <= radius:
                    place_info = {
                        'name': place.get('text', ''),
                        'description': f"Located {distance:.1f}km from center",
                        'address': place.get('place_name', ''),
                        'longitude': place_center[0],
                        'latitude': place_center[1],
                        'location_query': place.get('place_name', ''),
                        'distance': round(distance, 2),
                        'coordinates': f"{{'latitude': {place_lat}, 'longitude': {place_lng}}}"
                    }
                    places.append(place_info)
                    print(f"[DEBUG] ✓ Mapbox place added (within radius)")
                else:
                    print(f"[DEBUG] ✗ Mapbox place rejected (outside radius)")
            
            # Sort by distance (closest first)
            places.sort(key=lambda x: x['distance'])
            
            # Limit to top results
            places = places[:limit]
            
            print(f"[DEBUG] Returning {len(places)} Mapbox places to frontend")
            
            return jsonify({
                'status': 'success',
                'places': places,
                'count': len(places),
                'source': 'mapbox'  # Indicate this came from Mapbox fallback
            })
    
    except Exception as e:
        print(f"[ERROR] Error in circle_places_search: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
def create_new_session():
    """Create a new session with initialized agents"""
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        "travel_agent": InteractiveTravelAgent(),
        "booking_agent": TravelOptionsFinder(),
        "live_itinerary_agent": LiveItineraryAgent(),
        "chat_history": [],
        "created_at": datetime.now().isoformat(),
        "last_active": datetime.now().isoformat(),
        "current_itinerary": None,
        "current_location": None
    }
    return session_id

def get_session(session_id):
    """Get session by ID or return None if not found"""
    return sessions.get(session_id)

def update_session_activity(session_id):
    """Update the last active timestamp for a session"""
    if session_id in sessions:
        sessions[session_id]["last_active"] = datetime.now().isoformat()

def add_to_chat_history(session_id, source, message, response=None):
    """Add a message to the chat history"""
    if session_id in sessions:
        entry = {
            "timestamp": datetime.now().isoformat(),
            "source": source,
            "message": message
        }
        if response:
            entry["response"] = response
        
        sessions[session_id]["chat_history"].append(entry)

def process_function_calls(text):
    """
    Process all function calls in the text and replace them with their results
    The format is expected to be <function=get_location_coordinates{"location_name": "Location Name"}></function>
    or get_location_coordinates("Location Name")
    """
    # Process format: <function=get_location_coordinates{"location_name": "Location Name"}></function>
    function_pattern = r'<function=get_location_coordinates\{\"location_name\"\s*:\s*\"([^\"]+)\"\}\}</function>'
    matches = re.findall(function_pattern, text)
    
    for location_name in matches:
        result = get_location_coordinates(location_name)
        text = text.replace(f'<function=get_location_coordinates{{"location_name": "{location_name}"}}</function>', 
                           f'**Coordinates**: {result}')
    
    # Process format: get_location_coordinates("Location Name")
    function_pattern2 = r'get_location_coordinates\(\"([^\"]+)\"\)'
    matches = re.findall(function_pattern2, text)
    
    for location_name in matches:
        result = get_location_coordinates(location_name)
        text = text.replace(f'get_location_coordinates("{location_name}")', 
                           f'**Coordinates**: {result}')
    
    # Handle any function waiting patterns
    waiting_patterns = [
        r'(Waiting for the result of the function call.*?\n)',
        r'(Please wait for the function result.*?\n)',
        r'(Once I have the coordinates.*?\n)',
        r'(\(Please provide the result of the function call\))'
    ]
    
    for pattern in waiting_patterns:
        text = re.sub(pattern, '', text)
    
    return text

@app.route('/health', methods=['GET'])
def health_check():
    """Simple health check endpoint"""
    return jsonify({"status": "healthy", "message": "Travel API is running"}), 200

@app.route('/sessions', methods=['POST'])
def create_session():
    """Create a new session and return its ID"""
    session_id = create_new_session()
    return jsonify({
        "session_id": session_id,
        "message": "New session created successfully"
    }), 201

@app.route('/sessions/<session_id>', methods=['GET'])
def get_session_info(session_id):
    """Get session information and chat history"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    # Clean the session data to make it serializable
    return jsonify({
        "session_id": session_id,
        "created_at": session["created_at"],
        "last_active": session["last_active"],
        "chat_history": session["chat_history"],
        "travel_agent_context": session["travel_agent"].context,
        "booking_agent_context": session["booking_agent"].context
    }), 200

@app.route('/sessions/<session_id>', methods=['DELETE'])
def delete_session(session_id):
    """Delete a session"""
    if session_id not in sessions:
        return jsonify({"error": "Session not found"}), 404
    
    del sessions[session_id]
    return jsonify({"message": "Session deleted successfully"}), 200

@app.route('/sessions', methods=['GET'])
def list_sessions():
    """List all active sessions"""
    session_list = [{
        "session_id": sid,
        "created_at": data["created_at"],
        "last_active": data["last_active"],
        "message_count": len(data["chat_history"])
    } for sid, data in sessions.items()]
    
    return jsonify({"sessions": session_list}), 200

@app.route('/sessions/<session_id>/coordinates', methods=['POST'])
def get_coordinates(session_id):
    """Get coordinates for a location name"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'location' not in data:
        return jsonify({"error": "Location name is required"}), 400
    
    location_name = data['location']
    add_to_chat_history(session_id, "user", f"Get coordinates for: {location_name}")
    
    # Pass location_name as a string directly to match geolocation.py implementation
    coordinates = get_location_coordinates(location_name)
    
    add_to_chat_history(session_id, "system", f"Returning coordinates", coordinates)
    update_session_activity(session_id)
    
    return jsonify({"result": coordinates}), 200

@app.route('/sessions/<session_id>/suggest-places', methods=['POST'])
def suggest_places(session_id):
    """Suggest places to visit based on destination and duration"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'destination' not in data or 'duration' not in data:
        return jsonify({"error": "Destination and duration are required"}), 400
    
    travel_agent = session["travel_agent"]
    destination = data['destination']
    duration = data['duration']
    
    add_to_chat_history(session_id, "user", f"Suggest places in {destination} for {duration}")
    
    # Store the data in the agent's context
    travel_agent.context["destination"] = destination
    travel_agent.context["duration"] = duration
    
    query = f"""Suggest top attractions and places to visit in {destination} for a {duration} trip.

For each attraction you suggest:
1. Provide a brief description
2. Include the full name and location details
3. Number each suggestion for easy reference (at least 5-7 attractions)

IMPORTANT: DO NOT try to use any functions or tools in your response. Just list the attractions with descriptions.
I will automatically get coordinates for all locations after receiving your response."""
    
    response = travel_agent.agent.run(query)
    
    # Process the response to replace any function calls with actual results
    processed_response = process_function_calls(response.content)
    
    # Extract attraction names using regex - looking for numbered items with attraction names
    attraction_pattern = r'\d+\.\s+\*\*([^*:]+)(?:\*\*|:)'
    attractions = re.findall(attraction_pattern, processed_response)
    
    # Create a list to store attractions with coordinates
    attractions_with_coords = []
    
    for attraction in attractions:
        # Clean up the attraction name by removing any trailing asterisks and extra spaces
        attraction_name = attraction.strip()
        
        # Only add the destination if it's not already included in the attraction name
        if destination.lower() not in attraction_name.lower():
            location_query = f"{attraction_name}, {destination}"
        else:
            location_query = attraction_name
            
        # Call get_coordinates function directly
        coords_result = get_location_coordinates(location_query)
        
        # Add to our list
        attractions_with_coords.append({
            "name": attraction_name,
            "location_query": location_query,
            "coordinates": coords_result
        })
        
        # Add coordinates after the attraction's description paragraph in the response
        attraction_end = processed_response.find("\n\n", processed_response.find(attraction))
        if attraction_end == -1:  # If we can't find a double newline, find the next numbered item
            next_match = re.search(r'\d+\.\s+\*\*', processed_response[processed_response.find(attraction)+len(attraction):])
            if next_match:
                attraction_end = processed_response.find(attraction) + len(attraction) + next_match.start()
            else:
                attraction_end = len(processed_response)
        
        processed_response = processed_response[:attraction_end] + f"\n**Coordinates**: {coords_result}" + processed_response[attraction_end:]
    
    add_to_chat_history(session_id, "system", "Places suggestions", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "suggestions": processed_response,
        "destination": destination,
        "duration": duration,
        "attractions_with_coordinates": attractions_with_coords
    }), 200

@app.route('/sessions/<session_id>/select-places', methods=['POST'])
def select_places(session_id):
    """Store user-selected places in context"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'selected_places' not in data:
        return jsonify({"error": "Selected places are required"}), 400
    
    travel_agent = session["travel_agent"]
    selected_places = data['selected_places']
    
    add_to_chat_history(session_id, "user", f"Selected places: {selected_places}")
    travel_agent.context["selected_places"] = selected_places
    update_session_activity(session_id)
    
    return jsonify({
        "message": "Places selected successfully",
        "selected_places": selected_places
    }), 200

@app.route('/sessions/<session_id>/suggest-accommodations', methods=['POST'])
def suggest_accommodations(session_id):
    """Suggest accommodations based on selected places"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    travel_agent = session["travel_agent"]
    
    # Check if required context is available
    if "destination" not in travel_agent.context or "selected_places" not in travel_agent.context:
        return jsonify({"error": "Destination and selected places are required. Call /suggest-places and /select-places first"}), 400
    
    add_to_chat_history(session_id, "user", "Request for accommodation suggestions")
    
    selected_places = travel_agent.context.get("selected_places", "")
    destination = travel_agent.context.get("destination", "")
    
    query = f"""Based on the user's interest in places {selected_places} in {destination}, suggest accommodation options in different budget ranges (budget, mid-range, luxury) that are conveniently located near these attractions.
    
    For each accommodation:
    1. Provide name, description and approximate price range
    2. Mention its proximity to selected attractions
    3. Number each suggestion for easy reference (at least 3 options in different price ranges)
    
    IMPORTANT: DO NOT try to use any functions or tools in your response. Just list the accommodations with descriptions.
    I will automatically get coordinates for all locations after receiving your response."""
    
    response = travel_agent.agent.run(query)
    
    # Process the response to replace any function calls with actual results
    processed_response = process_function_calls(response.content)
    
    # Post-process to add coordinates to each accommodation
    # Extract hotel names using regex
    hotel_pattern = r'\d+\.\s+\*\*([^:]+)(?:\*\*|:)'
    hotels = re.findall(hotel_pattern, processed_response)
    
    for hotel in hotels:
        # If coordinates for this hotel aren't already in the response
        if f"{hotel}, {destination}" not in processed_response:
            coords = get_location_coordinates(f"{hotel}, {destination}")
            # Add coordinates after the hotel's description paragraph
            hotel_end = processed_response.find("\n\n", processed_response.find(hotel))
            if hotel_end == -1:  # If we can't find a double newline, find the next numbered item
                next_match = re.search(r'\d+\.\s+\*\*', processed_response[processed_response.find(hotel)+len(hotel):])
                if next_match:
                    hotel_end = processed_response.find(hotel) + len(hotel) + next_match.start()
                else:
                    hotel_end = len(processed_response)
            
            processed_response = processed_response[:hotel_end] + f"\n**Coordinates**: {coords}" + processed_response[hotel_end:]
    
    add_to_chat_history(session_id, "system", "Accommodation suggestions", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "accommodations": processed_response
    }), 200

@app.route('/sessions/<session_id>/select-accommodation', methods=['POST'])
def select_accommodation(session_id):
    """Store user-selected accommodation in context"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'selected_hotel' not in data:
        return jsonify({"error": "Selected hotel is required"}), 400
    
    travel_agent = session["travel_agent"]
    selected_hotel = data['selected_hotel']
    
    add_to_chat_history(session_id, "user", f"Selected accommodation: {selected_hotel}")
    travel_agent.context["selected_hotel"] = selected_hotel
    update_session_activity(session_id)
    
    return jsonify({
        "message": "Accommodation selected successfully",
        "selected_hotel": selected_hotel
    }), 200

@app.route('/sessions/<session_id>/create-itinerary', methods=['POST'])
def create_itinerary(session_id):
    """Create a detailed itinerary based on all selections"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    travel_agent = session["travel_agent"]
    
    # Check if required context is available
    required_keys = ["destination", "duration", "selected_places", "selected_hotel"]
    missing_keys = [key for key in required_keys if key not in travel_agent.context]
    
    if missing_keys:
        return jsonify({
            "error": f"Missing required information: {', '.join(missing_keys)}. Complete previous steps first."
        }), 400
    
    add_to_chat_history(session_id, "user", "Request to create itinerary")
    
    destination = travel_agent.context.get("destination", "")
    duration = travel_agent.context.get("duration", "")
    selected_places = travel_agent.context.get("selected_places", "")
    selected_hotel = travel_agent.context.get("selected_hotel", "")
    
    query = f"""Create a detailed {duration} itinerary for {destination} including:
    1. Day-by-day schedule visiting the places numbered {selected_places} that the user selected
    2. Accommodation at hotel option {selected_hotel}
    3. Transportation recommendations between attractions
    4. Meal suggestions including local cuisine
    5. Estimated budget breakdown for the entire trip
    
    IMPORTANT: DO NOT try to use any functions or tools in your response. Just create the itinerary.
    I will automatically add coordinates to the itinerary later.
    
    Organize by day and include estimated times for activities."""
    
    response = travel_agent.agent.run(query)
    
    # Process the response to replace any function calls with actual results
    processed_response = process_function_calls(response.content)
    
    add_to_chat_history(session_id, "system", "Generated itinerary", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "itinerary": processed_response
    }), 200

@app.route('/sessions/<session_id>/find-transportation-options', methods=['POST'])
def find_transportation_options(session_id):
    """Find transportation options between destinations"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'itinerary' not in data:
        return jsonify({"error": "Itinerary is required"}), 400
    
    booking_agent = session["booking_agent"]
    itinerary = data['itinerary']
    origin = (data.get('origin') or booking_agent.context.get('origin') or 'Pune').strip() or 'Pune'
    transport_mode = (data.get('transport_mode') or booking_agent.context.get('transport_mode') or 'mixed').strip().lower()
    max_budget_inr = data.get('max_budget_inr')
    
    add_to_chat_history(session_id, "user", "Request for transportation options")
    booking_agent.context["itinerary"] = itinerary
    booking_agent.context["origin"] = origin
    booking_agent.context["transport_mode"] = transport_mode
    booking_agent.context["max_budget_inr"] = max_budget_inr

    allowed_modes = {
        "mixed": "any of: train, bus, flight, car/taxi (pick cheapest + sensible)",
        "train": "train only",
        "bus": "bus only",
        "flight": "flight only",
        "car": "car/taxi only (self-drive or cab)",
    }
    mode_rule = allowed_modes.get(transport_mode, allowed_modes["mixed"])
    budget_rule = "" if max_budget_inr in (None, "") else f"Try to keep total transportation cost within approx INR {max_budget_inr}. If impossible, explain the closest option."
    
    query = f"""Based on the following itinerary, recommend transportation options.

    The traveler starts from: {origin}

    TRANSPORT MODE CONSTRAINT (must follow strictly): {mode_rule}
    - If mode is train/bus/car, DO NOT include flights anywhere.
    - If mode is flight, do not include trains/buses/cars.
    {budget_rule}

    Include the first leg from the origin to the first destination, then cover transportation between each destination:
    {itinerary}
    
    For each leg of the journey:
    1. Recommend 2-4 concrete options that match the mode constraint
    2. Find the websites where these can be booked
    3. Include approximate costs in INR, duration, and (if applicable) timing/frequency
    4. Rank options by cost (cheapest first), then convenience
    
    Format your response by journey leg (e.g., "Origin to City A", "City A to City B") and include direct links to booking websites."""
    
    response = booking_agent.agent.run(query)
    
    # Process any function calls that might be in the response
    processed_response = process_function_calls(response.content)
    
    add_to_chat_history(session_id, "system", "Transportation options", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "transportation_options": processed_response
    }), 200

@app.route('/sessions/<session_id>/find-accommodation-options', methods=['POST'])
def find_accommodation_options(session_id):
    """Find accommodation options for each destination"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    booking_agent = session["booking_agent"]

    data = request.json or {}
    itinerary_from_body = data.get('itinerary')
    origin = data.get('origin')
    transport_mode = data.get('transport_mode')
    max_budget_inr = data.get('max_budget_inr')
    if itinerary_from_body:
        booking_agent.context["itinerary"] = itinerary_from_body
    if origin:
        booking_agent.context["origin"] = origin
    if transport_mode:
        booking_agent.context["transport_mode"] = transport_mode
    if max_budget_inr is not None:
        booking_agent.context["max_budget_inr"] = max_budget_inr
    
    if "itinerary" not in booking_agent.context:
        return jsonify({"error": "Itinerary is required"}), 400
    
    add_to_chat_history(session_id, "user", "Request for accommodation booking options")
    
    itinerary = booking_agent.context.get("itinerary", "")
    
    query = f"""Based on the following itinerary, search for and recommend accommodation options at each destination:
    {itinerary}
    
    For each destination where the traveler will stay overnight:
    1. Search for hotel options in different price ranges (budget, mid-range, luxury)
    2. Find the official websites or booking platforms where these accommodations can be reserved
    3. Include approximate nightly rates, key amenities, and location advantages
    4. Note any special deals or promotions currently available
    
    Format your response by destination and include direct links to booking websites for each recommended accommodation."""
    
    response = booking_agent.agent.run(query)
    
    # Process any function calls that might be in the response
    processed_response = process_function_calls(response.content)
    
    add_to_chat_history(session_id, "system", "Accommodation booking options", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "accommodation_options": processed_response
    }), 200

@app.route('/sessions/<session_id>/find-local-transportation', methods=['POST'])
def find_local_transportation(session_id):
    """Find local transportation options within each destination"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    booking_agent = session["booking_agent"]

    data = request.json or {}
    itinerary_from_body = data.get('itinerary')
    origin = data.get('origin')
    transport_mode = data.get('transport_mode')
    max_budget_inr = data.get('max_budget_inr')
    if itinerary_from_body:
        booking_agent.context["itinerary"] = itinerary_from_body
    if origin:
        booking_agent.context["origin"] = origin
    if transport_mode:
        booking_agent.context["transport_mode"] = transport_mode
    if max_budget_inr is not None:
        booking_agent.context["max_budget_inr"] = max_budget_inr
    
    if "itinerary" not in booking_agent.context:
        return jsonify({"error": "Itinerary is required"}), 400
    
    add_to_chat_history(session_id, "user", "Request for local transportation options")
    
    itinerary = booking_agent.context.get("itinerary", "")
    
    query = f"""Based on the following itinerary, search for and recommend local transportation options within each destination:
    {itinerary}
    
    For each destination:
    1. Search for public transportation options (metro, bus, tram, etc.)
    2. Find information about ride-sharing services or taxis
    3. Look for any transportation passes or cards that might save money
    4. Include websites where tickets or passes can be purchased in advance
    5. Mention transportation options between key attractions mentioned in the itinerary
    
    Format your response by destination and include direct links to official transportation websites or apps."""
    
    response = booking_agent.agent.run(query)
    
    # Process any function calls that might be in the response
    processed_response = process_function_calls(response.content)
    
    add_to_chat_history(session_id, "system", "Local transportation options", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "local_transportation": processed_response
    }), 200

@app.route('/sessions/<session_id>/create-comprehensive-plan', methods=['POST'])
def create_comprehensive_plan(session_id):
    """Create a comprehensive travel and booking plan"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    booking_agent = session["booking_agent"]

    data = request.json or {}
    itinerary_from_body = data.get('itinerary')
    origin = data.get('origin')
    transport_mode = data.get('transport_mode')
    max_budget_inr = data.get('max_budget_inr')
    if itinerary_from_body:
        booking_agent.context["itinerary"] = itinerary_from_body
    if origin:
        booking_agent.context["origin"] = origin
    if transport_mode:
        booking_agent.context["transport_mode"] = transport_mode
    if max_budget_inr is not None:
        booking_agent.context["max_budget_inr"] = max_budget_inr
    
    if "itinerary" not in booking_agent.context:
        return jsonify({"error": "Itinerary is required"}), 400
    
    add_to_chat_history(session_id, "user", "Request for comprehensive travel plan")
    
    itinerary = booking_agent.context.get("itinerary", "")
    origin_city = (booking_agent.context.get("origin") or "Pune").strip() or "Pune"
    transport_mode_effective = (booking_agent.context.get("transport_mode") or "mixed").strip().lower()
    max_budget_effective = booking_agent.context.get("max_budget_inr")
    allowed_modes = {
        "mixed": "any of: train, bus, flight, car/taxi (pick cheapest + sensible)",
        "train": "train only",
        "bus": "bus only",
        "flight": "flight only",
        "car": "car/taxi only (self-drive or cab)",
    }
    mode_rule = allowed_modes.get(transport_mode_effective, allowed_modes["mixed"])
    budget_rule = "" if max_budget_effective in (None, "") else f"Try to keep total transportation cost within approx INR {max_budget_effective}. If impossible, explain the closest option."
    
    query = f"""Create a comprehensive travel and booking plan based on this itinerary:
    {itinerary}

    The traveler starts from: {origin_city}

    TRANSPORT MODE CONSTRAINT (must follow strictly): {mode_rule}
    - If mode is train/bus/car, DO NOT include flights anywhere.
    - If mode is flight, do not include trains/buses/cars.
    {budget_rule}
    
    Include:
    1. A complete day-by-day breakdown with all transportation and accommodation recommendations
    2. Direct booking links for each recommended service
    3. A suggested booking timeline (which bookings should be made first)
    4. Estimated total budget for transportation and accommodations
    5. Tips for getting the best deals on the recommended services
    
    Format this as a complete travel booking guide that the traveler can follow step by step."""
    
    response = booking_agent.agent.run(query)
    
    # Process any function calls that might be in the response
    processed_response = process_function_calls(response.content)
    
    add_to_chat_history(session_id, "system", "Comprehensive travel plan", processed_response)
    update_session_activity(session_id)
    
    return jsonify({
        "comprehensive_plan": processed_response
    }), 200

@app.route('/sessions/<session_id>/reset', methods=['POST'])
def reset_session_context(session_id):
    """Reset the context for a specific session"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    # Reset the contexts but keep the chat history
    session["travel_agent"].context = {}
    session["booking_agent"].context = {}
    
    add_to_chat_history(session_id, "system", "Session context reset")
    update_session_activity(session_id)
    
    return jsonify({
        "message": "Session context reset successfully"
    }), 200

@app.route('/sessions/<session_id>/chat', methods=['POST'])
def add_chat_message(session_id):
    """Add a message to the chat history"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404
    
    data = request.json
    if not data or 'message' not in data or 'source' not in data:
        return jsonify({"error": "Message and source are required"}), 400
    
    message = data['message']
    source = data['source']
    response = data.get('response', None)
    
    add_to_chat_history(session_id, source, message, response)
    update_session_activity(session_id)
    
    return jsonify({
        "message": "Chat message added successfully"
    }), 201


@app.route('/sessions/<session_id>/load-context', methods=['POST'])
def load_planner_context(session_id):
    """Load itinerary context into the session/agents without exposing it in chat history."""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    data = request.json or {}
    itinerary = data.get('itinerary')
    destination = data.get('destination')
    duration = data.get('duration')
    origin = data.get('origin')

    session['current_itinerary'] = itinerary
    if origin:
        session['current_location'] = origin

    try:
        if destination:
            session['travel_agent'].context['destination'] = destination
            session['booking_agent'].context['destination'] = destination
        if duration:
            session['travel_agent'].context['duration'] = duration
            session['booking_agent'].context['duration'] = duration
        if itinerary:
            session['travel_agent'].context['current_itinerary'] = itinerary
            session['booking_agent'].context['current_itinerary'] = itinerary
    except Exception as e:
        return jsonify({"error": f"Failed to load context: {str(e)}"}), 500

    update_session_activity(session_id)
    return jsonify({"success": True, "message": "Context loaded"}), 200


@app.route('/sessions/<session_id>/update-mood', methods=['POST'])
def update_mood(session_id):
    """Update current mood/state for live itinerary adjustments"""
    session = get_session(session_id)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    data = request.json
    if not data or 'mood_state' not in data:
        return jsonify({"error": "Mood state is required"}), 400

    mood_state = data['mood_state']
    current_time = data.get('current_time', datetime.now().strftime("%H:%M"))
    current_location = data.get('current_location', session.get('current_location', 'Current location'))

    session['current_mood'] = mood_state
    session['current_time'] = current_time
    session['current_location'] = current_location

    add_to_chat_history(session_id, "user", f"Mood update: {mood_state} at {current_time}")
    update_session_activity(session_id)

    return jsonify({
        "message": "Mood state updated successfully",
        "mood_state": mood_state,
        "current_time": current_time,
        "current_location": current_location
    }), 200


@app.route('/sessions/<session_id>/adjust-itinerary', methods=['POST'])
def adjust_itinerary(session_id):
    """Dynamically adjust itinerary based on current mood and situation"""
    print(f"[DEBUG] Adjust itinerary called for session: {session_id}")
    
    session = get_session(session_id)
    if not session:
        print(f"[ERROR] Session not found: {session_id}")
        return jsonify({"error": "Session not found"}), 404

    data = request.json
    print(f"[DEBUG] Request data: {data}")
    
    if not data or 'current_itinerary' not in data or 'mood_state' not in data:
        print(f"[ERROR] Missing required fields in request")
        return jsonify({"error": "Current itinerary and mood state are required"}), 400

    live_agent = session["live_itinerary_agent"]
    current_itinerary = data['current_itinerary']
    mood_state = data['mood_state']
    current_time = data.get('current_time', datetime.now().strftime("%H:%M"))
    current_location = data.get('current_location', session.get('current_location', 'Current location'))

    print(f"[DEBUG] Adjusting itinerary - Mood: {mood_state}, Time: {current_time}, Location: {current_location}")

    session['current_itinerary'] = current_itinerary

    add_to_chat_history(session_id, "user", f"Request to adjust itinerary based on mood: {mood_state}")

    try:
        result = live_agent.adjust_itinerary(
            current_itinerary=current_itinerary,
            mood_state=mood_state,
            current_time=current_time,
            current_location=current_location
        )

        print(f"[DEBUG] Adjustment result: {result}")

        session['current_itinerary'] = result.get('updated_schedule', current_itinerary)

        add_to_chat_history(session_id, "system", "Itinerary adjusted", result)
        update_session_activity(session_id)

        return jsonify({
            "message": "Itinerary adjusted successfully",
            "result": result
        }), 200

    except Exception as e:
        print(f"[ERROR] Exception in adjust_itinerary: {str(e)}")
        import traceback
        traceback.print_exc()
        add_to_chat_history(session_id, "system", f"Error adjusting itinerary: {str(e)}")
        return jsonify({
            "error": "Failed to adjust itinerary",
            "details": str(e)
        }), 500

@app.route('/cleanup-sessions', methods=['POST'])
def cleanup_old_sessions():
    """Admin endpoint to clean up old sessions"""
    # Optional: Add authentication for this endpoint
    
    data = request.json
    hours = data.get('hours', 24) if data else 24
    
    # Calculate cutoff time
    cutoff = datetime.now()
    cutoff = cutoff.replace(hour=cutoff.hour - hours)
    
    # Find sessions older than cutoff
    old_sessions = []
    for session_id, session_data in list(sessions.items()):
        last_active = datetime.fromisoformat(session_data["last_active"])
        if last_active < cutoff:
            old_sessions.append(session_id)
            del sessions[session_id]
    
    return jsonify({
        "message": f"Cleaned up {len(old_sessions)} old sessions",
        "removed_sessions": old_sessions
    }), 200


@app.route('/mock-booking/create', methods=['POST'])
def mock_booking_create():
    """Mock-only booking creation endpoint."""
    data = request.json or {}
    selections = data.get("selections", [])
    total_amount = sum(float(item.get("amount", 0)) for item in selections if isinstance(item, dict))
    booking_id = f"mock_{uuid.uuid4().hex[:10]}"
    mock_bookings[booking_id] = {
        "id": booking_id,
        "trip_id": data.get("trip_id"),
        "selections": selections,
        "total_amount": total_amount,
        "status": "pending",
        "currency": str(data.get("currency", "INR")),
        "created_at": datetime.now().isoformat(),
    }
    return jsonify({
        "booking_id": booking_id,
        "status": "pending",
        "total_amount": total_amount,
        "currency": "INR",
        "mode": "mock"
    }), 201


@app.route('/mock-booking/pay/<booking_id>', methods=['POST'])
def mock_booking_pay(booking_id):
    """Mock-only payment confirmation endpoint."""
    booking = mock_bookings.get(booking_id)
    if not booking:
        return jsonify({"error": "Booking not found"}), 404

    booking["status"] = "confirmed"
    booking["confirmation_number"] = f"VH-MOCK-{uuid.uuid4().hex[:8].upper()}"
    booking["paid_at"] = datetime.now().isoformat()

    return jsonify({
        "booking_id": booking_id,
        "status": booking["status"],
        "confirmation_number": booking["confirmation_number"],
        "mode": "mock"
    }), 200

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
