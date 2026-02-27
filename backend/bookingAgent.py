from phi.agent import Agent
from phi.model.groq import Groq
from phi.utils.pprint import pprint_run_response
from phi.tools.duckduckgo import DuckDuckGo
from dotenv import load_dotenv
import os
load_dotenv()
class TravelOptionsFinder:
    def __init__(self):
        self.agent = Agent(
            model=Groq(
                id="llama-3.3-70b-versatile",
                api_key= "",
                max_tokens=10000
            ),
            markdown=True,
            tools=[DuckDuckGo()],
            description="You are a specialized travel consultant who finds the best transportation and accommodation options for travelers based on their itineraries.",
            instructions=[
                """Your role is to help users find the best travel options and accommodations for their planned trips:
                
                1. Analyze the user's itinerary to understand their travel route and needs
                2. Search for and recommend the best transportation options (flights, trains, buses, etc.) between destinations
                3. Find suitable hotels/accommodations at each stay location with links to booking websites
                4. Provide practical information about transportation between attractions at each destination
                5. Ensure all recommendations include:
                   - Direct links to official booking websites
                   - Approximate price ranges
                   - Key features and benefits
                   - User ratings/reviews when available
                
                Always use the search tool to find current information about transportation options, hotels, and booking platforms.
                Organize your recommendations clearly by destination and date.
                """
            ],
            show_tool_calls=True,
            add_datetime_to_instructions=True,
        )
        self.context = {}
        
    def find_transportation_options(self, itinerary, origin=None, transport_mode="mixed", max_budget_inr=None):
        """Find best transportation options from origin to the itinerary's first destination and between destinations."""
        origin_city = (origin or self.context.get("origin") or "Pune").strip() or "Pune"
        transport_mode_effective = (transport_mode or self.context.get("transport_mode") or "mixed").strip().lower()
        max_budget_effective = max_budget_inr if max_budget_inr is not None else self.context.get("max_budget_inr")

        allowed_modes = {
            "mixed": "any of: train, bus, flight, car/taxi (pick cheapest + sensible)",
            "train": "train only",
            "bus": "bus only",
            "flight": "flight only",
            "car": "car/taxi only (self-drive or cab)",
        }
        mode_rule = allowed_modes.get(transport_mode_effective, allowed_modes["mixed"])
        budget_rule = "" if max_budget_effective in (None, "") else f"Try to keep total transportation cost within approx INR {max_budget_effective}. If impossible, explain the closest option."

        query = f"""Based on the following itinerary, recommend SPECIFIC transportation options with REAL booking links.

        The traveler starts from: {origin_city}

        TRANSPORT MODE CONSTRAINT (must follow strictly): {mode_rule}
        - If mode is train/bus/car, DO NOT include flights anywhere.
        - If mode is flight, do not include trains/buses/cars.
        {budget_rule}

        ITINERARY:
        {itinerary}
        
        CRITICAL REQUIREMENTS - You MUST include ALL of these for EACH option:
        1. EXACT train/bus/flight numbers or service names (e.g., "Shatabdi Express 12027", "IndiGo 6E-123")
        2. SPECIFIC departure and arrival times (e.g., "Departs 06:15, Arrives 11:30")
        3. ACTUAL booking websites with FULL URLs (e.g., "https://www.irctc.co.in", "https://www.makemytrip.com")
        4. REAL price ranges in INR (e.g., "₹800-1200 for Sleeper class")
        5. Duration of journey (e.g., "5 hours 15 minutes")
        6. Frequency (e.g., "Daily service" or "3 trains per day")
        
        SEARCH REQUIREMENTS:
        - Use DuckDuckGo to find CURRENT, REAL transportation options
        - Search for "{origin_city} to [destination] {transport_mode_effective}"
        - Include multiple options per route (at least 2-3)
        - Verify booking websites are legitimate and active
        
        EXAMPLE OF GOOD OUTPUT:
        ## Origin to Gokarna
        
        ### By Train
        **Train from Pune to Kumta, then taxi/bus from Kumta to Gokarna**
        - Take a train from Pune to Kumta, and then take a taxi or bus from Kumta to Gokarna.
        - Approximate cost: ₹800 - ₹1,200
        - Duration: 12-14 hours (train) + 1-2 hours (taxi/bus)
        - Frequency: Multiple trains per day
        - Booking website: Indian Railways (https://www.irctc.co.in)
        
        Format your response by journey leg and include ALL required details for EACH option."""
        
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
        # Store itinerary in context
        self.context["itinerary"] = itinerary
        self.context["origin"] = origin_city
        self.context["transport_mode"] = transport_mode_effective
        self.context["max_budget_inr"] = max_budget_effective
        
        return self.context
    
    def find_accommodation_options(self):
        """Find accommodation options for each destination in the itinerary"""
        itinerary = self.context.get("itinerary", "")
        
        query = f"""Based on the following itinerary, search for and recommend SPECIFIC accommodation options with REAL booking links.
        
        ITINERARY:
        {itinerary}
        
        CRITICAL REQUIREMENTS - You MUST include ALL of these for EACH hotel:
        1. EXACT hotel name and address (e.g., "Zostel Gokarna, Near Om Beach, Gokarna")
        2. SPECIFIC nightly rates in INR (e.g., "₹800-1200 per night")
        3. ACTUAL booking website URLs (e.g., "https://www.booking.com/hotel/in/zostel-gokarna.html")
        4. Key amenities (e.g., "Free Wi-Fi, AC Rooms, Restaurant, Bar")
        5. Location details (e.g., "Close to Om Beach, walking distance to beaches")
        6. User ratings if available (e.g., "4.2/5 on Booking.com")
        
        SEARCH REQUIREMENTS:
        - Use DuckDuckGo to find REAL hotels at each destination
        - Search for "hotels in [destination] booking"
        - Include options in different price ranges:
          * Budget: ₹500-1500 per night (hostels, budget hotels)
          * Mid-Range: ₹1500-4000 per night
          * Luxury: ₹4000+ per night
        - Provide at least 2-3 options per price range
        
        EXAMPLE OF GOOD OUTPUT:
        ## Gokarna Accommodations
        
        ### Budget Options
        **Zostel Gokarna** - A popular choice among backpackers and budget travelers.
        - Nightly Rate: Approx. ₹800 - ₹1,200
        - Amenities: Dorms, Private Rooms, Common Lounge, Free Wi-Fi
        - Location: Close to Om Beach, easy access to other beaches and eateries
        - Booking: Zostel Website (https://www.zostel.com/zostel/gokarna/)
        
        Format your response by destination and price range with ALL required details."""
        
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
        return self.context
    
    def find_local_transportation(self):
        """Find local transportation options within each destination"""
        itinerary = self.context.get("itinerary", "")
        
        query = f"""Based on the following itinerary, search for and recommend local transportation options within each destination:
        {itinerary}
        
        For each destination:
        1. Search for public transportation options (metro, bus, tram, etc.)
        2. Find information about ride-sharing services or taxis
        3. Look for any transportation passes or cards that might save money
        4. Include websites where tickets or passes can be purchased in advance
        5. Mention transportation options between key attractions mentioned in the itinerary
        
        Format your response by destination and include direct links to official transportation websites or apps."""
        
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
        return self.context
    
    def create_comprehensive_plan(self, origin=None, transport_mode="mixed", max_budget_inr=None):
        """Create a comprehensive travel and booking plan"""
        itinerary = self.context.get("itinerary", "")
        origin_city = (origin or self.context.get("origin") or "Pune").strip() or "Pune"
        transport_mode_effective = (transport_mode or self.context.get("transport_mode") or "mixed").strip().lower()
        max_budget_effective = max_budget_inr if max_budget_inr is not None else self.context.get("max_budget_inr")

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
        
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
    
    def run(self):
        """Run the travel options finder workflow"""
        print("Welcome to the Travel Options and Booking Finder!")
        print("Please enter your travel itinerary with destinations, dates, and key attractions:")
        itinerary = """
Trip to Japan: May 15-25, 2025
- Tokyo (May 15-18): Visit Tokyo Tower, Senso-ji Temple, Shibuya Crossing
- Kyoto (May 19-22): Visit Fushimi Inari Shrine, Kinkaku-ji, Arashiyama Bamboo Grove
- Osaka (May 23-25): Visit Osaka Castle, Dotonbori, Universal Studios Japan
"""
        
        # Step 1: Find transportation options between destinations
        self.find_transportation_options(itinerary)
        
        # Step 2: Find accommodation options
        self.find_accommodation_options()
        
        # Step 3: Find local transportation options
        self.find_local_transportation()
        
        # Step 4: Create comprehensive plan
        self.create_comprehensive_plan()
        
        print("\nYour travel booking plan is complete!")

# Example usage
if __name__ == "__main__":
    options_finder = TravelOptionsFinder()
    options_finder.run()

# Example input itinerary:
"""
Trip to Japan: May 15-25, 2025
- Tokyo (May 15-18): Visit Tokyo Tower, Senso-ji Temple, Shibuya Crossing
- Kyoto (May 19-22): Visit Fushimi Inari Shrine, Kinkaku-ji, Arashiyama Bamboo Grove
- Osaka (May 23-25): Visit Osaka Castle, Dotonbori, Universal Studios Japan
"""