import Link from 'next/link';
import { MapPin } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-foreground text-background border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 font-bold text-lg">
              <MapPin className="w-5 h-5" />
              <span>TravelHub</span>
            </div>
            <p className="text-sm opacity-80">
              Your ultimate travel companion for discovering, planning, and booking unforgettable journeys.
            </p>
          </div>

          {/* Explore */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Explore</h3>
            <ul className="space-y-2 text-sm opacity-80">
              <li>
                <Link href="/hotels" className="hover:opacity-100 transition">
                  Search Hotels
                </Link>
              </li>
              <li>
                <Link href="/trips" className="hover:opacity-100 transition">
                  My Trips
                </Link>
              </li>
              <li>
                <Link href="/" className="hover:opacity-100 transition">
                  Popular Destinations
                </Link>
              </li>
            </ul>
          </div>

          {/* Account */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Account</h3>
            <ul className="space-y-2 text-sm opacity-80">
              <li>
                <Link href="/account" className="hover:opacity-100 transition">
                  My Account
                </Link>
              </li>
              <li>
                <Link href="/bookings" className="hover:opacity-100 transition">
                  Bookings
                </Link>
              </li>
              <li>
                <Link href="/account#settings" className="hover:opacity-100 transition">
                  Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="flex flex-col gap-4">
            <h3 className="font-semibold">Support</h3>
            <ul className="space-y-2 text-sm opacity-80">
              <li>
                <a href="mailto:support@travelhub.com" className="hover:opacity-100 transition">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:opacity-100 transition">
                  FAQ
                </a>
              </li>
              <li>
                <a href="#" className="hover:opacity-100 transition">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/20 pt-8 text-center text-sm opacity-60">
          <p>&copy; 2026 TravelHub. All rights reserved. Built for the TBO Hackathon.</p>
        </div>
      </div>
    </footer>
  );
}
