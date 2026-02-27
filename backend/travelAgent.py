from phi.agent import Agent
# from phi.playground import Playground, serve_playground_app
from phi.tools.calculator import Calculator
from phi.model.groq import Groq
from phi.agent import Agent, RunResponse
from phi.utils.pprint import pprint_run_response
from typing import Iterator, List, Dict, Any
from phi.tools.duckduckgo import DuckDuckGo
from phi.tools.newspaper4k import Newspaper4k
from dotenv import load_dotenv
import os

load_dotenv()
class InteractiveTravelAgent:
    def __init__(self):
        api_key_groq = os.getenv("GROQ_API_KEY")
        self.agent = Agent(
            model=Groq(
                id="llama-3.3-70b-versatile",
                # api_key={api_key_groq},                
                api_key= "",
                max_tokens=6000
            ),
            markdown=True,
            tools=[
                DuckDuckGo(), 
                Newspaper4k(),
                Calculator(
                    add=True,
                    subtract=True,
                    multiply=True,
                    divide=True,
                    exponentiate=True,
                    factorial=True,
                    is_prime=True,
                    square_root=True,
                )
            ],
            description="You are a seasoned travel agent or trip itinerary planner specializing in crafting seamless, personalized travel experiences.",
            instructions=[
                """Your role is to guide the user through an interactive trip planning process with these steps:
                
                1. First, research and suggest most popular attractions/places in the requested destination
                2. Ask the user to select which places they're interested in visiting from your suggestions
                3. Based on their selections, recommend hotels/accommodations in different budget ranges
                4. Ask the user to select their preferred accommodation
                5. Finally, create a detailed day-by-day itinerary including all selected places, accommodations, transportation options, and budget estimates
                
                At each step, provide relevant information and wait for user input before proceeding to the next step.
                Remember to use search tools to get up-to-date information about attractions, hotels, and other details.
                When calculating budgets, break down costs for accommodation, meals, transportation, and activities.
                """
            ],
            show_tool_calls=True,
            add_datetime_to_instructions=True,
        )
        self.context = {}
        
    def suggest_places(self, destination, duration):
        """Step 1: Suggest places to visit based on destination and duration"""
        query = f"Suggest top attractions and places to visit in {destination} for a {duration} trip"
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
        # Store destination and duration in context
        self.context["destination"] = destination
        self.context["duration"] = duration
        
        # After this function runs, collect user input about which places they want to visit
        selected_places = input("\nPlease enter the numbers of the places you want to visit (comma-separated, e.g., 1,3,5): ")
        self.context["selected_places"] = selected_places
        return selected_places
    
    def suggest_accommodations(self):
        """Step 2: Suggest accommodations based on selected places"""
        selected_places = self.context.get("selected_places", "")
        destination = self.context.get("destination", "")
        
        query = f"Based on the user's interest in places {selected_places} in {destination}, suggest accommodation options in different budget ranges (budget, mid-range, luxury) that are conveniently located near these attractions."
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
        # After this function runs, collect user input about preferred accommodation
        selected_hotel = input("\nPlease enter the number of your preferred accommodation: ")
        self.context["selected_hotel"] = selected_hotel
        return selected_hotel
    
    def create_itinerary(self):
        """Step 3: Create a detailed itinerary based on all selections"""
        destination = self.context.get("destination", "")
        duration = self.context.get("duration", "")
        selected_places = self.context.get("selected_places", "")
        selected_hotel = self.context.get("selected_hotel", "")
        
        query = f"""Create a detailed {duration} itinerary for {destination} from Pune including:
        1. Day-by-day schedule visiting the places numbered {selected_places} that the user selected
        2. Accommodation at hotel option {selected_hotel}
        3. Transportation recommendations between attractions
        4. Meal suggestions including local cuisine
        5. Estimated budget breakdown for the entire trip
        
        Organize by day and include estimated times for activities."""
        
        response_stream = self.agent.run(query, stream=True)
        pprint_run_response(response_stream, markdown=True, show_time=True)
        
    def run(self):
        """Run the interactive travel agent workflow"""
        print("Welcome to the Interactive Travel Planner!")
        destination = input("Enter your destination: ")
        duration = input("Enter the duration of your trip (e.g., 3 days): ")
        
        # Step 1: Suggest places
        self.suggest_places(destination, duration)
        
        # Step 2: Suggest accommodations based on selected places
        self.suggest_accommodations()
        
        # Step 3: Create detailed itinerary
        self.create_itinerary()
        
        print("\nYour travel planning is complete! Enjoy your trip!")

# Example usage
if __name__ == "__main__":
    travel_agent = InteractiveTravelAgent()
    travel_agent.run()

# To launch as a web app, uncomment these lines:
# playground = Playground(agents=[travel_agent.agent], name="Interactive Travel Planner")
# serve_playground_app(playground, host="0.0.0.0", port=8000)